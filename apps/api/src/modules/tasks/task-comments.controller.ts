import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { CreateTaskCommentDto } from './dto/create-task-comment.dto';
import { UpdateTaskCommentDto } from './dto/update-task-comment.dto';
import { TaskCommentsService } from './task-comments.service';

@Controller('organizations/:organizationId/projects/:projectId/tasks/:taskId/comments')
export class TaskCommentsController {
  constructor(@Inject(TaskCommentsService) private readonly comments: TaskCommentsService) {}

  @Get()
  list(
    @Param('organizationId') organizationId: string,
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
    @Req() request: Request,
  ) {
    return this.comments.list(organizationId, projectId, taskId, request);
  }

  @Post()
  create(
    @Param('organizationId') organizationId: string,
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
    @Body() dto: CreateTaskCommentDto,
    @Req() request: Request,
  ) {
    return this.comments.create(organizationId, projectId, taskId, dto, request);
  }

  @Patch(':commentId')
  update(
    @Param('organizationId') organizationId: string,
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
    @Param('commentId') commentId: string,
    @Body() dto: UpdateTaskCommentDto,
    @Req() request: Request,
  ) {
    return this.comments.update(organizationId, projectId, taskId, commentId, dto, request);
  }

  @Delete(':commentId')
  remove(
    @Param('organizationId') organizationId: string,
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
    @Param('commentId') commentId: string,
    @Req() request: Request,
  ) {
    return this.comments.remove(organizationId, projectId, taskId, commentId, request);
  }
}
