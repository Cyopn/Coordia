import { forwardRef, Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { MfaModule } from '../mfa/mfa.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { TokenService } from './token.service';
import { AuthThrottleService } from './auth-throttle.service';
import { AuthCleanupService } from './auth-cleanup.service';
import { SessionRevocationService } from './session-revocation.service';
import { SessionWebSocketGateway } from './session-websocket.gateway';

@Module({
  imports: [EmailModule, forwardRef(() => MfaModule)],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthThrottleService,
    AuthCleanupService,
    SessionRevocationService,
    SessionWebSocketGateway,
    PasswordService,
    SessionService,
    TokenService,
  ],
  exports: [
    SessionService,
    PasswordService,
    TokenService,
    AuthThrottleService,
    SessionRevocationService,
    SessionWebSocketGateway,
  ],
})
export class AuthModule {}
