import assert from 'node:assert/strict';
import test from 'node:test';
import { SessionRevocationService } from '../../apps/api/src/modules/auth/session-revocation.service';

test('notifies only subscribed session revocation listeners', () => {
  const service = new SessionRevocationService();
  const notified: string[] = [];
  const unsubscribe = service.subscribe((sessionId) => notified.push(sessionId));

  service.notify(['session-a', 'session-b']);
  unsubscribe();
  service.notify(['session-c']);

  assert.deepEqual(notified, ['session-a', 'session-b']);
});
