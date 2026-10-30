import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  forwardRef,
  Inject,
} from '@nestjs/common';
import { TokenType, UserStatus } from '@prisma/client';
import { Request, Response } from 'express';
import { PrismaService } from '../../common/database/prisma.service';
import { EmailService } from '../email/email.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
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
  ) {}

  async register(dto: RegisterDto, request: Request) {
    const emailNormalized = this.normalizeEmail(dto.email);
    const existing = await this.prisma.user.findUnique({
      where: { emailNormalized },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        'El correo electrónico ya está registrado y no se puede utilizar',
      );
    }

    this.passwords.assertNotCommon(dto.password);
    const passwordHash = await this.passwords.hash(dto.password);
    const code = this.tokens.createCode();
    const user = await this.prisma.$transaction(async (transaction) => {
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
    return { message: 'Registro creado. Revisa tu correo para verificar la cuenta.' };
  }

  async resendVerification(dto: ResendVerificationDto) {
    const user = await this.prisma.user.findUnique({
      where: { emailNormalized: this.normalizeEmail(dto.email) },
      select: { id: true, email: true, status: true },
    });
    if (!user) {
      throw new NotFoundException(
        'No existe una cuenta pendiente asociada a este correo electrónico',
      );
    }
    if (user.status !== UserStatus.PENDING_VERIFICATION) {
      throw new ConflictException('Esta cuenta ya está verificada o no puede verificarse');
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
    return { message: 'Hemos enviado un nuevo código de verificación.' };
  }

  async verifyEmail(dto: VerifyEmailDto) {
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
      await this.prisma.verificationToken.update({
        where: { id: token.id },
        data: {
          attempts: { increment: 1 },
          invalidatedAt: token.attempts + 1 >= 5 ? new Date() : undefined,
        },
      });
      throw new UnauthorizedException('Código no válido o expirado');
    }
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { status: UserStatus.ACTIVE, verifiedAt: new Date() },
      }),
      this.prisma.verificationToken.update({
        where: { id: token.id },
        data: { invalidatedAt: new Date() },
      }),
      this.prisma.auditEvent.create({
        data: {
          actorId: user.id,
          action: 'account.email_verified',
          resourceType: 'user',
          resourceId: user.id,
          result: 'SUCCESS',
        },
      }),
    ]);
    return { message: 'Cuenta verificada correctamente.' };
  }

  async login(dto: LoginDto, request: Request, response: Response) {
    const user = await this.prisma.user.findUnique({
      where: { emailNormalized: this.normalizeEmail(dto.email) },
    });
    if (!user?.passwordHash || !(await this.passwords.verify(user.passwordHash, dto.password))) {
      throw new UnauthorizedException('Correo o contraseña no válidos');
    }
    if (user.status === UserStatus.PENDING_VERIFICATION) {
      throw new ConflictException(
        'Debes verificar tu correo electrónico antes de iniciar sesión',
      );
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Correo o contraseña no válidos');
    }
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
      const challengeToken = await this.mfa.issueLoginChallenge(user.id);
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

  async requestPasswordReset(dto: RequestPasswordResetDto) {
    const user = await this.prisma.user.findUnique({
      where: { emailNormalized: this.normalizeEmail(dto.email) },
      select: { id: true, email: true, status: true },
    });
    if (!user) {
      throw new NotFoundException(
        'No existe una cuenta asociada a este correo electrónico',
      );
    }
    if (user.status === UserStatus.DEACTIVATED) {
      throw new ConflictException(
        'Esta cuenta está desactivada y no puede recuperar el acceso',
      );
    }
    if (user.status === UserStatus.PENDING_VERIFICATION) {
      throw new ConflictException(
        'La cuenta aún no está verificada; verifica tu correo antes de recuperar el acceso',
      );
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
      `${baseUrl}/reset-password?userId=${user.id}&token=${encodeURIComponent(rawToken)}`,
    );
    return { message: 'Hemos enviado las instrucciones de recuperación a tu correo.' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const token = await this.prisma.passwordResetToken.findFirst({
      where: {
        userId: dto.userId,
        tokenHash: this.tokens.hash(dto.token),
        usedAt: null,
      },
    });
    if (!token || token.expiresAt <= new Date()) {
      throw new UnauthorizedException('Enlace no válido o expirado');
    }
    const passwordHash = await this.passwords.hash(dto.password);
    const history = await this.prisma.passwordHistory.findMany({
      where: { userId: dto.userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    for (const previous of history) {
      if (await this.passwords.verify(previous.passwordHash, dto.password)) {
        throw new ConflictException('No puedes reutilizar una contraseña reciente');
      }
    }
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: dto.userId },
        data: { passwordHash, status: UserStatus.ACTIVE },
      }),
      this.prisma.passwordHistory.create({
        data: { userId: dto.userId, passwordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: token.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.session.updateMany({
        where: { userId: dto.userId, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: new Date() },
      }),
      this.prisma.auditEvent.create({
        data: {
          actorId: dto.userId,
          action: 'account.password_reset',
          resourceType: 'user',
          resourceId: dto.userId,
          result: 'SUCCESS',
        },
      }),
    ]);
    return { message: 'Contraseña actualizada correctamente.' };
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }
}
