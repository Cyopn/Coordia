import { Body, Controller, Get, Inject, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { CreateLabelDto } from './dto/create-label.dto';
import { CreateTaskDto } from './dto/create-task.dto';
import { ListTasksQueryDto } from './dto/list-tasks-query.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TasksService } from './tasks.service';

@Controller('organizations/:organizationId')
export class TasksController {
  constructor(@Inject(TasksService) private readonly tasks: TasksService) {}

  @Post('labels')
  createLabel(
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateLabelDto,
    @Req() request: Request,
  ) {
    return this.tasks.createLabel(organizationId, dto, request);
  }

  @Get('labels')
  listLabels(@Param('organizationId') organizationId: string, @Req() request: Request) {
    return this.tasks.listLabels(organizationId, request);
  }

  @Post('projects/:projectId/tasks')
  createTask(
    @Param('organizationId') organizationId: string,
    @Param('projectId') projectId: string,
    @Body() dto: CreateTaskDto,
    @Req() request: Request,
  ) {
    return this.tasks.createTask(organizationId, projectId, dto, request);
  }

  @Get('projects/:projectId/tasks')
  listTasks(
    @Param('organizationId') organizationId: string,
    @Param('projectId') projectId: string,
    @Query() query: ListTasksQueryDto,
    @Req() request: Request,
  ) {
    return this.tasks.listTasks(organizationId, projectId, query, request);
  }

  @Patch('projects/:projectId/tasks/:taskId')
  updateTask(
    @Param('organizationId') organizationId: string,
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateTaskDto,
    @Req() request: Request,
  ) {
    return this.tasks.updateTask(organizationId, projectId, taskId, dto, request);
  }
}
