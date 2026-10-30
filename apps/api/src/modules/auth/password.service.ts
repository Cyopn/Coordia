import { BadRequestException, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

@Injectable()
export class PasswordService {
  private readonly commonPasswords = new Set([
    'passwordpassword',
    'contraseña123456',
    '123456789012',
    'qwertyuiopasdf',
  ]);

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
    if (this.commonPasswords.has(value.toLowerCase())) {
      throw new BadRequestException('La contraseña no es suficientemente segura');
    }
  }
}
