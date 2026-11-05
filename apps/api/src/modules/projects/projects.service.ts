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
import { LinkObjectiveTaskDto } from './dto/link-objective-task.dto';

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

  private async projectInOrganization(
    userId: string,
    organizationId: string,
    projectId: string,
    permission: string,
  ) {
    await this.authorization.requireProjectAccess(userId, organizationId, projectId, permission);
    return { id: projectId };
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
    if (dto.ownerId) await this.ensureMembership(organizationId, dto.ownerId);
    if (dto.templateId) {
      const template = await this.prisma.projectTemplate.findFirst({
        where: { id: dto.templateId, organizationId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!template) throw new NotFoundException('Plantilla no encontrada');
    }
    try {
      const project = await this.prisma.project.create({
        data: {
          organizationId,
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          priority: dto.priority,
          delayPolicy: dto.delayPolicy,
          configuration: dto.configuration,
          templateId: dto.templateId,
          ownerId: dto.ownerId,
          startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
          endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
          visibility: dto.visibility,
        },
      });
      if (dto.visibility === 'PRIVATE') {
        const membership = await this.prisma.membership.findUniqueOrThrow({
          where: { userId_organizationId: { userId, organizationId } },
          select: { id: true },
        });
        await this.prisma.projectAccess.create({
          data: { projectId: project.id, membershipId: membership.id },
        });
      }
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
      where: {
        organizationId,
        OR: [
          { visibility: 'ORGANIZATION' },
          { accessGrants: { some: { membership: { userId, status: 'ACTIVE' } } } },
        ],
      },
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
      dto.status === 'ARCHIVED' ? PERMISSIONS.PROJECT_ARCHIVE : PERMISSIONS.PROJECT_UPDATE,
    );
    const projectPermission =
      dto.status === 'ARCHIVED' ? PERMISSIONS.PROJECT_ARCHIVE : PERMISSIONS.PROJECT_UPDATE;
    await this.projectInOrganization(userId, organizationId, projectId, projectPermission);
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
          priority: dto.priority,
          delayPolicy: dto.delayPolicy,
          configuration: dto.configuration,
          ownerId: dto.ownerId,
          startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
          endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
          visibility: dto.visibility,
        },
      });
      await this.audit(organizationId, userId, 'project.updated', project.id);
      return project;
    } catch (error) {
      this.throwDuplicate(error, 'Ya existe un proyecto con ese nombre');
    }

    async deleteProject(organizationId: string, projectId: string, request: Request) {
      const userId = await this.userWithPermission(organizationId, request, PERMISSIONS.PROJECT_DELETE);
      await this.projectInOrganization(userId, organizationId, projectId, PERMISSIONS.PROJECT_DELETE);
      await this.prisma.project.delete({ where: { id: projectId } });
      await this.audit(organizationId, userId, 'project.deleted', projectId);
    }

    private async ensureMembership(organizationId: string, membershipId: string) {
      const membership = await this.prisma.membership.findFirst({
        where: { id: membershipId, organizationId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!membership) throw new NotFoundException('La persona responsable no pertenece a la organización');
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
    await this.projectInOrganization(userId, organizationId, projectId, PERMISSIONS.PROJECT_UPDATE);
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
    await this.projectInOrganization(userId, organizationId, projectId, PERMISSIONS.PROJECT_READ);
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
    await this.projectInOrganization(userId, organizationId, projectId, PERMISSIONS.PROJECT_UPDATE);
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

    async linkObjectiveTask(
      organizationId: string,
      projectId: string,
      objectiveId: string,
      dto: LinkObjectiveTaskDto,
      request: Request,
    ) {
      const userId = await this.userWithPermission(organizationId, request, PERMISSIONS.PROJECT_UPDATE);
      await this.projectInOrganization(userId, organizationId, projectId, PERMISSIONS.PROJECT_UPDATE);
      const objective = await this.prisma.objective.findFirst({ where: { id: objectiveId, projectId }, select: { id: true } });
      const task = await this.prisma.task.findFirst({ where: { id: dto.taskId, projectId }, select: { id: true } });
      if (!objective || !task) throw new NotFoundException('Objetivo o tarea no encontrados');
      const link = await this.prisma.objectiveTask.create({ data: { objectiveId, taskId: dto.taskId } });
      await this.audit(organizationId, userId, 'objective.task_linked', dto.taskId);
      return link;
    }

    async unlinkObjectiveTask(
      organizationId: string,
      projectId: string,
      objectiveId: string,
      taskId: string,
      request: Request,
    ) {
      const userId = await this.userWithPermission(organizationId, request, PERMISSIONS.PROJECT_UPDATE);
      await this.projectInOrganization(userId, organizationId, projectId, PERMISSIONS.PROJECT_UPDATE);
      const objective = await this.prisma.objective.findFirst({ where: { id: objectiveId, projectId }, select: { id: true } });
      if (!objective) throw new NotFoundException('Objetivo no encontrado');
      await this.prisma.objectiveTask.delete({ where: { objectiveId_taskId: { objectiveId, taskId } } });
      await this.audit(organizationId, userId, 'objective.task_unlinked', taskId);
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
