import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';

@Injectable()
export class AuthThrottleService {
  private readonly windowMs = Number(process.env.AUTH_THROTTLE_WINDOW_MS ?? 15 * 60 * 1000);
  private readonly maxFailures = Number(process.env.AUTH_THROTTLE_MAX_FAILURES ?? 10);
  private readonly blockMs = Number(process.env.AUTH_THROTTLE_BLOCK_MS ?? 15 * 60 * 1000);

  constructor(private readonly prisma: PrismaService) {}

  async beforeAttempt(email: string, request: Request): Promise<void> {
    const now = new Date();
    const keys = [
      this.key(`email:${email}`),
      this.key(`ip:${request.ip ?? 'unknown'}`),
      this.key(`combo:${email}:${request.ip ?? 'unknown'}`),
    ];
    const buckets = await this.prisma.authThrottle.findMany({ where: { key: { in: keys } } });
    const blocked = buckets.find(
      (bucket) => bucket.blockedUntil !== null && bucket.blockedUntil > now,
    );
    if (blocked?.blockedUntil) {
      const retryAfter = Math.max(1, Math.ceil((blocked.blockedUntil.getTime() - now.getTime()) / 1000));
      throw new HttpException({
        message: 'Demasiados intentos. Inténtalo más tarde.',
        retryAfter,
      }, HttpStatus.TOO_MANY_REQUESTS);
    }
    const failures = Math.max(
      0,
      ...buckets
        .filter((bucket) => bucket.resetAt > now)
        .map((bucket) => bucket.failures),
    );
    if (failures >= this.maxFailures) {
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(5000, 250 * (failures - this.maxFailures + 1))),
      );
    }
  }

  async recordFailure(email: string, request: Request): Promise<void> {
    const now = new Date();
    const resetAt = new Date(now.getTime() + this.windowMs);
    for (const value of [
      `email:${email}`,
      `ip:${request.ip ?? 'unknown'}`,
      `combo:${email}:${request.ip ?? 'unknown'}`,
    ]) {
      const key = this.key(value);
      const updated = await this.prisma.authThrottle.updateMany({
        where: { key, resetAt: { gt: now } },
        data: {
          failures: { increment: 1 },
          blockedUntil: undefined,
        },
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

  async blockIfThresholdReached(email: string, request: Request): Promise<void> {
    const blockedUntil = new Date(Date.now() + this.blockMs);
    for (const value of [
      `email:${email}`,
      `ip:${request.ip ?? 'unknown'}`,
      `combo:${email}:${request.ip ?? 'unknown'}`,
    ]) {
      await this.prisma.authThrottle.updateMany({
        where: { key: this.key(value), failures: { gte: this.maxFailures }, blockedUntil: null },
        data: { blockedUntil },
      });
    }
  }

  async clear(email: string, request: Request): Promise<void> {
    await this.prisma.authThrottle.deleteMany({
      where: {
        key: {
          in: [
            this.key(`email:${email}`),
            this.key(`combo:${email}:${request.ip ?? 'unknown'}`),
          ],
        },
      },
    });
  }

  private key(value: string): string {
    return createHash('sha256').update(value.toLowerCase()).digest('hex');
  }
}
