import assert from 'node:assert/strict';
import test from 'node:test';
import { AuthThrottleService } from '../../apps/api/src/modules/auth/auth-throttle.service';

test('blocks a bucket atomically once the failure threshold is reached', async () => {
  process.env.AUTH_THROTTLE_MAX_FAILURES = '2';
  process.env.AUTH_THROTTLE_BLOCK_MS = '60000';
  const now = new Date(Date.now() + 60_000);
  const buckets = [
    { key: 'email-bucket', failures: 2, resetAt: now, blockedUntil: null },
  ];
  let blockedUntil: Date | null = null;
  const prisma = {
    authThrottle: {
      findMany: async () => buckets,
      updateMany: async ({ data }: { data: { blockedUntil?: Date } }) => {
        blockedUntil = data.blockedUntil ?? blockedUntil;
        return { count: 1 };
      },
      deleteMany: async () => ({ count: 0 }),
      upsert: async () => ({}),
    },
    $executeRaw: async () => 1,
    securityEvent: {
      create: async () => ({}),
    },
  };
  const service = new AuthThrottleService(prisma as never);

  await assert.rejects(
    service.beforeAttempt('user@example.com', { ip: '192.0.2.1' } as never),
    (error: { status: number }) => error.status === 429,
  );
  assert.ok(blockedUntil instanceof Date);
});
