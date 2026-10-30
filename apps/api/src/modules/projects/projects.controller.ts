import { Body, Controller, Get, Inject, Param, Patch, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { CreateObjectiveDto } from './dto/create-objective.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateObjectiveDto } from './dto/update-objective.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectsService } from './projects.service';

@Controller('organizations/:organizationId')
export class ProjectsController {
  constructor(@Inject(ProjectsService) private readonly projects: ProjectsService) {}

  @Post('projects')
  createProject(
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateProjectDto,
    @Req() request: Request,
  ) {
    return this.projects.createProject(organizationId, dto, request);
  }

  @Get('projects')
  listProjects(@Param('organizationId') organizationId: string, @Req() request: Request) {
    return this.projects.listProjects(organizationId, request);
  }

  @Patch('projects/:projectId')
  updateProject(
    @Param('organizationId') organizationId: string,
    @Param('projectId') projectId: string,
    @Body() dto: UpdateProjectDto,
    @Req() request: Request,
  ) {
    return this.projects.updateProject(organizationId, projectId, dto, request);
  }

  @Post('projects/:projectId/objectives')
  createObjective(
    @Param('organizationId') organizationId: string,
    @Param('projectId') projectId: string,
    @Body() dto: CreateObjectiveDto,
    @Req() request: Request,
  ) {
    return this.projects.createObjective(organizationId, projectId, dto, request);
  }

  @Get('projects/:projectId/objectives')
  listObjectives(
    @Param('organizationId') organizationId: string,
    @Param('projectId') projectId: string,
    @Req() request: Request,
  ) {
    return this.projects.listObjectives(organizationId, projectId, request);
  }

  @Patch('projects/:projectId/objectives/:objectiveId')
  updateObjective(
    @Param('organizationId') organizationId: string,
    @Param('projectId') projectId: string,
    @Param('objectiveId') objectiveId: string,
    @Body() dto: UpdateObjectiveDto,
    @Req() request: Request,
  ) {
    return this.projects.updateObjective(
      organizationId,
      projectId,
      objectiveId,
      dto,
      request,
    );
  }
}
