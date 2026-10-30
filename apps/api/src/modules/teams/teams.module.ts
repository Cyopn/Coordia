import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../../common/authorization/authorization.module';
import { AuthModule } from '../auth/auth.module';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';

@Module({
  imports: [AuthModule, AuthorizationModule],
  controllers: [TeamsController],
  providers: [TeamsService],
})
export class TeamsModule {}
