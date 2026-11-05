import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../../common/authorization/authorization.module';
import { AuthModule } from '../auth/auth.module';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { TaskCommentsController } from './task-comments.controller';
import { TaskCommentsService } from './task-comments.service';

@Module({
  imports: [AuthModule, AuthorizationModule],
  controllers: [TasksController, TaskCommentsController],
  providers: [TasksService, TaskCommentsService],
})
export class TasksModule {}
