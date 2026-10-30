import { Injectable } from '@nestjs/common';
import { Request } from 'express';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';

@Injectable()
export class AuthThrottleService {
  private readonly windowMs = Number(process.env.AUTH_THROTTLE_WINDOW_MS ?? 15 * 60 * 1000);
  private readonly maxFailures = Number(process.env.AUTH_THROTTLE_MAX_FAILURES ?? 10);

  constructor(private readonly prisma: PrismaService) {}

  async beforeAttempt(email: string, request: Request): Promise<void> {
    const now = new Date();
    const keys = [this.key(`email:${email}`), this.key(`ip:${request.ip ?? 'unknown'}`)];
    const buckets = await this.prisma.authThrottle.findMany({ where: { key: { in: keys } } });
    const failures = Math.max(
      0,
      ...buckets
        .filter((bucket) => bucket.resetAt > now)
        .map((bucket) => bucket.failures),
    );
    if (failures >= this.maxFailures) {
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(2000, 250 * (failures - this.maxFailures + 1))),
      );
    }
  }

  async recordFailure(email: string, request: Request): Promise<void> {
    const now = new Date();
    const resetAt = new Date(now.getTime() + this.windowMs);
    for (const value of [`email:${email}`, `ip:${request.ip ?? 'unknown'}`]) {
      const key = this.key(value);
      const updated = await this.prisma.authThrottle.updateMany({
        where: { key, resetAt: { gt: now } },
        data: { failures: { increment: 1 } },
      });
      if (updated.count === 0) {
        try {
          await this.prisma.authThrottle.upsert({
            where: { key },
            create: { key, failures: 1, resetAt },
            update: { failures: 1, resetAt },
          });
        } catch (error) {
          if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
            throw error;
          }
          await this.prisma.authThrottle.updateMany({
            where: { key, resetAt: { gt: now } },
            data: { failures: { increment: 1 } },
          });
        }
      }
    }
  }

  private key(value: string): string {
    return createHash('sha256').update(value.toLowerCase()).digest('hex');
  }
}
