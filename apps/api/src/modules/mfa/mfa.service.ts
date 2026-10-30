import {
  ConflictException,
  Injectable,
  UnauthorizedException,
  forwardRef,
  Inject,
} from '@nestjs/common';
import { MfaFactorStatus, MfaFactorType } from '@prisma/client';
import { Request, Response } from 'express';
import { generateSecret, generateURI, verify } from 'otplib';
import { PrismaService } from '../../common/database/prisma.service';
import { SessionService } from '../auth/session.service';
import { TokenService } from '../auth/token.service';
import { PasswordService } from '../auth/password.service';
import { MfaCryptoService } from './crypto.service';
import { AuthorizationService } from '../../common/authorization/authorization.service';
import { AuthThrottleService } from '../auth/auth-throttle.service';

@Injectable()
export class MfaService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => SessionService))
    private readonly sessions: SessionService,
    @Inject(TokenService)
    private readonly tokens: TokenService,
    @Inject(PasswordService)
    private readonly passwords: PasswordService,
    @Inject(MfaCryptoService)
    private readonly crypto: MfaCryptoService,
    @Inject(AuthThrottleService)
    private readonly throttle: AuthThrottleService,
  ) {}

  async begin(request: Request) {
    const userId = await this.sessions.requireUser(request);
    const existing = await this.prisma.mfaFactor.findFirst({
      where: { userId, status: { in: [MfaFactorStatus.PENDING, MfaFactorStatus.ACTIVE] } },
    });
    if (existing) throw new ConflictException('Ya existe un factor MFA configurado');
    const secret = generateSecret();
    const factor = await this.prisma.mfaFactor.create({
      data: {
        userId,
        type: MfaFactorType.TOTP,
        secretCiphertext: this.crypto.encrypt(secret),
      },
    });
    return {
      factorId: factor.id,
      secret,
      otpauthUri: generateURI({
        issuer: 'Coordia',
        label: `Coordia:${userId}`,
        secret,
      }),
    };
  }

  async activate(factorId: string, code: string, request: Request) {
    const userId = await this.sessions.requireUser(request);
    const factor = await this.prisma.mfaFactor.findFirst({
      where: { id: factorId, userId, status: MfaFactorStatus.PENDING },
    });
    if (!factor || !(await this.validCode(factor.secretCiphertext, code))) {
      throw new UnauthorizedException('Código MFA no válido');
    }
    const recoveryCodes = Array.from({ length: 10 }, () => this.tokens.createToken(9));
    const activatedAt = new Date();
    await this.prisma.$transaction(async (transaction) => {
      const activated = await transaction.mfaFactor.updateMany({
        where: { id: factor.id, userId, status: MfaFactorStatus.PENDING },
        data: { status: MfaFactorStatus.ACTIVE, activatedAt },
      });
      if (activated.count !== 1) {
        throw new ConflictException('El factor MFA ya no está disponible');
      }
      await transaction.mfaRecoveryCode.createMany({
        data: recoveryCodes.map((codeValue) => ({
          factorId: factor.id,
          codeHash: this.tokens.hash(codeValue),
        })),
      });
      await transaction.auditEvent.create({
        data: {
          actorId: userId,
          action: 'mfa.activated',
          resourceType: 'mfa_factor',
          resourceId: factor.id,
          result: 'SUCCESS',
        },
      });
    });
    return { recoveryCodes };
  }

  async disable(code: string, password: string, request: Request) {
    const userId = await this.sessions.requireUser(request);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.passwordHash || !(await this.passwords.verify(user.passwordHash, password))) {
      throw new UnauthorizedException('Credenciales no válidas');
    }
    const factor = await this.prisma.mfaFactor.findFirst({
      where: { userId, status: MfaFactorStatus.ACTIVE },
    });
    if (!factor || !(await this.validCode(factor.secretCiphertext, code))) {
      throw new UnauthorizedException('Código MFA no válido');
    }
    const isAdministrative = await this.prisma.membership.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
        roles: { some: { role: { name: { in: ['Propietario', 'Administrador'] } } } },
      },
      select: { id: true },
    });
    if (isAdministrative) {
      throw new ConflictException('Las cuentas administrativas deben conservar MFA activo');
    }
    await this.prisma.mfaFactor.update({
      where: { id: factor.id },
      data: { status: MfaFactorStatus.DISABLED, disabledAt: new Date() },
    });
    await this.prisma.auditEvent.create({
      data: {
        actorId: userId,
        action: 'mfa.disabled',
        resourceType: 'mfa_factor',
        resourceId: factor.id,
        result: 'SUCCESS',
      },
    });
    return { message: 'MFA desactivado' };
  }

  async verifyForUser(userId: string, code: string): Promise<boolean> {
    const factor = await this.prisma.mfaFactor.findFirst({
      where: { userId, status: MfaFactorStatus.ACTIVE },
    });
    return factor ? this.validCode(factor.secretCiphertext, code) : false;
  }

  async issueLoginChallenge(userId: string, request: Request): Promise<string> {
    await this.throttle.beforeAttempt(`mfa:${userId}`, request);
    await this.prisma.mfaChallenge.updateMany({
      where: { userId, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    const rawToken = this.tokens.createToken();
    await this.prisma.mfaChallenge.create({
      data: {
        userId,
        tokenHash: this.tokens.hash(rawToken),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });
    return rawToken;
  }

  async completeLogin(
    challengeToken: string,
    code: string,
    request: Request,
    response: Response,
  ) {
    const throttleKey = `mfa-challenge:${this.tokens.hash(challengeToken)}`;
    await this.throttle.beforeAttempt(throttleKey, request);
    const challenge = await this.prisma.mfaChallenge.findUnique({
      where: { tokenHash: this.tokens.hash(challengeToken) },
    });
    if (
      !challenge ||
      challenge.consumedAt ||
      challenge.expiresAt <= new Date() ||
      challenge.attempts >= 5
    ) {
      await this.throttle.recordFailure(throttleKey, request);
      await this.throttle.blockIfThresholdReached(throttleKey, request);
      throw new UnauthorizedException('Desafío MFA no válido o expirado');
    }

    let valid = await this.verifyForUser(challenge.userId, code);
    if (!valid) valid = await this.consumeRecoveryCode(challenge.userId, code);
    if (!valid) {
      await this.prisma.mfaChallenge.updateMany({
        where: { id: challenge.id, attempts: challenge.attempts, consumedAt: null },
        data: {
          attempts: { increment: 1 },
          consumedAt: challenge.attempts + 1 >= 5 ? new Date() : undefined,
        },
      });
      await this.throttle.recordFailure(`mfa:${challenge.userId}`, request);
      await this.throttle.blockIfThresholdReached(`mfa:${challenge.userId}`, request);
      throw new UnauthorizedException('Código MFA no válido');
    }

    await this.prisma.mfaChallenge.update({
      where: { id: challenge.id },
      data: { consumedAt: new Date() },
    });
    await this.sessions.create(challenge.userId, request, response);
    await this.prisma.auditEvent.create({
      data: {
        actorId: challenge.userId,
        action: 'account.mfa_login_verified',
        resourceType: 'session',
        result: 'SUCCESS',
      },
    });
    await this.throttle.clear(`mfa:${challenge.userId}`, request);
    await this.throttle.clear(throttleKey, request);
    return { message: 'Inicio de sesión correcto.' };
  }

  private async consumeRecoveryCode(userId: string, code: string): Promise<boolean> {
    const factor = await this.prisma.mfaFactor.findFirst({
      where: { userId, status: MfaFactorStatus.ACTIVE },
      select: { id: true },
    });
    if (!factor) return false;
    const availableCodes = await this.prisma.mfaRecoveryCode.findMany({
      where: { factorId: factor.id, usedAt: null },
      select: { id: true, codeHash: true },
    });
    const match = availableCodes.find((candidate) =>
      this.tokens.hash(code) === candidate.codeHash,
    );
    if (!match) return false;
    const consumed = await this.prisma.mfaRecoveryCode.updateMany({
      where: { id: match.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (consumed.count !== 1) return false;
    await this.prisma.auditEvent.create({
      data: {
        actorId: userId,
        action: 'mfa.recovery_code_used',
        resourceType: 'mfa_recovery_code',
        resourceId: match.id,
        result: 'SUCCESS',
      },
    });
    return true;
  }

  private async validCode(ciphertext: string, code: string): Promise<boolean> {
    const result = await verify({ secret: this.crypto.decrypt(ciphertext), token: code });
    return result.valid;
  }
}
