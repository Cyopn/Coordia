import { ConflictException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../../common/database/prisma.service';
import { PasswordService } from '../auth/password.service';
import { MfaService } from '../mfa/mfa.service';
import { BootstrapGlobalAdminDto } from './dto/bootstrap-global-admin.dto';

@Injectable()
export class GlobalAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly mfa: MfaService,
  ) {}

  async bootstrap(dto: BootstrapGlobalAdminDto, request: Request) {
    const configuredToken = process.env.GLOBAL_ADMIN_BOOTSTRAP_TOKEN;
    if (!configuredToken) {
      throw new ServiceUnavailableException('La inicialización global no está habilitada');
    }
    const suppliedHash = createHash('sha256').update(dto.bootstrapToken).digest();
    const configuredHash = createHash('sha256').update(configuredToken).digest();
    if (!timingSafeEqual(suppliedHash, configuredHash)) {
      throw new UnauthorizedException('No autorizado');
    }
    const emailNormalized = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { emailNormalized },
      select: { id: true, passwordHash: true, status: true },
    });
    if (
      !user ||
      user.status !== 'ACTIVE' ||
      !user.passwordHash ||
      !(await this.passwords.verify(user.passwordHash, dto.password)) ||
      !(await this.mfa.verifyForUser(user.id, dto.mfaCode))
    ) {
      throw new UnauthorizedException('No autorizado');
    }
    try {
      await this.prisma.$transaction(async (transaction) => {
        const claimed = await transaction.globalAdminBootstrap.updateMany({
          where: { id: 'singleton', completedAt: null },
          data: { completedAt: new Date(), initializedBy: user.id },
        });
        if (claimed.count !== 1) throw new ConflictException('La inicialización ya fue completada');
        await transaction.user.update({
          where: { id: user.id },
          data: { isGlobalAdmin: true },
        });
        await transaction.auditEvent.create({
          data: {
            actorId: user.id,
            action: 'global_admin.initialized',
            resourceType: 'user',
            resourceId: user.id,
            result: 'SUCCESS',
            metadata: { ipAddressHash: request.ip ? '[REDACTED]' : null },
          },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new ConflictException('La inicialización entró en conflicto; inténtalo de nuevo');
      }
      throw error;
    }
    return { message: 'Administrador global inicializado correctamente.' };
  }
}
