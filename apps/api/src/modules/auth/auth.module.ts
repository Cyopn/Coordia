import { forwardRef, Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { MfaModule } from '../mfa/mfa.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { TokenService } from './token.service';

@Module({
  imports: [EmailModule, forwardRef(() => MfaModule)],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    SessionService,
    TokenService,
  ],
  exports: [SessionService, PasswordService, TokenService],
})
export class AuthModule {}
