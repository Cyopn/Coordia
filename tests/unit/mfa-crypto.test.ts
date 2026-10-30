import assert from 'node:assert/strict';
import test from 'node:test';
import { MfaCryptoService } from '../../apps/api/src/modules/mfa/crypto.service';

test('cifra y descifra secretos TOTP sin conservarlos en claro', () => {
  process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  const service = new MfaCryptoService();
  const encrypted = service.encrypt('secreto-totp');

  assert.notEqual(encrypted, 'secreto-totp');
  assert.equal(service.decrypt(encrypted), 'secreto-totp');
});
