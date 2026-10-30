import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  forwardRef,
  Inject,
} from '@nestjs/common';
import { Prisma, TokenType, UserStatus } from '@prisma/client';
import { Request, Response } from 'express';
import { PrismaService } from '../../common/database/prisma.service';
import { EmailService } from '../email/email.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AuthThrottleService } from './auth-throttle.service';
import { RequestEmailChangeDto } from './dto/request-email-change.dto';
import { ConfirmEmailChangeDto } from './dto/confirm-email-change.dto';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { TokenService } from './token.service';
import { MfaService } from '../mfa/mfa.service';

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(PasswordService)
    private readonly passwords: PasswordService,
    @Inject(TokenService)
    private readonly tokens: TokenService,
    @Inject(SessionService)
    private readonly sessions: SessionService,
    @Inject(EmailService)
    private readonly email: EmailService,
    @Inject(forwardRef(() => MfaService))
    private readonly mfa: MfaService,
    private readonly throttle: AuthThrottleService,
  ) {}

  async register(dto: RegisterDto, request: Request) {
    const emailNormalized = this.normalizeEmail(dto.email);
    const genericMessage = { message: 'Si los datos son válidos, recibirás instrucciones por correo.' };
    await this.throttle.beforeAttempt(emailNormalized, request);
    const existing = await this.prisma.user.findUnique({
      where: { emailNormalized },
      select: { id: true },
    });
    if (existing) {
      return genericMessage;
    }

    this.passwords.assertNotCommon(dto.password);
    const passwordHash = await this.passwords.hash(dto.password);
    const code = this.tokens.createCode();
    let user: { id: string; email: string };
    try {
      user = await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.user.create({
          data: {
            email: dto.email.trim(),
            emailNormalized,
            passwordHash,
            passwordHistory: { create: { passwordHash } },
            consentRecords: {
              create: {
                termsVersion: dto.termsVersion,
                privacyVersion: dto.privacyVersion,
                ipAddressHash: request.ip ? this.tokens.hash(request.ip) : undefined,
                userAgent: dto.userAgent || undefined,
              },
            },
            verificationTokens: {
              create: {
                type: TokenType.EMAIL_VERIFICATION,
                tokenHash: this.tokens.hash(code),
                expiresAt: new Date(Date.now() + 10 * 60 * 1000),
              },
            },
          },
          select: { id: true, email: true },
        });
        await transaction.auditEvent.create({
          data: {
            actorId: created.id,
            action: 'account.registered',
            resourceType: 'user',
            resourceId: created.id,
            result: 'SUCCESS',
          },
        });
        return created;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return genericMessage;
      }
      throw error;
    }
    try {
      await this.email.sendVerification(user.email, code);
    } catch (error) {
      await this.prisma.user.deleteMany({
        where: {
          id: user.id,
          status: UserStatus.PENDING_VERIFICATION,
        },
      });
      throw error;
    }
    await this.throttle.clear(emailNormalized, request);
    return genericMessage;
  }

  async resendVerification(dto: ResendVerificationDto, request: Request) {
    const emailNormalized = this.normalizeEmail(dto.email);
    await this.throttle.beforeAttempt(emailNormalized, request);
    const user = await this.prisma.user.findUnique({
      where: { emailNormalized },
      select: { id: true, email: true, status: true },
    });
    const genericMessage = 'Si la cuenta puede verificarse, recibirás un nuevo código por correo.';
    if (!user || user.status !== UserStatus.PENDING_VERIFICATION) {
      return { message: genericMessage };
    }

    const latestToken = await this.prisma.verificationToken.findFirst({
      where: {
        userId: user.id,
        type: TokenType.EMAIL_VERIFICATION,
        invalidatedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (latestToken && latestToken.createdAt.getTime() + 60_000 > Date.now()) {
      return { message: genericMessage };
    }

    const code = this.tokens.createCode();
    await this.prisma.$transaction([
      this.prisma.verificationToken.updateMany({
        where: {
          userId: user.id,
          type: TokenType.EMAIL_VERIFICATION,
          invalidatedAt: null,
        },
        data: { invalidatedAt: new Date() },
      }),
      this.prisma.verificationToken.create({
        data: {
          userId: user.id,
          type: TokenType.EMAIL_VERIFICATION,
          tokenHash: this.tokens.hash(code),
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        },
      }),
    ]);
    await this.email.sendVerification(user.email, code);
    await this.throttle.clear(emailNormalized, request);
    return { message: genericMessage };
  }

  async verifyEmail(dto: VerifyEmailDto, request: Request) {
    const emailNormalized = this.normalizeEmail(dto.email);
    const user = await this.prisma.user.findUnique({
      where: { emailNormalized },
      select: { id: true, status: true },
    });
    if (!user || user.status !== UserStatus.PENDING_VERIFICATION) {
      throw new UnauthorizedException('Código no válido o expirado');
    }
    const token = await this.prisma.verificationToken.findFirst({
      where: {
        userId: user.id,
        type: TokenType.EMAIL_VERIFICATION,
        invalidatedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!token || token.expiresAt <= new Date() || token.attempts >= 5) {
      throw new UnauthorizedException('Código no válido o expirado');
    }
    if (this.tokens.hash(dto.code) !== token.tokenHash) {
      const updated = await this.prisma.verificationToken.updateMany({
        where: {
          id: token.id,
          invalidatedAt: null,
          attempts: token.attempts,
        },
        data: {
          attempts: { increment: 1 },
          invalidatedAt: token.attempts + 1 >= 5 ? new Date() : undefined,
        },
      });
      if (updated.count === 0) {
        throw new UnauthorizedException('Código no válido o expirado');
      }
      await this.throttle.recordFailure(emailNormalized, request);
      await this.throttle.blockIfThresholdReached(emailNormalized, request);
      throw new UnauthorizedException('Código no válido o expirado');
    }
    const verifiedAt = new Date();
    await this.prisma.$transaction(async (transaction) => {
      const consumed = await transaction.verificationToken.updateMany({
        where: { id: token.id, invalidatedAt: null, attempts: token.attempts },
        data: { invalidatedAt: verifiedAt },
      });
      const activated = await transaction.user.updateMany({
        where: { id: user.id, status: UserStatus.PENDING_VERIFICATION },
        data: { status: UserStatus.ACTIVE, verifiedAt },
      });
      if (consumed.count !== 1 || activated.count !== 1) {
        throw new UnauthorizedException('Código no válido o expirado');
      }
      await transaction.auditEvent.create({
        data: {
          actorId: user.id,
          action: 'account.email_verified',
          resourceType: 'user',
          resourceId: user.id,
          result: 'SUCCESS',
        },
      });
    });
    await this.throttle.clear(emailNormalized, request);
    return { message: 'Cuenta verificada correctamente.' };
  }

  async login(dto: LoginDto, request: Request, response: Response) {
    const emailNormalized = this.normalizeEmail(dto.email);
    await this.throttle.beforeAttempt(emailNormalized, request);
    const user = await this.prisma.user.findUnique({
      where: { emailNormalized },
    });
    if (!user?.passwordHash || !(await this.passwords.verify(user.passwordHash, dto.password))) {
      await this.throttle.recordFailure(emailNormalized, request);
      await this.throttle.blockIfThresholdReached(emailNormalized, request);
      throw new UnauthorizedException('Correo o contraseña no válidos');
    }
    if (user.status !== UserStatus.ACTIVE) {
      await this.throttle.recordFailure(emailNormalized, request);
      await this.throttle.blockIfThresholdReached(emailNormalized, request);
      throw new UnauthorizedException('Correo o contraseña no válidos');
    }
    await this.throttle.clear(emailNormalized, request);
    const activeMfa = await this.prisma.mfaFactor.findFirst({
      where: { userId: user.id, status: 'ACTIVE' },
      select: { id: true },
    });
    const hasAdministrativeRole = await this.prisma.membership.findFirst({
      where: {
        userId: user.id,
        status: 'ACTIVE',
        roles: {
          some: {
            role: { name: { in: ['Propietario', 'Administrador'] } },
          },
        },
      },
      select: { id: true },
    });
    if (hasAdministrativeRole && !activeMfa) {
      throw new ConflictException('MFA obligatorio para cuentas administrativas');
    }
    if (activeMfa) {
      const challengeToken = await this.mfa.issueLoginChallenge(user.id, request);
      return {
        requiresMfa: true,
        challengeToken,
        message: 'Introduce el código MFA para completar el inicio de sesión.',
      };
    }
    await this.sessions.create(user.id, request, response);
    await this.prisma.auditEvent.create({
      data: {
        actorId: user.id,
        action: 'account.login',
        resourceType: 'session',
        result: 'SUCCESS',
      },
    });
    return { message: 'Inicio de sesión correcto.' };
  }

  async requestPasswordReset(dto: RequestPasswordResetDto, request: Request) {
    const emailNormalized = this.normalizeEmail(dto.email);
    await this.throttle.beforeAttempt(emailNormalized, request);
    const user = await this.prisma.user.findUnique({
      where: { emailNormalized },
      select: { id: true, email: true, status: true },
    });
    const genericMessage = 'Si existe una cuenta elegible, recibirás instrucciones de recuperación por correo.';
    if (
      !user ||
      user.status === UserStatus.DEACTIVATED ||
      user.status === UserStatus.PENDING_VERIFICATION
    ) {
      return { message: genericMessage };
    }
    const rawToken = this.tokens.createToken();
    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: this.tokens.hash(rawToken),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });
    const baseUrl =
      process.env.WEB_PUBLIC_ORIGIN ??
      process.env.WEB_ORIGIN ??
      'http://localhost:3000';
    await this.email.sendPasswordReset(
      user.email,
      `${baseUrl}/reset-password?token=${encodeURIComponent(rawToken)}`,
    );
    await this.throttle.clear(emailNormalized, request);
    return { message: genericMessage };
  }

  async resetPassword(dto: ResetPasswordDto, request: Request) {
    const token = await this.prisma.passwordResetToken.findFirst({
      where: {
        tokenHash: this.tokens.hash(dto.token),
        usedAt: null,
      },
    });
    if (!token || token.expiresAt <= new Date()) {
      await this.throttle.recordFailure('reset-token', request);
      await this.throttle.blockIfThresholdReached('reset-token', request);
      throw new UnauthorizedException('Enlace no válido o expirado');
    }
    const userId = token.userId;
    this.passwords.assertNotCommon(dto.password);
    const passwordHash = await this.passwords.hash(dto.password);
    const history = await this.prisma.passwordHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    for (const previous of history) {
      if (await this.passwords.verify(previous.passwordHash, dto.password)) {
        throw new ConflictException('No puedes reutilizar una contraseña reciente');
      }
    }
    await this.prisma.$transaction(async (transaction) => {
      const consumed = await transaction.passwordResetToken.updateMany({
        where: { id: token.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (consumed.count !== 1) {
        throw new UnauthorizedException('Enlace no válido o expirado');
      }
      await transaction.user.update({
        where: { id: userId },
        data: { passwordHash, status: UserStatus.ACTIVE },
      });
      await transaction.passwordHistory.create({
        data: { userId, passwordHash },
      });
      const recentHistory = await transaction.passwordHistory.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true },
      });
      await transaction.passwordHistory.deleteMany({
        where: { userId, id: { notIn: recentHistory.map(({ id }) => id) } },
      });
      await transaction.session.updateMany({
        where: { userId, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: new Date() },
      });
      await transaction.auditEvent.create({
        data: {
          actorId: userId,
          action: 'account.password_reset',
          resourceType: 'user',
          resourceId: userId,
          result: 'SUCCESS',
        },
      });
    });
    await this.throttle.clear('reset-token', request);
    return { message: 'Contraseña actualizada correctamente.' };
  }

  async changePassword(dto: ChangePasswordDto, request: Request) {
    const userId = await this.sessions.requireUser(request);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (!user?.passwordHash || !(await this.passwords.verify(user.passwordHash, dto.currentPassword))) {
      throw new UnauthorizedException('Credenciales no válidas');
    }
    this.passwords.assertNotCommon(dto.newPassword);
    const history = await this.prisma.passwordHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    for (const previous of history) {
      if (await this.passwords.verify(previous.passwordHash, dto.newPassword)) {
        throw new ConflictException('No puedes reutilizar una contraseña reciente');
      }
    }
    const passwordHash = await this.passwords.hash(dto.newPassword);
    const currentToken = request.cookies?.[process.env.SESSION_COOKIE_NAME ?? 'coordia_session'] as string | undefined;
    await this.prisma.$transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: userId },
        data: { passwordHash },
      });
      await transaction.passwordHistory.create({
        data: { userId, passwordHash },
      });
      const recentHistory = await transaction.passwordHistory.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true },
      });
      await transaction.passwordHistory.deleteMany({
        where: { userId, id: { notIn: recentHistory.map(({ id }) => id) } },
      });
      await transaction.session.updateMany({
        where: {
          userId,
          status: 'ACTIVE',
          ...(currentToken ? { NOT: { tokenHash: this.tokens.hash(currentToken) } } : {}),
        },
        data: { status: 'REVOKED', revokedAt: new Date() },
      });
      await transaction.auditEvent.create({
        data: {
          actorId: userId,
          action: 'account.password_changed',
          resourceType: 'user',
          resourceId: userId,
          result: 'SUCCESS',
        },
      });
    });
    return { message: 'Contraseña actualizada correctamente.' };
  }

  async requestEmailChange(dto: RequestEmailChangeDto, request: Request) {
    const userId = await this.sessions.requireUser(request);
    const targetEmail = dto.newEmail.trim();
    const targetNormalized = this.normalizeEmail(targetEmail);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, emailNormalized: true, passwordHash: true },
    });
    if (
      !user?.passwordHash ||
      !(await this.passwords.verify(user.passwordHash, dto.currentPassword))
    ) {
      throw new UnauthorizedException('Credenciales no válidas');
    }
    if (user.emailNormalized === targetNormalized) {
      throw new ConflictException('El nuevo correo debe ser diferente al actual');
    }
    const existing = await this.prisma.user.findUnique({
      where: { emailNormalized: targetNormalized },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('No se puede utilizar ese correo electrónico');
    }
    const rawToken = this.tokens.createToken();
    try {
      await this.prisma.$transaction([
        this.prisma.emailChangeToken.updateMany({
          where: { userId, usedAt: null },
          data: { usedAt: new Date() },
        }),
        this.prisma.emailChangeToken.create({
          data: {
            userId,
            targetEmail,
            targetNormalized,
            tokenHash: this.tokens.hash(rawToken),
            expiresAt: new Date(Date.now() + 30 * 60 * 1000),
          },
        }),
        this.prisma.auditEvent.create({
          data: {
            actorId: userId,
            action: 'account.email_change_requested',
            resourceType: 'user',
            resourceId: userId,
            result: 'SUCCESS',
          },
        }),
      ]);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('No se puede utilizar ese correo electrónico');
      }
      throw error;
    }
    const baseUrl =
      process.env.WEB_PUBLIC_ORIGIN ??
      process.env.WEB_ORIGIN ??
      'http://localhost:3000';
    await this.email.sendEmailChangeVerification(
      targetEmail,
      `${baseUrl}/change-email?token=${encodeURIComponent(rawToken)}`,
    );
    return { message: 'Hemos enviado un enlace de confirmación al nuevo correo.' };
  }

  async confirmEmailChange(dto: ConfirmEmailChangeDto, request: Request) {
    const userId = await this.sessions.requireUser(request);
    const tokenHash = this.tokens.hash(dto.token);
    const token = await this.prisma.emailChangeToken.findFirst({
      where: { userId, tokenHash, usedAt: null },
    });
    if (!token || token.expiresAt <= new Date()) {
      throw new UnauthorizedException('Enlace no válido o expirado');
    }
    const currentToken = request.cookies?.[
      process.env.SESSION_COOKIE_NAME ?? 'coordia_session'
    ] as string | undefined;
    await this.prisma.$transaction(async (transaction) => {
      const consumed = await transaction.emailChangeToken.updateMany({
        where: {
          id: token.id,
          userId,
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { usedAt: new Date() },
      });
      if (consumed.count !== 1) {
        throw new UnauthorizedException('Enlace no válido o expirado');
      }
      const updated = await transaction.user.updateMany({
        where: { id: userId, emailNormalized: { not: token.targetNormalized } },
        data: { email: token.targetEmail, emailNormalized: token.targetNormalized },
      });
      if (updated.count !== 1) {
        throw new ConflictException('No se puede utilizar ese correo electrónico');
      }
      await transaction.session.updateMany({
        where: {
          userId,
          status: 'ACTIVE',
          ...(currentToken ? { NOT: { tokenHash: this.tokens.hash(currentToken) } } : {}),
        },
        data: { status: 'REVOKED', revokedAt: new Date() },
      });
      await transaction.auditEvent.create({
        data: {
          actorId: userId,
          action: 'account.email_changed',
          resourceType: 'user',
          resourceId: userId,
          result: 'SUCCESS',
        },
      });
    });
    return { message: 'Correo electrónico actualizado correctamente.' };
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }
}
