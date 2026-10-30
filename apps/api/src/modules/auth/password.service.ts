import { BadRequestException, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

@Injectable()
export class PasswordService {
  private readonly commonPasswords = new Set(
    [
      'password',
      'password123',
      'passwordpassword',
      '123456789012',
      '123456789012345',
      'qwertyuiopasdf',
      'qwertyuiopasdfgh',
      'contraseña',
      'contraseña123456',
      'letmein',
      'welcome',
      'adminadmin',
      'iloveyou',
    ]
      .concat((process.env.COMMON_PASSWORDS ?? '').split(','))
      .map((password) => password.trim().toLowerCase())
      .filter(Boolean),
  );

  hash(value: string): Promise<string> {
    return argon2.hash(value, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
  }

  verify(hash: string, value: string): Promise<boolean> {
    return argon2.verify(hash, value);
  }

  assertNotCommon(value: string): void {
    const normalized = value.trim().toLowerCase();
    if (
      this.commonPasswords.has(normalized) ||
      /^(.{1,4})\1+$/.test(normalized) ||
      /^(?:0123456789|1234567890|qwerty)+$/i.test(normalized)
    ) {
      throw new BadRequestException('La contraseña no es suficientemente segura');
    }
  }
}
