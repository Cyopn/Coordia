import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { SessionStatus } from '@prisma/client';
import { Request, Response } from 'express';
import { PrismaService } from '../../common/database/prisma.service';
import { EmailService } from '../email/email.service';
import { TokenService } from './token.service';

@Injectable()
export class SessionService {
  private readonly cookieName =
    process.env.SESSION_COOKIE_NAME ?? 'coordia_session';
  private readonly deviceCookieName =
    process.env.DEVICE_COOKIE_NAME ?? 'coordia_device';

  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(TokenService)
    private readonly tokens: TokenService,
    @Inject(EmailService)
    private readonly email: EmailService,
  ) {}

  async create(
    userId: string,
    request: Request,
    response: Response,
  ): Promise<{ isNewDevice: boolean }> {
    const rawToken = this.tokens.createToken();
    const rawDevice = request.cookies?.[this.deviceCookieName] as string | undefined;
    const deviceToken = rawDevice ?? this.tokens.createToken();
    const deviceHash = this.tokens.hash(deviceToken);
    const existingDevice = await this.prisma.trustedDevice.findFirst({
      where: {
        userId,
        identifierHash: deviceHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!existingDevice) {
      await this.prisma.trustedDevice.create({
        data: {
          userId,
          identifierHash: deviceHash,
          expiresAt: new Date(Date.now() + 30 * 86400000),
          label: request.get('user-agent')?.slice(0, 120),
        },
      });
    }
    const now = Date.now();
    const expiresAt = new Date(
      now + Number(process.env.SESSION_MAX_HOURS ?? 12) * 60 * 60 * 1000,
    );
    await this.prisma.session.create({
      data: {
        userId,
        tokenHash: this.tokens.hash(rawToken),
        expiresAt,
        ipAddressHash: request.ip ? this.tokens.hash(request.ip) : undefined,
        userAgent: request.get('user-agent')?.slice(0, 2048),
      },
    });
    response.cookie(this.cookieName, rawToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: expiresAt,
      path: '/',
    });
    response.cookie(this.deviceCookieName, deviceToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 86400000,
      path: '/',
    });
    await this.prisma.securityEvent.create({
      data: {
        actorId: userId,
        eventType: existingDevice ? 'device.recognized' : 'device.new',
        severity: existingDevice ? 'LOW' : 'MEDIUM',
        metadata: { userAgent: request.get('user-agent')?.slice(0, 120) },
      },
    });
    if (
      !existingDevice &&
      process.env.EMAILJS_GENERAL_TEMPLATE_ID &&
      process.env.EMAILJS_SERVICE_ID &&
      process.env.EMAILJS_PUBLIC_KEY &&
      process.env.EMAILJS_PRIVATE_KEY
    ) {
      const user = await this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { email: true },
      });
      await this.email.sendNewDeviceAlert(
        user.email,
        request.get('user-agent')?.slice(0, 120) ?? 'desconocido',
      );
    }
    return { isNewDevice: !existingDevice };
  }

  async requireUser(request: Request): Promise<string> {
    const rawToken = request.cookies?.[this.cookieName] as string | undefined;
    if (!rawToken) throw new UnauthorizedException('Sesión no válida');
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: this.tokens.hash(rawToken) },
    });
    if (
      !session ||
      session.status !== SessionStatus.ACTIVE ||
      session.expiresAt <= new Date()
    ) {
      throw new UnauthorizedException('Sesión no válida');
    }
    const idleLimit =
      Number(process.env.SESSION_IDLE_MINUTES ?? 30) * 60 * 1000;
    if (session.lastActivityAt.getTime() + idleLimit <= Date.now()) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { status: SessionStatus.EXPIRED },
      });
      throw new UnauthorizedException('Sesión no válida');
    }
    await this.prisma.session.update({
      where: { id: session.id },
      data: { lastActivityAt: new Date() },
    });
    return session.userId;
  }

  async revoke(request: Request, response: Response): Promise<void> {
    const rawToken = request.cookies?.[this.cookieName] as string | undefined;
    if (rawToken) {
      await this.prisma.session.updateMany({
        where: { tokenHash: this.tokens.hash(rawToken), status: SessionStatus.ACTIVE },
        data: { status: SessionStatus.REVOKED, revokedAt: new Date() },
      });
    }
    response.clearCookie(this.cookieName, { httpOnly: true, sameSite: 'lax', path: '/' });
  }

  async list(request: Request) {
    const userId = await this.requireUser(request);
    return this.prisma.session.findMany({
      where: { userId, status: SessionStatus.ACTIVE, expiresAt: { gt: new Date() } },
      select: {
        id: true,
        createdAt: true,
        lastActivityAt: true,
        expiresAt: true,
        deviceLabel: true,
        userAgent: true,
      },
      orderBy: { lastActivityAt: 'desc' },
    });
  }

  async revokeById(sessionId: string, request: Request): Promise<void> {
    const userId = await this.requireUser(request);
    const result = await this.prisma.session.updateMany({
      where: { id: sessionId, userId, status: SessionStatus.ACTIVE },
      data: { status: SessionStatus.REVOKED, revokedAt: new Date() },
    });
    if (result.count === 0) throw new UnauthorizedException('Sesión no válida');
  }

  async revokeOthers(request: Request): Promise<void> {
    const userId = await this.requireUser(request);
    const rawToken = request.cookies?.[this.cookieName] as string | undefined;
    if (!rawToken) throw new UnauthorizedException('Sesión no válida');
    await this.prisma.session.updateMany({
      where: {
        userId,
        status: SessionStatus.ACTIVE,
        NOT: { tokenHash: this.tokens.hash(rawToken) },
      },
      data: { status: SessionStatus.REVOKED, revokedAt: new Date() },
    });
  }
}
