import assert from 'node:assert/strict';
import test from 'node:test';
import { PrismaClient } from '@prisma/client';
import { generateSecret, generateSync } from 'otplib';
import { createApplication } from '../../apps/api/src/app.factory';
import { MfaCryptoService } from '../../apps/api/src/modules/mfa/crypto.service';
import { PasswordService } from '../../apps/api/src/modules/auth/password.service';

const prisma = new PrismaClient();

test('bootstrap global concurrente solo permite una inicialización', async () => {
  process.env.GLOBAL_ADMIN_BOOTSTRAP_TOKEN = 'B'.repeat(64);
  process.env.GLOBAL_ADMIN_BOOTSTRAP_EXPIRES_AT = new Date(Date.now() + 60_000).toISOString();
  process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const email = `global-${suffix}@example.invalid`;
  const password = 'Una contraseña administrativa segura 2026!';
  const passwordService = new PasswordService();
  const crypto = new MfaCryptoService();
  const secret = generateSecret();
  const user = await prisma.user.create({
    data: {
      email,
      emailNormalized: email,
      passwordHash: await passwordService.hash(password),
      status: 'ACTIVE',
      mfaFactors: {
        create: {
          type: 'TOTP',
          status: 'ACTIVE',
          secretCiphertext: crypto.encrypt(secret),
          activatedAt: new Date(),
        },
      },
    },
  });
  const app = await createApplication();
  await app.listen(0);
  const address = app.getHttpServer().address();
  assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}/platform/bootstrap`;
  const payload = JSON.stringify({
    email,
    password,
    mfaCode: generateSync({ secret }),
    bootstrapToken: process.env.GLOBAL_ADMIN_BOOTSTRAP_TOKEN,
  });

  try {
    const responses = await Promise.all(
      Array.from({ length: 4 }, () =>
        fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
          body: payload,
          signal: AbortSignal.timeout(30_000),
        }),
      ),
    );
    const statuses = responses.map((response) => response.status).sort((a, b) => a - b);
    await Promise.all(responses.map((response) => response.text()));
    assert.equal(statuses.filter((status) => status === 201 || status === 200).length, 1);
    assert.equal(statuses.filter((status) => status >= 400 && status < 500).length, 3);
    const [bootstrap, globalAdmins, audits] = await prisma.$transaction([
      prisma.globalAdminBootstrap.findUnique({ where: { id: 'singleton' } }),
      prisma.user.count({ where: { isGlobalAdmin: true } }),
      prisma.auditEvent.count({
        where: { action: 'global_admin.initialized', actorId: user.id },
      }),
    ]);
    assert.ok(bootstrap?.completedAt);
    assert.equal(globalAdmins, 1);
    assert.equal(audits, 1);
  } finally {
    await app.close();
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.globalAdminBootstrap.update({
      where: { id: 'singleton' },
      data: { completedAt: null, initializedBy: null },
    });
  }
});

test.after(async () => {
  await prisma.$disconnect();
});
