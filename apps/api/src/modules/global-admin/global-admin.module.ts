import { forwardRef, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MfaModule } from '../mfa/mfa.module';
import { GlobalAdminController } from './global-admin.controller';
import { GlobalAdminService } from './global-admin.service';

@Module({
  imports: [forwardRef(() => AuthModule), forwardRef(() => MfaModule)],
  controllers: [GlobalAdminController],
  providers: [GlobalAdminService],
})
export class GlobalAdminModule {}
