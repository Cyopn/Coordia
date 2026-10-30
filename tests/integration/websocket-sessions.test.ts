import assert from 'node:assert/strict';
import test from 'node:test';
import { PrismaClient } from '@prisma/client';
import { WebSocket } from 'ws';
import { createApplication } from '../../apps/api/src/app.factory';
import { SessionRevocationService } from '../../apps/api/src/modules/auth/session-revocation.service';
import { SessionWebSocketGateway } from '../../apps/api/src/modules/auth/session-websocket.gateway';
import { TokenService } from '../../apps/api/src/modules/auth/token.service';

const prisma = new PrismaClient();
const tokens = new TokenService();

function waitForClose(socket: WebSocket): Promise<number> {
  return new Promise((resolve, reject) => {
    socket.once('close', (code) => resolve(code));
    socket.once('error', reject);
  });
}

test('WebSocket rechaza sesiones inválidas y cierra sesiones revocadas o expiradas', async () => {
  process.env.SESSION_WEBSOCKET_VALIDATE_MS = '25';
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const email = `ws-${suffix}@example.invalid`;
  const user = await prisma.user.create({
    data: { email, emailNormalized: email, status: 'ACTIVE' },
  });
  const token = `ws-session-${suffix}`;
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: tokens.hash(token),
      expiresAt: new Date(Date.now() + 60_000),
    },
  });
  const app = await createApplication();
  const gateway = app.get(SessionWebSocketGateway);
  gateway.attach(app.getHttpServer());
  await app.listen(0);
  const address = app.getHttpServer().address();
  assert.ok(address && typeof address !== 'string');
  const url = `ws://127.0.0.1:${address.port}/ws/sessions`;

  try {
    const unauthenticated = new WebSocket(url);
    assert.equal(await waitForClose(unauthenticated), 1008);

    const connected = new WebSocket(url, {
      headers: { Cookie: `coordia_session=${token}` },
    });
    await new Promise<void>((resolve, reject) => {
      connected.once('message', (message) => {
        assert.deepEqual(JSON.parse(message.toString()), { type: 'session.connected' });
        resolve();
      });
      connected.once('error', reject);
    });
    await prisma.session.update({
      where: { id: session.id },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });
    app.get(SessionRevocationService).notify([session.id]);
    assert.equal(await waitForClose(connected), 4001);

    const expiringToken = `ws-expiring-${suffix}`;
    const expiringSession = await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: tokens.hash(expiringToken),
        expiresAt: new Date(Date.now() + 500),
      },
    });
    const expiring = new WebSocket(url, {
      headers: { Cookie: `coordia_session=${expiringToken}` },
    });
    await new Promise<void>((resolve, reject) => {
      expiring.once('message', () => resolve());
      expiring.once('error', reject);
    });
    assert.equal(await waitForClose(expiring), 4001);
    await prisma.session.delete({ where: { id: expiringSession.id } });
  } finally {
    await app.close();
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test.after(async () => {
  await prisma.$disconnect();
});
