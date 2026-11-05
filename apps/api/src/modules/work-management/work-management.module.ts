import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../../common/authorization/authorization.module';
import { AuthModule } from '../auth/auth.module';
import { WorkManagementController } from './work-management.controller';
import { WorkManagementService } from './work-management.service';

@Module({
  imports: [AuthModule, AuthorizationModule],
  controllers: [WorkManagementController],
  providers: [WorkManagementService],
})
export class WorkManagementModule {}
