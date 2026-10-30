import { BadRequestException, Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

@Injectable()
export class MfaCryptoService {
  private readonly algorithm = 'aes-256-gcm';

  private getKey(): Buffer {
    const encoded = process.env.MFA_ENCRYPTION_KEY;
    if (!encoded) {
      throw new BadRequestException('MFA_ENCRYPTION_KEY no está configurada');
    }
    const key = Buffer.from(encoded, 'base64');
    if (key.length !== 32) {
      throw new BadRequestException('MFA_ENCRYPTION_KEY debe codificar 32 bytes');
    }
    return key;
  }

  encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv(this.algorithm, this.getKey(), iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv, tag, encrypted].map((part) => part.toString('base64url')).join('.');
  }

  decrypt(value: string): string {
    const [ivEncoded, tagEncoded, encryptedEncoded] = value.split('.');
    if (!ivEncoded || !tagEncoded || !encryptedEncoded) {
      throw new BadRequestException('Factor MFA inválido');
    }
    const decipher = createDecipheriv(
      this.algorithm,
      this.getKey(),
      Buffer.from(ivEncoded, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tagEncoded, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedEncoded, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}
