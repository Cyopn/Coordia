import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';

@Injectable()
export class AuthCleanupService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    void this.cleanup();
    this.timer = setInterval(() => void this.cleanup(), 24 * 60 * 60 * 1000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async cleanup(): Promise<void> {
    const now = new Date();
    const pendingCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    await this.prisma.$transaction([
      this.prisma.user.deleteMany({
        where: { status: 'PENDING_VERIFICATION', createdAt: { lt: pendingCutoff } },
      }),
      this.prisma.verificationToken.deleteMany({
        where: { OR: [{ expiresAt: { lt: now } }, { invalidatedAt: { not: null } }] },
      }),
      this.prisma.passwordResetToken.deleteMany({
        where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }] },
      }),
      this.prisma.emailChangeToken.deleteMany({
        where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }] },
      }),
      this.prisma.mfaChallenge.deleteMany({
        where: { OR: [{ expiresAt: { lt: now } }, { consumedAt: { not: null } }] },
      }),
      this.prisma.trustedDevice.deleteMany({
        where: { OR: [{ expiresAt: { lt: now } }, { revokedAt: { not: null } }] },
      }),
      this.prisma.authThrottle.deleteMany({
        where: { resetAt: { lt: now } },
      }),
    ]);
  }
}
