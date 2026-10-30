import { Injectable } from '@nestjs/common';
import { createHash, randomBytes, randomInt } from 'node:crypto';

@Injectable()
export class TokenService {
  createToken(bytes = 32): string {
    return randomBytes(bytes).toString('base64url');
  }

  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  createCode(): string {
    return randomInt(100000, 1000000).toString();
  }
}
