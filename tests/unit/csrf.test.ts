import assert from 'node:assert/strict';
import test from 'node:test';
import { assertSameOriginForCookieRequest } from '../../apps/api/src/common/security/csrf';

const origins = ['http://localhost:3000'];

test('rejects unsafe cookie requests from an unauthorized origin', () => {
  assert.throws(
    () =>
      assertSameOriginForCookieRequest(
        {
          method: 'POST',
          headers: { origin: 'https://evil.example' },
          cookies: { coordia_session: 'session' },
        } as never,
        origins,
      ),
    /Origen de solicitud no permitido/,
  );
});

test('allows unsafe cookie requests from an explicitly allowed origin', () => {
  assert.doesNotThrow(() =>
    assertSameOriginForCookieRequest(
      {
        method: 'POST',
        headers: { origin: 'http://localhost:3000' },
        cookies: { coordia_session: 'session' },
      } as never,
      origins,
    ),
  );
});
