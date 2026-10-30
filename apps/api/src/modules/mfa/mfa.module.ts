import { forwardRef, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MfaController } from './mfa.controller';
import { MfaCryptoService } from './crypto.service';
import { MfaService } from './mfa.service';

@Module({
  imports: [forwardRef(() => AuthModule)],
  controllers: [MfaController],
  providers: [MfaCryptoService, MfaService],
  exports: [MfaService],
})
export class MfaModule {}
