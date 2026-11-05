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

  private async projectInOrganization(
    userId: string,
    organizationId: string,
    projectId: string,
    permission: string,
  ): Promise<void> {
    await this.authorization.requireProjectAccess(userId, organizationId, projectId, permission);
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
    const collaboratorIds = dto.collaboratorIds ?? [];
    if (new Set(collaboratorIds).size !== collaboratorIds.length) {
      throw new ConflictException('La lista de colaboradores contiene duplicados');
    }
    if (collaboratorIds.length > 0) {
      const count = await this.prisma.membership.count({
        where: { id: { in: collaboratorIds }, organizationId, status: 'ACTIVE' },
      });
      if (count !== collaboratorIds.length) throw new NotFoundException('Un colaborador no pertenece a la organización');
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
      PERMISSIONS.RESOURCE_CREATE,
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
      PERMISSIONS.RESOURCE_CREATE,
    );
    await this.projectInOrganization(userId, organizationId, projectId, PERMISSIONS.RESOURCE_CREATE);
    if (dto.parentTaskId === undefined && dto.dependsOnIds?.includes(dto.parentTaskId ?? '')) {
      throw new ConflictException('Una tarea no puede depender de sí misma');
    }
    await this.validateRelations(organizationId, projectId, dto);
    await this.ensureNoDependencyCycle(projectId, dto.dependsOnIds ?? []);
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
          startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
          estimatedHours: dto.estimatedHours,
          labels: {
            create: (dto.labelIds ?? []).map((labelId) => ({ labelId })),
          },
          dependencies: {
            create: (dto.dependsOnIds ?? []).map((dependsOnId) => ({ dependsOnId })),
          },
          collaborators: {
            create: (dto.collaboratorIds ?? []).map((membershipId) => ({ membershipId })),
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
    await this.projectInOrganization(userId, organizationId, projectId, PERMISSIONS.PROJECT_READ);
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

  async getPlanning(
    organizationId: string,
    projectId: string,
    request: Request,
  ) {
    const userId = await this.sessions.requireUser(request);
    await this.authorization.requireProjectAccess(userId, organizationId, projectId, PERMISSIONS.PROJECT_READ);
    const tasks = await this.prisma.task.findMany({
      where: { projectId },
      select: {
        id: true,
        title: true,
        status: true,
        startsAt: true,
        dueAt: true,
        estimatedHours: true,
        dependencies: { select: { dependsOnId: true } },
      },
    });
    const durations = new Map(tasks.map((task) => [task.id, Math.max(1, Number(task.estimatedHours ?? 1))]));
    const finish = new Map<string, number>();
    const visiting = new Set<string>();
    const critical = new Set<string>();
    const calculate = (taskId: string): number => {
      if (finish.has(taskId)) return finish.get(taskId)!;
      if (visiting.has(taskId)) return 0;
      visiting.add(taskId);
      const task = tasks.find((item) => item.id === taskId);
      const dependencyFinish = Math.max(0, ...(task?.dependencies.map((edge) => calculate(edge.dependsOnId)) ?? []));
      const value = dependencyFinish + (durations.get(taskId) ?? 1);
      visiting.delete(taskId);
      finish.set(taskId, value);
      return value;
    };
    for (const task of tasks) calculate(task.id);
    const projectDuration = Math.max(0, ...finish.values());
    for (const task of tasks) {
      if ((finish.get(task.id) ?? 0) >= projectDuration && projectDuration > 0) critical.add(task.id);
    }
    return {
      projectId,
      tasks,
      blockedTaskIds: tasks.filter((task) => task.status === 'BLOCKED').map((task) => task.id),
      criticalPathTaskIds: [...critical],
      projectDurationHours: projectDuration,
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
      dto.status !== undefined
        ? PERMISSIONS.RESOURCE_STATUS
        : dto.assigneeId !== undefined
          ? PERMISSIONS.RESOURCE_ASSIGN
          : PERMISSIONS.RESOURCE_UPDATE,
    );
    if (dto.status !== undefined && dto.assigneeId !== undefined) {
      await this.authorization.requirePermission(
        userId,
        organizationId,
        PERMISSIONS.RESOURCE_ASSIGN,
      );
    }
    const projectPermission = dto.status !== undefined
      ? PERMISSIONS.RESOURCE_STATUS
      : dto.assigneeId !== undefined
        ? PERMISSIONS.RESOURCE_ASSIGN
        : PERMISSIONS.RESOURCE_UPDATE;
    await this.projectInOrganization(userId, organizationId, projectId, projectPermission);
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, projectId },
      select: { id: true },
    });
    if (!task) throw new NotFoundException('Tarea no encontrada');
    if (dto.parentTaskId === taskId || dto.dependsOnIds?.includes(taskId)) {
      throw new ConflictException('Una tarea no puede relacionarse consigo misma');
    }
    await this.validateRelations(organizationId, projectId, dto);
    await this.ensureNoDependencyCycle(projectId, dto.dependsOnIds ?? [], taskId);
    const updated = await this.prisma.$transaction(async (transaction) => {
      const previous = await transaction.task.findUniqueOrThrow({
        where: { id: taskId },
        select: {
          title: true,
          description: true,
          status: true,
          assigneeId: true,
          priority: true,
          startsAt: true,
          dueAt: true,
          estimatedHours: true,
        },
      });
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
          startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
          estimatedHours: dto.estimatedHours,
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
          collaborators: dto.collaboratorIds
            ? {
                deleteMany: {},
                create: dto.collaboratorIds.map((membershipId) => ({ membershipId })),
              }
            : undefined,
        },
        include: this.taskInclude(),
      });
      const changes = [
        ['status', previous.status, updated.status],
        ['title', previous.title, updated.title],
        ['description', previous.description, updated.description],
        ['assigneeId', previous.assigneeId, updated.assigneeId],
        ['priority', previous.priority, updated.priority],
        ['startsAt', previous.startsAt?.toISOString(), updated.startsAt?.toISOString()],
        ['dueAt', previous.dueAt?.toISOString(), updated.dueAt?.toISOString()],
        ['estimatedHours', previous.estimatedHours?.toString(), updated.estimatedHours?.toString()],
      ].filter(([, oldValue, newValue]) => oldValue !== newValue);
      if (changes.length) {
        const actorMembership = await transaction.membership.findUniqueOrThrow({
          where: { userId_organizationId: { userId, organizationId } },
          select: { id: true },
        });
        await transaction.taskHistory.createMany({
          data: changes.map(([field, oldValue, newValue]) => ({
            taskId,
            actorId: actorMembership.id,
            field: String(field),
            oldValue: oldValue == null ? null : String(oldValue),
            newValue: newValue == null ? null : String(newValue),
          })),
        });
      }
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
    if (dto.dependsOnIds !== undefined || dto.startsAt !== undefined || dto.dueAt !== undefined) {
      await this.recalculateDependentDates(organizationId, projectId, userId);
    }
    return updated;
  }

  async deleteTask(organizationId: string, projectId: string, taskId: string, request: Request) {
    const userId = await this.requirePermission(organizationId, request, PERMISSIONS.RESOURCE_DELETE);
    await this.projectInOrganization(userId, organizationId, projectId, PERMISSIONS.RESOURCE_DELETE);
    const task = await this.prisma.task.findFirst({ where: { id: taskId, projectId }, select: { id: true } });
    if (!task) throw new NotFoundException('Tarea no encontrada');
    await this.prisma.task.delete({ where: { id: taskId } });
    await this.audit(organizationId, userId, 'task.deleted', taskId);
  }

  private async ensureNoDependencyCycle(projectId: string, dependsOnIds: string[], taskId?: string) {
    if (!dependsOnIds.length) return;
    const edges = await this.prisma.taskDependency.findMany({
      where: { task: { projectId } },
      select: { taskId: true, dependsOnId: true },
    });
    const graph = new Map<string, string[]>();
    for (const edge of edges) {
      if (edge.taskId === taskId) continue;
      graph.set(edge.taskId, [...(graph.get(edge.taskId) ?? []), edge.dependsOnId]);
    }

    for (const dependencyId of dependsOnIds) {
      const stack = [dependencyId];
      const visited = new Set<string>();
      while (stack.length) {
        const current = stack.pop();
        if (!current || visited.has(current)) continue;
        if (current === taskId) throw new ConflictException('La dependencia generaría un ciclo');
        visited.add(current);
        stack.push(...(graph.get(current) ?? []));
      }
    }
  }

  private async recalculateDependentDates(
    organizationId: string,
    projectId: string,
    actorId: string,
  ): Promise<void> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId },
      select: { delayPolicy: true },
    });
    if (project?.delayPolicy !== 'AUTO_RESCHEDULE') return;
    const tasks = await this.prisma.task.findMany({
        where: { projectId },
        select: {
          id: true,
          startsAt: true,
          dueAt: true,
          estimatedHours: true,
          dependencies: { select: { dependsOnId: true } },
        },
    });
    const byId = new Map(tasks.map((task) => [task.id, task]));
    const pending = new Set(tasks.map((task) => task.id));
    let changed = true;
    while (pending.size && changed) {
      changed = false;
      for (const taskId of [...pending]) {
          const task = byId.get(taskId);
          if (!task) {
            pending.delete(taskId);
            continue;
          }
          const dependencies = task.dependencies
            .map(({ dependsOnId }) => byId.get(dependsOnId))
            .filter((dependency): dependency is NonNullable<typeof dependency> => Boolean(dependency));
          if (dependencies.some((dependency) => !dependency.dueAt)) continue;
          if (!dependencies.length) {
            pending.delete(taskId);
            continue;
          }
          const start = new Date(Math.max(...dependencies.map((dependency) => dependency.dueAt!.getTime())));
          const durationHours = Math.max(1, Number(task.estimatedHours ?? 1));
          const due = new Date(start.getTime() + durationHours * 60 * 60 * 1000);
          if (task.startsAt?.getTime() !== start.getTime() || task.dueAt?.getTime() !== due.getTime()) {
            const oldStartsAt = task.startsAt?.toISOString();
            const oldDueAt = task.dueAt?.toISOString();
            const actorMembershipId = await this.membershipId(actorId, organizationId);
            const updated = await this.prisma.task.update({
              where: { id: task.id },
              data: { startsAt: start, dueAt: due },
            });
            task.startsAt = updated.startsAt;
            task.dueAt = updated.dueAt;
            await this.prisma.taskHistory.createMany({
              data: [
                { taskId: task.id, actorId: actorMembershipId, field: 'startsAt', oldValue: oldStartsAt, newValue: start.toISOString() },
                { taskId: task.id, actorId: actorMembershipId, field: 'dueAt', oldValue: oldDueAt, newValue: due.toISOString() },
              ],
            });
          }
          pending.delete(taskId);
          changed = true;
      }
    }
  }

  private async membershipId(userId: string, organizationId: string): Promise<string> {
    const membership = await this.prisma.membership.findUniqueOrThrow({
      where: { userId_organizationId: { userId, organizationId } },
      select: { id: true },
    });
    return membership.id;
  }

  private taskInclude() {
    return {
      labels: { include: { label: true } },
      parentTask: { select: { id: true, title: true } },
      assignee: { select: { id: true, user: { select: { id: true, email: true } } } },
      dependencies: { include: { dependsOn: { select: { id: true, title: true, status: true } } } },
      collaborators: { include: { membership: { select: { id: true, user: { select: { id: true, email: true } } } } } },
      _count: { select: { subtasks: true, dependents: true, comments: true } },
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
