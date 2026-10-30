import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request } from 'express';
import { PERMISSIONS } from '@coordia/shared';
import { AuthorizationService } from '../../common/authorization/authorization.service';
import { PrismaService } from '../../common/database/prisma.service';
import { SessionService } from '../auth/session.service';
import { CreateLabelDto } from './dto/create-label.dto';
import { CreateTaskDto } from './dto/create-task.dto';
import { ListTasksQueryDto } from './dto/list-tasks-query.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

@Injectable()
export class TasksService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
  ) {}

  private async requirePermission(
    organizationId: string,
    request: Request,
    permission: string,
  ): Promise<string> {
    const userId = await this.sessions.requireUser(request);
    await this.authorization.requirePermission(userId, organizationId, permission);
    return userId;
  }

  private async projectInOrganization(organizationId: string, projectId: string): Promise<void> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId },
      select: { id: true },
    });
    if (!project) throw new NotFoundException('Proyecto no encontrado');
  }

  private async validateRelations(
    organizationId: string,
    projectId: string,
    dto: CreateTaskDto | UpdateTaskDto,
  ): Promise<void> {
    if (dto.parentTaskId) {
      const parent = await this.prisma.task.findFirst({
        where: { id: dto.parentTaskId, projectId },
        select: { id: true },
      });
      if (!parent) throw new NotFoundException('Tarea padre no encontrada');
    }
    if (dto.assigneeId) {
      const assignee = await this.prisma.membership.findFirst({
        where: { id: dto.assigneeId, organizationId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!assignee) throw new NotFoundException('La persona asignada no pertenece a la organización');
    }
    const labelIds = dto.labelIds ?? [];
    if (new Set(labelIds).size !== labelIds.length) {
      throw new ConflictException('La lista de etiquetas contiene duplicados');
    }
    if (labelIds.length > 0) {
      const count = await this.prisma.label.count({
        where: { id: { in: labelIds }, organizationId },
      });
      if (count !== labelIds.length) throw new NotFoundException('Una etiqueta no pertenece a la organización');
    }
    const dependsOnIds = dto.dependsOnIds ?? [];
    if (dependsOnIds.includes(dto.parentTaskId ?? '')) {
      throw new ConflictException('Una tarea no puede depender de su tarea padre');
    }
    if (dependsOnIds.length > 0) {
      if (new Set(dependsOnIds).size !== dependsOnIds.length) {
        throw new ConflictException('La lista de dependencias contiene duplicados');
      }
      const dependencies = await this.prisma.task.findMany({
        where: { id: { in: dependsOnIds }, projectId },
        select: { id: true },
      });
      if (dependencies.length !== dependsOnIds.length) {
        throw new NotFoundException('Una dependencia no pertenece al proyecto');
      }
    }
  }

  async createLabel(organizationId: string, dto: CreateLabelDto, request: Request) {
    const userId = await this.requirePermission(
      organizationId,
      request,
      PERMISSIONS.PROJECT_MANAGE,
    );
    try {
      const label = await this.prisma.label.create({
        data: {
          organizationId,
          name: dto.name.trim(),
          color: dto.color,
        },
      });
      await this.audit(organizationId, userId, 'label.created', label.id);
      return label;
    } catch (error) {
      this.throwDuplicate(error, 'Ya existe una etiqueta con ese nombre');
    }
  }

  async listLabels(organizationId: string, request: Request) {
    const userId = await this.sessions.requireUser(request);
    await this.authorization.requirePermission(userId, organizationId, PERMISSIONS.PROJECT_READ);
    return this.prisma.label.findMany({
      where: { organizationId },
      include: { _count: { select: { tasks: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async createTask(
    organizationId: string,
    projectId: string,
    dto: CreateTaskDto,
    request: Request,
  ) {
    const userId = await this.requirePermission(
      organizationId,
      request,
      PERMISSIONS.PROJECT_MANAGE,
    );
    await this.projectInOrganization(organizationId, projectId);
    if (dto.parentTaskId === undefined && dto.dependsOnIds?.includes(dto.parentTaskId ?? '')) {
      throw new ConflictException('Una tarea no puede depender de sí misma');
    }
    await this.validateRelations(organizationId, projectId, dto);
    const task = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.task.create({
        data: {
          projectId,
          parentTaskId: dto.parentTaskId,
          assigneeId: dto.assigneeId,
          title: dto.title.trim(),
          description: dto.description?.trim() || null,
          status: dto.status,
          priority: dto.priority,
          dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
          labels: {
            create: (dto.labelIds ?? []).map((labelId) => ({ labelId })),
          },
          dependencies: {
            create: (dto.dependsOnIds ?? []).map((dependsOnId) => ({ dependsOnId })),
          },
        },
        include: this.taskInclude(),
      });
      await transaction.auditEvent.create({
        data: {
          organizationId,
          actorId: userId,
          action: 'task.created',
          resourceType: 'task',
          resourceId: created.id,
          result: 'SUCCESS',
        },
      });
      return created;
    });
    return task;
  }

  async listTasks(
    organizationId: string,
    projectId: string,
    query: ListTasksQueryDto,
    request: Request,
  ) {
    const userId = await this.sessions.requireUser(request);
    await this.authorization.requirePermission(userId, organizationId, PERMISSIONS.PROJECT_READ);
    await this.projectInOrganization(organizationId, projectId);
    const where: Prisma.TaskWhereInput = {
      projectId,
      status: query.status,
      priority: query.priority,
      assigneeId: query.assigneeId,
      labels: query.labelId ? { some: { labelId: query.labelId } } : undefined,
      OR: query.search
        ? [
            { title: { contains: query.search.trim(), mode: 'insensitive' } },
            { description: { contains: query.search.trim(), mode: 'insensitive' } },
          ]
        : undefined,
    };
    const skip = (query.page - 1) * query.pageSize;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.task.findMany({
      where,
      include: this.taskInclude(),
      orderBy: [{ status: 'asc' }, { priority: 'desc' }, { dueAt: 'asc' }],
        skip,
        take: query.pageSize,
      }),
      this.prisma.task.count({ where }),
    ]);
    return {
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  async updateTask(
    organizationId: string,
    projectId: string,
    taskId: string,
    dto: UpdateTaskDto,
    request: Request,
  ) {
    const userId = await this.requirePermission(
      organizationId,
      request,
      PERMISSIONS.PROJECT_MANAGE,
    );
    await this.projectInOrganization(organizationId, projectId);
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, projectId },
      select: { id: true },
    });
    if (!task) throw new NotFoundException('Tarea no encontrada');
    if (dto.parentTaskId === taskId || dto.dependsOnIds?.includes(taskId)) {
      throw new ConflictException('Una tarea no puede relacionarse consigo misma');
    }
    await this.validateRelations(organizationId, projectId, dto);
    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.task.update({
        where: { id: taskId },
        data: {
          parentTaskId: dto.parentTaskId,
          assigneeId: dto.assigneeId,
          title: dto.title.trim(),
          description: dto.description?.trim() || null,
          status: dto.status,
          priority: dto.priority,
          dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
          labels: dto.labelIds
            ? {
                deleteMany: {},
                create: dto.labelIds.map((labelId) => ({ labelId })),
              }
            : undefined,
          dependencies: dto.dependsOnIds
            ? {
                deleteMany: {},
                create: dto.dependsOnIds.map((dependsOnId) => ({ dependsOnId })),
              }
            : undefined,
        },
        include: this.taskInclude(),
      });
      await transaction.auditEvent.create({
        data: {
          organizationId,
          actorId: userId,
          action: 'task.updated',
          resourceType: 'task',
          resourceId: taskId,
          result: 'SUCCESS',
        },
      });
      return updated;
    });
  }

  private taskInclude() {
    return {
      labels: { include: { label: true } },
      parentTask: { select: { id: true, title: true } },
      assignee: { select: { id: true, user: { select: { id: true, email: true } } } },
      dependencies: { include: { dependsOn: { select: { id: true, title: true, status: true } } } },
      _count: { select: { subtasks: true, dependents: true } },
    } as const;
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
