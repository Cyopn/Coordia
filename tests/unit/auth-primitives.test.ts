import assert from 'node:assert/strict';
import test from 'node:test';
import { PasswordService } from '../../apps/api/src/modules/auth/password.service';
import { TokenService } from '../../apps/api/src/modules/auth/token.service';

test('hashes and verifies passwords with Argon2id', async () => {
  const service = new PasswordService();
  const hash = await service.hash('una-frase-segura-2026');

  assert.notEqual(hash, 'una-frase-segura-2026');
  assert.equal(await service.verify(hash, 'una-frase-segura-2026'), true);
  assert.equal(await service.verify(hash, 'otra-frase-segura-2026'), false);
});

test('rejects a known common password', () => {
  const service = new PasswordService();

  assert.throws(() => service.assertNotCommon('PasswordPassword'));
  assert.doesNotThrow(() => service.assertNotCommon('una-frase-segura-2026'));
});

test('creates non-reversible token hashes', () => {
  const service = new TokenService();
  const token = service.createToken();

  assert.notEqual(token, service.hash(token));
  assert.equal(service.hash(token), service.hash(token));
});
