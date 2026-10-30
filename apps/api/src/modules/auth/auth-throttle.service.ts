import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../common/database/prisma.service';

@Injectable()
export class AuthThrottleService {
  private readonly windowMs = Number(process.env.AUTH_THROTTLE_WINDOW_MS ?? 15 * 60 * 1000);
  private readonly maxFailures = Number(process.env.AUTH_THROTTLE_MAX_FAILURES ?? 10);
  private readonly blockMs = Number(process.env.AUTH_THROTTLE_BLOCK_MS ?? 15 * 60 * 1000);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

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
      const blockedUntil = new Date(now.getTime() + this.blockMs);
      await this.prisma.authThrottle.updateMany({
        where: { key: { in: keys }, resetAt: { gt: now }, failures: { gte: this.maxFailures } },
        data: { blockedUntil },
      });
      await this.recordBlock(
        buckets.find((bucket) => bucket.failures === failures)?.key ?? keys[0] ?? '',
        failures,
        request,
      );
      throw new HttpException(
        {
          message: 'Demasiados intentos. Inténtalo más tarde.',
          retryAfter: Math.ceil(this.blockMs / 1000),
        },
        HttpStatus.TOO_MANY_REQUESTS,
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
      await this.prisma.$executeRaw`
        INSERT INTO "AuthThrottle" ("key", "failures", "resetAt", "updatedAt")
        VALUES (${key}, 1, ${resetAt}, NOW())
        ON CONFLICT ("key") DO UPDATE
        SET
          "failures" = CASE
            WHEN "AuthThrottle"."resetAt" > NOW() THEN "AuthThrottle"."failures" + 1
            ELSE 1
          END,
          "resetAt" = CASE
            WHEN "AuthThrottle"."resetAt" > NOW() THEN "AuthThrottle"."resetAt"
            ELSE ${resetAt}
          END,
          "blockedUntil" = NULL,
          "updatedAt" = NOW()
      `;
    }
    await this.prisma.securityEvent.create({
      data: {
        eventType: 'auth.attempt_failed',
        severity: 'MEDIUM',
        metadata: {
          bucketHash: this.key(`email:${email}`),
          ipHash: request.ip ? this.key(`ip:${request.ip}`) : null,
        },
      },
    });
  }

  async blockIfThresholdReached(email: string, request: Request): Promise<void> {
    const blockedUntil = new Date(Date.now() + this.blockMs);
    for (const value of [
      `email:${email}`,
      `ip:${request.ip ?? 'unknown'}`,
      `combo:${email}:${request.ip ?? 'unknown'}`,
    ]) {
      const result = await this.prisma.authThrottle.updateMany({
        where: { key: this.key(value), failures: { gte: this.maxFailures }, blockedUntil: null },
        data: { blockedUntil },
      });
      if (result.count > 0) {
        await this.recordBlock(this.key(value), this.maxFailures, request);
      }
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

  private async recordBlock(key: string, failures: number, request: Request): Promise<void> {
    await this.prisma.securityEvent.create({
      data: {
        eventType: 'auth.throttle_blocked',
        severity: 'HIGH',
        metadata: {
          bucketHash: key,
          failures,
          ipHash: request.ip ? this.key(`ip:${request.ip}`) : null,
        },
      },
    });
  }

  private key(value: string): string {
    return createHash('sha256').update(value.toLowerCase()).digest('hex');
  }
}
