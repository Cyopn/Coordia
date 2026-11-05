import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { CreateTaskCommentDto } from './dto/create-task-comment.dto';
import { UpdateTaskCommentDto } from './dto/update-task-comment.dto';
import { TaskCommentsService } from './task-comments.service';

@Controller('organizations/:organizationId/projects/:projectId/tasks/:taskId/comments')
export class TaskCommentsController {
  constructor(@Inject(TaskCommentsService) private readonly comments: TaskCommentsService) {}

  @Get()
  list(@Param() params: Record<string, string>, @Req() request: Request) {
    return this.comments.list(params.organizationId, params.projectId, params.taskId, request);
  }

  @Post()
  create(@Param() params: Record<string, string>, @Body() dto: CreateTaskCommentDto, @Req() request: Request) {
    return this.comments.create(params.organizationId, params.projectId, params.taskId, dto, request);
  }

  @Patch(':commentId')
  update(@Param() params: Record<string, string>, @Body() dto: UpdateTaskCommentDto, @Req() request: Request) {
    return this.comments.update(params.organizationId, params.projectId, params.taskId, params.commentId, dto, request);
  }

  @Delete(':commentId')
  remove(@Param() params: Record<string, string>, @Req() request: Request) {
    return this.comments.remove(params.organizationId, params.projectId, params.taskId, params.commentId, request);
  }
}
