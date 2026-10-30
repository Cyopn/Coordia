import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request } from 'express';
import { PERMISSIONS } from '@coordia/shared';
import { AuthorizationService } from '../../common/authorization/authorization.service';
import { PrismaService } from '../../common/database/prisma.service';
import { SessionService } from '../auth/session.service';
import { CreateObjectiveDto } from './dto/create-objective.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateObjectiveDto } from './dto/update-objective.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

@Injectable()
export class ProjectsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
  ) {}

  private async userWithPermission(
    organizationId: string,
    request: Request,
    permission: string,
  ): Promise<string> {
    const userId = await this.sessions.requireUser(request);
    await this.authorization.requirePermission(userId, organizationId, permission);
    return userId;
  }

  private async projectInOrganization(organizationId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId },
      select: { id: true },
    });
    if (!project) throw new NotFoundException('Proyecto no encontrado');
    return project;
  }

  async createProject(
    organizationId: string,
    dto: CreateProjectDto,
    request: Request,
  ) {
    const userId = await this.userWithPermission(
      organizationId,
      request,
      PERMISSIONS.PROJECT_CREATE,
    );
    if (dto.startsAt && dto.endsAt && new Date(dto.endsAt) < new Date(dto.startsAt)) {
      throw new ConflictException('La fecha de finalización no puede preceder a la de inicio');
    }
    try {
      const project = await this.prisma.project.create({
        data: {
          organizationId,
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
          endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        },
      });
      await this.audit(organizationId, userId, 'project.created', project.id);
      return project;
    } catch (error) {
      this.throwDuplicate(error, 'Ya existe un proyecto con ese nombre');
    }
  }

  async listProjects(organizationId: string, request: Request) {
    const userId = await this.sessions.requireUser(request);
    await this.authorization.requirePermission(userId, organizationId, PERMISSIONS.PROJECT_READ);
    return this.prisma.project.findMany({
      where: { organizationId },
      include: { _count: { select: { objectives: true } } },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    });
  }

  async updateProject(
    organizationId: string,
    projectId: string,
    dto: UpdateProjectDto,
    request: Request,
  ) {
    const userId = await this.userWithPermission(
      organizationId,
      request,
      PERMISSIONS.PROJECT_UPDATE,
    );
    await this.projectInOrganization(organizationId, projectId);
    if (dto.startsAt && dto.endsAt && new Date(dto.endsAt) < new Date(dto.startsAt)) {
      throw new ConflictException('La fecha de finalización no puede preceder a la de inicio');
    }
    try {
      const project = await this.prisma.project.update({
        where: { id: projectId },
        data: {
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          status: dto.status,
          startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
          endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        },
      });
      await this.audit(organizationId, userId, 'project.updated', project.id);
      return project;
    } catch (error) {
      this.throwDuplicate(error, 'Ya existe un proyecto con ese nombre');
    }
  }

  async createObjective(
    organizationId: string,
    projectId: string,
    dto: CreateObjectiveDto,
    request: Request,
  ) {
    const userId = await this.userWithPermission(
      organizationId,
      request,
      PERMISSIONS.PROJECT_UPDATE,
    );
    await this.projectInOrganization(organizationId, projectId);
    try {
      const objective = await this.prisma.objective.create({
        data: {
          projectId,
          title: dto.title.trim(),
          description: dto.description?.trim() || null,
          dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        },
      });
      await this.audit(organizationId, userId, 'objective.created', objective.id);
      return objective;
    } catch (error) {
      this.throwDuplicate(error, 'Ya existe un objetivo con ese título');
    }
  }

  async listObjectives(organizationId: string, projectId: string, request: Request) {
    const userId = await this.sessions.requireUser(request);
    await this.authorization.requirePermission(userId, organizationId, PERMISSIONS.PROJECT_READ);
    await this.projectInOrganization(organizationId, projectId);
    return this.prisma.objective.findMany({
      where: { projectId },
      orderBy: [{ status: 'asc' }, { dueAt: 'asc' }, { title: 'asc' }],
    });
  }

  async updateObjective(
    organizationId: string,
    projectId: string,
    objectiveId: string,
    dto: UpdateObjectiveDto,
    request: Request,
  ) {
    const userId = await this.userWithPermission(
      organizationId,
      request,
      PERMISSIONS.PROJECT_UPDATE,
    );
    await this.projectInOrganization(organizationId, projectId);
    const objective = await this.prisma.objective.findFirst({
      where: { id: objectiveId, projectId },
      select: { id: true },
    });
    if (!objective) throw new NotFoundException('Objetivo no encontrado');
    try {
      const updated = await this.prisma.objective.update({
        where: { id: objectiveId },
        data: {
          title: dto.title.trim(),
          description: dto.description?.trim() || null,
          status: dto.status,
          dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        },
      });
      await this.audit(organizationId, userId, 'objective.updated', updated.id);
      return updated;
    } catch (error) {
      this.throwDuplicate(error, 'Ya existe un objetivo con ese título');
    }
  }

  private async audit(
    organizationId: string,
    actorId: string,
    action: string,
    resourceId: string,
  ): Promise<void> {
    await this.prisma.auditEvent.create({
      data: {
        organizationId,
        actorId,
        action,
        resourceType: action.split('.')[0] ?? action,
        resourceId,
        result: 'SUCCESS',
      },
    });
  }

  private throwDuplicate(error: unknown, message: string): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException(message);
    }
    throw error;
  }
}
