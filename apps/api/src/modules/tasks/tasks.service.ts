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
import { Temporal } from '@js-temporal/polyfill';

@Injectable()
export class TasksService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
  ) { }

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
        where: {
          id: dto.parentTaskId,
          organizationId,
          projectId,
        },
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
        where: {
          id: { in: dependsOnIds },
          organizationId,
          projectId,
        },
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

  private async ensureNoDependencyCycleInTransaction(
    transaction: Prisma.TransactionClient,
    projectId: string,
    dependsOnIds: string[],
    taskId: string,
  ): Promise<void> {
    if (!dependsOnIds.length) return;

    const edges = await transaction.taskDependency.findMany({
      where: { projectId },
      select: {
        taskId: true,
        dependsOnId: true,
      },
    });

    const graph = new Map<string, string[]>();

    for (const edge of edges) {
      if (edge.taskId === taskId) continue;

      graph.set(edge.taskId, [
        ...(graph.get(edge.taskId) ?? []),
        edge.dependsOnId,
      ]);
    }

    for (const dependencyId of dependsOnIds) {
      const stack = [dependencyId];
      const visited = new Set<string>();

      while (stack.length) {
        const current = stack.pop();

        if (!current || visited.has(current)) continue;

        if (current === taskId) {
          throw new ConflictException(
            'La dependencia generaría un ciclo',
          );
        }

        visited.add(current);
        stack.push(...(graph.get(current) ?? []));
      }
    }
  }

  private async lockProjectDependencyGraph(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    projectId: string,
  ): Promise<void> {
    const lockKey = `dependencies:${organizationId}:${projectId}`;

    await transaction.$queryRaw`
    SELECT pg_advisory_xact_lock(
      hashtextextended(${lockKey}, 0)
    )
  `;
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
    await this.validateRelations(organizationId, projectId, dto);
    await this.ensureNoDependencyCycle(projectId, dto.dependsOnIds ?? []);
    const task = await this.prisma.$transaction(async (transaction) => {
      if (dto.dependsOnIds?.length) {
        await this.lockProjectDependencyGraph(
          transaction,
          organizationId,
          projectId,
        );
      }
      const dependencyIdsToLock = [...new Set(dto.dependsOnIds ?? [])]
        .sort((a, b) => a.localeCompare(b));

      for (const dependencyId of dependencyIdsToLock) {
        await this.lockTaskRow(
          transaction,
          organizationId,
          projectId,
          dependencyId,
        );
      }

      await this.lockAssignmentCapacity(
        transaction,
        organizationId,
        [dto.assigneeId],
      );

      await this.ensureAssignmentCapacity(
        transaction,
        organizationId,
        projectId,
        {
          assigneeId: dto.assigneeId,
          startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
          dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
          estimatedHours: dto.estimatedHours,
        },
      );
      const created = await transaction.task.create({
        data: {
          organizationId,
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
            create: (dto.labelIds ?? []).map((labelId) => ({
              organizationId,
              labelId,
            })),
          },
          collaborators: {
            create: (dto.collaboratorIds ?? []).map((membershipId) => ({
              organizationId,
              membershipId,
            })),
          },
        },
        include: this.taskInclude(),
      });
      if (dto.dependsOnIds?.length) {
        await transaction.taskDependency.createMany({
          data: dto.dependsOnIds.map((dependsOnId) => ({
            projectId,
            taskId: created.id,
            dependsOnId,
          })),
        });
      }
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

    await this.recalculateDependentDates(
      organizationId,
      projectId,
      userId,
    );

    return this.prisma.task.findUniqueOrThrow({
      where: {
        organizationId_id: {
          organizationId,
          id: task.id,
        },
      },
      include: this.taskInclude(),
    });
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
    const earliestStart = new Map<string, number>();
    const earliestFinish = new Map<string, number>();
    const successors = new Map<string, string[]>();
    const visiting = new Set<string>();
    const topological: string[] = [];
    for (const task of tasks) {
      for (const dependency of task.dependencies) {
        successors.set(dependency.dependsOnId, [
          ...(successors.get(dependency.dependsOnId) ?? []),
          task.id,
        ]);
      }
    }
    const calculate = (taskId: string): number => {
      if (earliestFinish.has(taskId)) return earliestFinish.get(taskId)!;
      if (visiting.has(taskId)) throw new ConflictException('El proyecto contiene una dependencia circular');
      visiting.add(taskId);
      const task = tasks.find((item) => item.id === taskId);
      const start = Math.max(
        0,
        ...(task?.dependencies.map((edge) => calculate(edge.dependsOnId)) ?? []),
      );
      earliestStart.set(taskId, start);
      const finish = start + (durations.get(taskId) ?? 1);
      earliestFinish.set(taskId, finish);
      visiting.delete(taskId);
      topological.push(taskId);
      return finish;
    };
    for (const task of tasks) calculate(task.id);
    const projectDuration = Math.max(0, ...earliestFinish.values());
    const latestFinish = new Map<string, number>();
    const latestStart = new Map<string, number>();
    for (const taskId of [...topological].reverse()) {
      const next = successors.get(taskId) ?? [];
      const finish = next.length
        ? Math.min(...next.map((successorId) => latestStart.get(successorId) ?? projectDuration))
        : projectDuration;
      latestFinish.set(taskId, finish);
      latestStart.set(taskId, finish - (durations.get(taskId) ?? 1));
    }
    const critical = topological.filter((taskId) =>
      Math.abs((latestStart.get(taskId) ?? 0) - (earliestStart.get(taskId) ?? 0)) < 0.0001,
    );
    return {
      projectId,
      tasks,
      blockedTaskIds: tasks.filter((task) => task.status === 'BLOCKED').map((task) => task.id),
      criticalPathTaskIds: critical,
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
      select: {
        id: true,
        description: true,
        assigneeId: true,
        startsAt: true,
        dueAt: true,
        estimatedHours: true,
        dependencies: { select: { dependsOnId: true } },
        collaborators: { select: { membershipId: true } },
      },
    });
    if (!task) throw new NotFoundException('Tarea no encontrada');
    if (dto.parentTaskId === taskId || dto.dependsOnIds?.includes(taskId)) {
      throw new ConflictException('Una tarea no puede relacionarse consigo misma');
    }
    await this.validateRelations(organizationId, projectId, dto);
    await this.ensureNoDependencyCycle(projectId, dto.dependsOnIds ?? [], taskId);
    const updated = await this.prisma.$transaction(async (transaction) => {
      if (dto.dependsOnIds !== undefined) {
        await this.lockProjectDependencyGraph(
          transaction,
          organizationId,
          projectId,
        );
      }
      const rowsToLock = [
        ...new Set([
          taskId,
          ...task.dependencies.map(({ dependsOnId }) => dependsOnId),
          ...(dto.dependsOnIds ?? []),
        ]),
      ].sort((a, b) => a.localeCompare(b));
      for (const rowId of rowsToLock) {
        await this.lockTaskRow(
          transaction,
          organizationId,
          projectId,
          rowId,
        );
      }

      const previous = await transaction.task.findUniqueOrThrow({
        where: {
          organizationId_id: {
            organizationId,
            id: taskId,
          },
        },
        select: {
          title: true,
          description: true,
          parentTaskId: true,
          status: true,
          assigneeId: true,
          priority: true,
          startsAt: true,
          dueAt: true,
          estimatedHours: true,
          dependencies: { select: { dependsOnId: true } },
          collaborators: { select: { membershipId: true } },
        },
      });
      const previousDependencyIds = previous.dependencies
        .map(({ dependsOnId }) => dependsOnId)
        .sort((a, b) => a.localeCompare(b));

      const snapshotDependencyIds = task.dependencies
        .map(({ dependsOnId }) => dependsOnId)
        .sort((a, b) => a.localeCompare(b));

      if (
        previousDependencyIds.length !== snapshotDependencyIds.length ||
        previousDependencyIds.some(
          (id, index) => id !== snapshotDependencyIds[index],
        )
      ) {
        throw new ConflictException(
          'Las dependencias de la tarea cambiaron concurrentemente. Actualiza la información e intenta nuevamente.',
        );
      }
      if (dto.dependsOnIds !== undefined) {
        await this.ensureNoDependencyCycleInTransaction(
          transaction,
          projectId,
          dto.dependsOnIds,
          taskId,
        );
      }
      const assigneeId =
        dto.assigneeId === undefined
          ? previous.assigneeId
          : dto.assigneeId;

      const startsAt =
        dto.startsAt === undefined
          ? previous.startsAt
          : new Date(dto.startsAt);

      const dueAt =
        dto.dueAt === undefined
          ? previous.dueAt
          : new Date(dto.dueAt);

      const estimatedHours =
        dto.estimatedHours === undefined
          ? Number(previous.estimatedHours ?? 0)
          : dto.estimatedHours;

      await this.lockAssignmentCapacity(
        transaction,
        organizationId,
        [previous.assigneeId, assigneeId],
      );

      await this.ensureAssignmentCapacity(
        transaction,
        organizationId,
        projectId,
        {
          taskId,
          assigneeId: assigneeId ?? undefined,
          startsAt,
          dueAt,
          estimatedHours,
        },
      );
      const updated = await transaction.task.update({
        where: { id: taskId },
        data: {
          parentTaskId: dto.parentTaskId === undefined ? previous.parentTaskId : dto.parentTaskId,
          assigneeId: dto.assigneeId === undefined ? previous.assigneeId : dto.assigneeId,
          title: dto.title === undefined
            ? previous.title
            : dto.title.trim(),
          description: dto.description === undefined ? previous.description : dto.description.trim() || null,
          status: dto.status,
          priority: dto.priority,
          dueAt: dto.dueAt === undefined ? previous.dueAt : new Date(dto.dueAt),
          startsAt: dto.startsAt === undefined ? previous.startsAt : new Date(dto.startsAt),
          estimatedHours: dto.estimatedHours === undefined ? previous.estimatedHours : dto.estimatedHours,
          labels: dto.labelIds
            ? {
              deleteMany: {},
              create: dto.labelIds.map((labelId) => ({
                organizationId,
                labelId,
              })),
            }
            : undefined,
          collaborators: dto.collaboratorIds
            ? {
              deleteMany: {},
              create: dto.collaboratorIds.map((membershipId) => ({
                organizationId,
                membershipId,
              })),
            }
            : undefined,
        },
        include: this.taskInclude(),
      });
      if (dto.dependsOnIds !== undefined) {
        await transaction.taskDependency.deleteMany({
          where: {
            projectId,
            taskId,
          },
        });

        if (dto.dependsOnIds.length) {
          await transaction.taskDependency.createMany({
            data: dto.dependsOnIds.map((dependsOnId) => ({
              projectId,
              taskId,
              dependsOnId,
            })),
          });
        }
      }
      const changes = [
        ['status', previous.status, updated.status],
        ['title', previous.title, updated.title],
        ['description', previous.description, updated.description],
        ['assigneeId', previous.assigneeId, updated.assigneeId],
        ['priority', previous.priority, updated.priority],
        ['startsAt', previous.startsAt?.toISOString(), updated.startsAt?.toISOString()],
        ['dueAt', previous.dueAt?.toISOString(), updated.dueAt?.toISOString()],
        ['estimatedHours', previous.estimatedHours?.toString(), updated.estimatedHours?.toString()],
        ['dependencies', JSON.stringify(previous.dependencies.map((item) => item.dependsOnId).sort()), dto.dependsOnIds ? JSON.stringify([...dto.dependsOnIds].sort()) : undefined],
        ['collaborators', JSON.stringify(previous.collaborators.map((item) => item.membershipId).sort()), dto.collaboratorIds ? JSON.stringify([...dto.collaboratorIds].sort()) : undefined],
      ].filter(([, oldValue, newValue]) => oldValue !== newValue);
      if (changes.length) {
        const actorMembership = await transaction.membership.findUniqueOrThrow({
          where: { userId_organizationId: { userId, organizationId } },
          select: { id: true },
        });
        await transaction.taskHistory.createMany({
          data: changes.map(([field, oldValue, newValue]) => ({
            organizationId,
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
    if (
      dto.dependsOnIds !== undefined ||
      dto.startsAt !== undefined ||
      dto.dueAt !== undefined ||
      dto.estimatedHours !== undefined
    ) {
      await this.recalculateDependentDates(
        organizationId,
        projectId,
        userId,
      );
    }
    return this.prisma.task.findUniqueOrThrow({
      where: {
        organizationId_id: {
          organizationId,
          id: taskId,
        },
      },
      include: this.taskInclude(),
    });
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
    attempt = 0,
  ): Promise<void> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId },
      select: {
        delayPolicy: true,
        configuration: true,
        startsAt: true,
      },
    });

    if (project?.delayPolicy !== 'AUTO_RESCHEDULE') return;

    const organizationSettings =
      await this.prisma.organizationSettings.findUnique({
        where: { organizationId },
        select: {
          workingDays: true,
          workingHours: true,
          timeZone: true,
        },
      });

    const timeZone = organizationSettings?.timeZone ?? 'UTC';

    try {
      Temporal.Instant
        .fromEpochMilliseconds(Date.now())
        .toZonedDateTimeISO(timeZone);
    } catch {
      throw new ConflictException(
        `La zona horaria configurada no es válida: ${timeZone}`,
      );
    }

    const configuration =
      project.configuration && typeof project.configuration === 'object'
        ? project.configuration as {
          workingDays?: unknown;
          workingHours?: unknown;
        }
        : {};

    const schedule = this.schedule(
      configuration.workingDays ?? organizationSettings?.workingDays,
      configuration.workingHours ?? organizationSettings?.workingHours,
    );

    const tasks = await this.prisma.task.findMany({
      where: { projectId, organizationId },
      select: {
        id: true,
        assigneeId: true,
        startsAt: true,
        dueAt: true,
        plannedStartsAt: true,
        plannedFinishAt: true,
        estimatedHours: true,
        dependencies: {
          select: { dependsOnId: true },
        },
      },
    });

    const byId = new Map(tasks.map((task) => [task.id, task]));
    const pending = new Set(tasks.map((task) => task.id));
    const plannedStarts = new Map<string, Date | null>();
    const plannedFinishes = new Map<string, Date | null>();

    while (pending.size) {
      let progress = false;

      for (const taskId of [...pending]) {
        const task = byId.get(taskId);
        if (!task) {
          pending.delete(taskId);
          progress = true;
          continue;
        }

        const dependencyIds = task.dependencies.map(
          ({ dependsOnId }) => dependsOnId,
        );

        if (dependencyIds.some((id) => pending.has(id))) continue;

        const dependencyFinishes = dependencyIds.map(
          (id) => plannedFinishes.get(id) ?? null,
        );

        const dependenciesCanBePlanned =
          dependencyFinishes.every((date) => date !== null);

        const startCandidates = [
          project.startsAt,
          task.startsAt,
          ...dependencyFinishes,
        ].filter((date): date is Date => date !== null);

        let plannedStart: Date | null = null;
        let plannedFinish: Date | null = null;

        if (
          dependenciesCanBePlanned &&
          startCandidates.length > 0
        ) {
          const earliestAllowed = new Date(
            Math.max(...startCandidates.map((date) => date.getTime())),
          );

          plannedStart = this.nextWorkingTime(
            earliestAllowed,
            schedule,
            timeZone,
          );
          const durationHours = Math.max(
            1,
            Number(task.estimatedHours ?? 1),
          );

          plannedFinish = this.addWorkingHours(
            plannedStart,
            durationHours,
            schedule,
            timeZone,
          );
        }

        plannedStarts.set(taskId, plannedStart);
        plannedFinishes.set(taskId, plannedFinish);
        pending.delete(taskId);
        progress = true;
      }

      if (!progress) {
        throw new ConflictException(
          'El proyecto contiene una dependencia circular o inconsistente',
        );
      }
    }

    const sameDate = (
      left: Date | null,
      right: Date | null,
    ): boolean => left?.getTime() === right?.getTime();

    for (const task of tasks) {
      const start = plannedStarts.get(task.id) ?? null;
      const finish = plannedFinishes.get(task.id) ?? null;

      if (
        sameDate(task.plannedStartsAt, start) &&
        sameDate(task.plannedFinishAt, finish)
      ) {
        continue;
      }

      const updated = await this.prisma.$transaction(
        async (transaction) => {
          const snapshotDependencyIds = task.dependencies
            .map(({ dependsOnId }) => dependsOnId);

          const rowsToLock = [
            ...new Set([task.id, ...snapshotDependencyIds]),
          ].sort((a, b) => a.localeCompare(b));

          for (const rowId of rowsToLock) {
            await this.lockTaskRow(
              transaction,
              organizationId,
              projectId,
              rowId,
            );
          }

          const currentTask = await transaction.task.findUniqueOrThrow({
            where: {
              organizationId_id: {
                organizationId,
                id: task.id,
              },
            },
            select: {
              assigneeId: true,
              startsAt: true,
              dueAt: true,
              plannedStartsAt: true,
              plannedFinishAt: true,
              estimatedHours: true,
              dependencies: {
                select: {
                  dependsOnId: true,
                  dependsOn: {
                    select: {
                      plannedFinishAt: true,
                    },
                  },
                },
              },
            },
          });

          const snapshotDependencies = [...task.dependencies]
            .sort((a, b) => a.dependsOnId.localeCompare(b.dependsOnId));

          const currentDependencies = [...currentTask.dependencies]
            .sort((a, b) => a.dependsOnId.localeCompare(b.dependsOnId));

          const dependenciesChanged =
            snapshotDependencies.length !== currentDependencies.length ||
            snapshotDependencies.some((dependency, index) => {
              const currentDependency = currentDependencies[index];
              const snapshotFinish =
                byId.get(dependency.dependsOnId)?.plannedFinishAt ?? null;
              const currentFinish =
                currentDependency?.dependsOn.plannedFinishAt ?? null;

              return (
                dependency.dependsOnId !== currentDependency?.dependsOnId ||
                !sameDate(snapshotFinish, currentFinish)
              );
            });

          const taskChanged =
            currentTask.assigneeId !== task.assigneeId ||
            Number(currentTask.estimatedHours ?? 0) !==
            Number(task.estimatedHours ?? 0) ||
            !sameDate(currentTask.startsAt, task.startsAt) ||
            !sameDate(currentTask.dueAt, task.dueAt) ||
            !sameDate(currentTask.plannedStartsAt, task.plannedStartsAt) ||
            !sameDate(currentTask.plannedFinishAt, task.plannedFinishAt) ||
            dependenciesChanged;

          if (taskChanged) return null;

          if (start && finish) {
            await this.lockAssignmentCapacity(
              transaction,
              organizationId,
              [currentTask.assigneeId],
            );

            await this.ensureAssignmentCapacity(
              transaction,
              organizationId,
              projectId,
              {
                taskId: task.id,
                assigneeId: currentTask.assigneeId ?? undefined,
                startsAt: start,
                dueAt: finish,
                estimatedHours: Number(currentTask.estimatedHours ?? 0),
              },
            );
          }

          const actorMembership =
            await transaction.membership.findUniqueOrThrow({
              where: {
                userId_organizationId: {
                  userId: actorId,
                  organizationId,
                },
              },
              select: { id: true },
            });

          const result = await transaction.task.update({
            where: {
              organizationId_id: {
                organizationId,
                id: task.id,
              },
            },
            data: {
              plannedStartsAt: start,
              plannedFinishAt: finish,
            },
          });

          await transaction.taskHistory.createMany({
            data: [
              {
                organizationId,
                taskId: task.id,
                actorId: actorMembership.id,
                field: 'plannedStartsAt',
                oldValue:
                  currentTask.plannedStartsAt?.toISOString() ?? null,
                newValue: start?.toISOString() ?? null,
              },
              {
                organizationId,
                taskId: task.id,
                actorId: actorMembership.id,
                field: 'plannedFinishAt',
                oldValue:
                  currentTask.plannedFinishAt?.toISOString() ?? null,
                newValue: finish?.toISOString() ?? null,
              },
            ],
          });

          return result;
        },
      );

      if (!updated) {
        if (attempt >= 2) {
          throw new ConflictException(
            'No fue posible recalcular las fechas porque las tareas cambiaron concurrentemente. Intenta nuevamente.',
          );
        }

        return this.recalculateDependentDates(
          organizationId,
          projectId,
          actorId,
          attempt + 1,
        );
      }
      task.plannedStartsAt = updated.plannedStartsAt;
      task.plannedFinishAt = updated.plannedFinishAt;
    }
  }


  private async membershipId(userId: string, organizationId: string): Promise<string> {
    const membership = await this.prisma.membership.findUniqueOrThrow({
      where: { userId_organizationId: { userId, organizationId } },
      select: { id: true },
    });
    return membership.id;
  }

  private schedule(daysValue: unknown, hoursValue: unknown) {
    const defaultDays = [1, 2, 3, 4, 5];

    let days: number[];

    if (daysValue === undefined || daysValue === null) {
      days = defaultDays;
    } else {
      if (
        !Array.isArray(daysValue) ||
        daysValue.length === 0 ||
        !daysValue.every(
          (day) =>
            Number.isInteger(day) &&
            day >= 1 &&
            day <= 7,
        ) ||
        new Set(daysValue).size !== daysValue.length
      ) {
        throw new ConflictException(
          'La configuración de días laborables no es válida. Debe contener días únicos entre 1 y 7.',
        );
      }

      days = [...daysValue] as number[];
    }

    let hours: { start?: string; end?: string };

    if (hoursValue === undefined || hoursValue === null) {
      hours = {
        start: '09:00',
        end: '17:00',
      };
    } else {
      if (
        typeof hoursValue !== 'object' ||
        Array.isArray(hoursValue)
      ) {
        throw new ConflictException(
          'La configuración del horario laboral no es válida.',
        );
      }

      hours = hoursValue as {
        start?: string;
        end?: string;
      };
    }

    const parseTime = (value: string | undefined): number | null => {
      if (typeof value !== 'string') return null;

      const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/);

      if (!match) return null;

      return Number(match[1]) * 60 + Number(match[2]);
    };

    const startMinutes = parseTime(hours.start);
    const endMinutes = parseTime(hours.end);

    if (
      startMinutes === null ||
      endMinutes === null ||
      endMinutes <= startMinutes
    ) {
      throw new ConflictException(
        'El horario laboral no es válido. La hora de finalización debe ser posterior a la hora de inicio.',
      );
    }

    return {
      days,
      startMinutes,
      endMinutes,
    };
  }


  private atLocalTime(
    value: Temporal.ZonedDateTime,
    minutes: number,
    timeZone: string,
  ): Temporal.ZonedDateTime {
    return Temporal.ZonedDateTime.from(
      {
        timeZone,
        year: value.year,
        month: value.month,
        day: value.day,
        hour: Math.floor(minutes / 60),
        minute: minutes % 60,
        second: 0,
        millisecond: 0,
      },
      { disambiguation: 'compatible' },
    );
  }

  private nextWorkingTime(
    value: Date,
    schedule: {
      days: number[];
      startMinutes: number;
      endMinutes: number;
    },
    timeZone: string,
  ): Date {
    let cursor = Temporal.Instant
      .fromEpochMilliseconds(value.getTime())
      .toZonedDateTimeISO(timeZone);

    for (let attempts = 0; attempts < 370; attempts += 1) {
      const isWorkingDay = schedule.days.includes(cursor.dayOfWeek);

      const dayStart = this.atLocalTime(
        cursor,
        schedule.startMinutes,
        timeZone,
      );

      const dayEnd = this.atLocalTime(
        cursor,
        schedule.endMinutes,
        timeZone,
      );

      if (
        isWorkingDay &&
        Temporal.ZonedDateTime.compare(cursor, dayEnd) < 0
      ) {
        const normalized =
          Temporal.ZonedDateTime.compare(cursor, dayStart) < 0
            ? dayStart
            : cursor;

        return new Date(Number(normalized.epochMilliseconds));
      }

      cursor = this.atLocalTime(
        cursor.add({ days: 1 }),
        schedule.startMinutes,
        timeZone,
      );
    }

    throw new ConflictException(
      'No existe una jornada laboral válida para reprogramar la tarea',
    );
  }

  private addWorkingHours(
    start: Date,
    hours: number,
    schedule: {
      days: number[];
      startMinutes: number;
      endMinutes: number;
    },
    timeZone: string,
  ): Date {
    if (!Number.isFinite(hours) || hours <= 0) {
      throw new ConflictException(
        'La duración estimada debe ser un número finito mayor que cero.',
      );
    }
    let remaining = hours;
    let cursor = Temporal.Instant
      .fromEpochMilliseconds(start.getTime())
      .toZonedDateTimeISO(timeZone);

    cursor = Temporal.Instant
      .fromEpochMilliseconds(
        this.nextWorkingTime(
          new Date(Number(cursor.epochMilliseconds)),
          schedule,
          timeZone,
        ).getTime(),
      )
      .toZonedDateTimeISO(timeZone);

    for (let attempts = 0; attempts < 370 && remaining > 0; attempts += 1) {
      const dayEnd = this.atLocalTime(
        cursor,
        schedule.endMinutes,
        timeZone,
      );

      const availableMilliseconds = Math.max(
        0,
        Number(dayEnd.epochMilliseconds - cursor.epochMilliseconds),
      );

      const availableHours = availableMilliseconds / 3_600_000;

      if (remaining <= availableHours) {
        cursor = cursor.add({
          milliseconds: Math.round(remaining * 3_600_000),
        });

        remaining = 0;
        break;
      }

      remaining -= availableHours;

      cursor = this.atLocalTime(
        cursor.add({ days: 1 }),
        schedule.startMinutes,
        timeZone,
      );

      cursor = Temporal.Instant
        .fromEpochMilliseconds(
          this.nextWorkingTime(
            new Date(Number(cursor.epochMilliseconds)),
            schedule,
            timeZone,
          ).getTime(),
        )
        .toZonedDateTimeISO(timeZone);
    }

    if (remaining > 0.000001) {
      throw new ConflictException(
        'La duración excede el calendario laboral disponible',
      );
    }

    return new Date(Number(cursor.epochMilliseconds));
  }


  private async lockAssignmentCapacity(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    membershipIds: Array<string | null | undefined>,
  ): Promise<void> {
    const uniqueIds = [...new Set(
      membershipIds.filter((id): id is string => Boolean(id)),
    )].sort();

    for (const membershipId of uniqueIds) {
      const lockKey = `capacity:${organizationId}:${membershipId}`;

      await transaction.$queryRaw`
      SELECT pg_advisory_xact_lock(
        hashtextextended(${lockKey}, 0)
      )
    `;
    }
  }

  private async lockTaskRow(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    projectId: string,
    taskId: string,
  ): Promise<void> {
    await transaction.$queryRaw`
    SELECT "id"
    FROM "Task"
    WHERE
      "organizationId" = ${organizationId}::uuid
      AND "projectId" = ${projectId}::uuid
      AND "id" = ${taskId}::uuid
    FOR UPDATE
  `;
  }


  private async ensureAssignmentCapacity(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    projectId: string,
    input: {
      taskId?: string;
      assigneeId?: string;
      startsAt: Date | null;
      dueAt: Date | null;
      estimatedHours?: number;
    },
  ): Promise<void> {
    if (
      !input.assigneeId ||
      !input.startsAt ||
      !input.dueAt ||
      input.dueAt < input.startsAt
    ) {
      return;
    }

    const [project, settings] = await Promise.all([
      transaction.project.findFirst({
        where: { id: projectId, organizationId },
        select: { configuration: true },
      }),
      transaction.organizationSettings.findUnique({
        where: { organizationId },
        select: {
          workingDays: true,
          workingHours: true,
          timeZone: true,
        },
      }),
    ]);

    const timeZone = settings?.timeZone ?? 'UTC';

    try {
      Temporal.Instant
        .fromEpochMilliseconds(Date.now())
        .toZonedDateTimeISO(timeZone);
    } catch {
      throw new ConflictException(
        `La zona horaria configurada no es válida: ${timeZone}`,
      );
    }

    const configuration =
      project?.configuration &&
        typeof project.configuration === 'object'
        ? project.configuration as {
          workingDays?: unknown;
          workingHours?: unknown;
        }
        : {};

    const schedule = this.schedule(
      configuration.workingDays ?? settings?.workingDays,
      configuration.workingHours ?? settings?.workingHours,
    );

    const dailyHours =
      (schedule.endMinutes - schedule.startMinutes) / 60;

    const rangeStart = this.toDatabaseDate(
      this.localDateFromInstant(input.startsAt, timeZone),
    );

    const rangeEnd = this.toDatabaseDate(
      this.localDateFromInstant(input.dueAt, timeZone),
    );

    const startDate = this.localDateFromInstant(
      input.startsAt,
      timeZone,
    );

    const endDate = this.localDateFromInstant(
      input.dueAt,
      timeZone,
    );

    const totalDays = this.workingLocalDaysBetween(
      startDate,
      endDate,
      schedule.days,
    );

    if (!totalDays || dailyHours <= 0) return;

    const [existing, absences, adjustments] = await Promise.all([
      transaction.task.findMany({
        where: {
          project: { organizationId },
          assigneeId: input.assigneeId,
          id: input.taskId ? { not: input.taskId } : undefined,
          startsAt: { lte: input.dueAt },
          dueAt: { gte: input.startsAt },
        },
        select: {
          startsAt: true,
          dueAt: true,
          estimatedHours: true,
        },
      }),

      transaction.workAbsence.findMany({
        where: {
          organizationId,
          membershipId: input.assigneeId,
          startsAt: { lte: rangeEnd },
          endsAt: { gte: rangeStart },
        },
        select: {
          startsAt: true,
          endsAt: true,
        },
      }),

      transaction.workCapacityAdjustment.findMany({
        where: {
          organizationId,
          membershipId: input.assigneeId,
          date: {
            gte: rangeStart,
            lte: rangeEnd,
          },
        },
        select: {
          date: true,
          hours: true,
          type: true,
        },
      }),
    ]);

    const absenceHours = absences.reduce((sum, absence) => {
      const absenceStart = this.dateOnlyFromDatabase(
        absence.startsAt,
      );

      const absenceEnd = this.dateOnlyFromDatabase(
        absence.endsAt,
      );

      const overlapDays = this.overlapWorkingLocalDays(
        absenceStart,
        absenceEnd,
        startDate,
        endDate,
        schedule.days,
      );

      return sum + overlapDays * dailyHours;
    }, 0);

    const adjustmentHours = adjustments.reduce(
      (sum, adjustment) =>
        sum +
        (adjustment.type === 'INCREASE'
          ? Number(adjustment.hours)
          : -Number(adjustment.hours)),
      0,
    );

    const available = Math.max(
      0,
      totalDays * dailyHours -
      absenceHours +
      adjustmentHours,
    );

    const assigned = existing.reduce((sum, task) => {
      if (!task.startsAt || !task.dueAt) return sum;

      const taskStart = this.localDateFromInstant(
        task.startsAt,
        timeZone,
      );

      const taskEnd = this.localDateFromInstant(
        task.dueAt,
        timeZone,
      );

      const overlapDays = this.overlapWorkingLocalDays(
        taskStart,
        taskEnd,
        startDate,
        endDate,
        schedule.days,
      );

      const taskDays = this.workingLocalDaysBetween(
        taskStart,
        taskEnd,
        schedule.days,
      );

      return sum +
        (taskDays
          ? Number(task.estimatedHours ?? 0) *
          overlapDays / taskDays
          : 0);
    }, 0);

    const requested = Number(input.estimatedHours ?? 0);

    if (assigned + requested > available) {
      throw new ConflictException(
        `La asignación excede la capacidad disponible (${(assigned + requested).toFixed(2)} h de ${available.toFixed(2)} h entre ${startDate.toString()} y ${endDate.toString()})`,
      );
    }
  }


  private localDateFromInstant(
    value: Date,
    timeZone: string,
  ): Temporal.PlainDate {
    return Temporal.Instant
      .fromEpochMilliseconds(value.getTime())
      .toZonedDateTimeISO(timeZone)
      .toPlainDate();
  }

  private dateOnlyFromDatabase(
    value: Date,
  ): Temporal.PlainDate {
    return Temporal.PlainDate.from({
      year: value.getUTCFullYear(),
      month: value.getUTCMonth() + 1,
      day: value.getUTCDate(),
    });
  }

  private toDatabaseDate(
    value: Temporal.PlainDate,
  ): Date {
    return new Date(
      Date.UTC(
        value.year,
        value.month - 1,
        value.day,
      ),
    );
  }

  private workingLocalDaysBetween(
    start: Temporal.PlainDate,
    end: Temporal.PlainDate,
    days: number[],
  ): number {
    if (Temporal.PlainDate.compare(end, start) < 0) {
      return 0;
    }

    let count = 0;
    let cursor = start;

    while (Temporal.PlainDate.compare(cursor, end) <= 0) {
      if (days.includes(cursor.dayOfWeek)) {
        count += 1;
      }

      cursor = cursor.add({ days: 1 });
    }

    return count;
  }

  private overlapWorkingLocalDays(
    start: Temporal.PlainDate,
    end: Temporal.PlainDate,
    rangeStart: Temporal.PlainDate,
    rangeEnd: Temporal.PlainDate,
    days: number[],
  ): number {
    if (
      Temporal.PlainDate.compare(end, rangeStart) < 0 ||
      Temporal.PlainDate.compare(start, rangeEnd) > 0
    ) {
      return 0;
    }

    const overlapStart =
      Temporal.PlainDate.compare(start, rangeStart) > 0
        ? start
        : rangeStart;

    const overlapEnd =
      Temporal.PlainDate.compare(end, rangeEnd) < 0
        ? end
        : rangeEnd;

    return this.workingLocalDaysBetween(
      overlapStart,
      overlapEnd,
      days,
    );
  }


  private dailyHours(value: { start?: string; end?: string }): number {
    const start = value.start?.match(/^(\d{2}):(\d{2})$/);
    const end = value.end?.match(/^(\d{2}):(\d{2})$/);
    if (!start || !end) return 8;
    return Math.max(0, ((Number(end[1]) * 60 + Number(end[2])) - (Number(start[1]) * 60 + Number(start[2]))) / 60);
  }

  private startOfUtcDay(value: Date): Date {
    return new Date(Date.UTC(
      value.getUTCFullYear(),
      value.getUTCMonth(),
      value.getUTCDate(),
    ));
  }

  private eachUtcDay(start: Date, end: Date): Date[] {
    const dates: Date[] = [];
    const cursor = this.startOfUtcDay(start);
    const last = this.startOfUtcDay(end);

    while (cursor <= last) {
      dates.push(new Date(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return dates;
  }

  private workingDaysBetween(
    start: Date,
    end: Date,
    days: number[],
  ): number {
    if (end < start) return 0;

    return this.eachUtcDay(start, end).filter((date) =>
      days.includes(date.getUTCDay() || 7),
    ).length;
  }

  private taskHoursOnDay(
    task: {
      startsAt: Date | null;
      dueAt: Date | null;
    },
    date: Date,
    estimatedHours: number,
    workingDays: number[],
  ): number {
    if (
      !task.startsAt ||
      !task.dueAt ||
      estimatedHours <= 0
    ) {
      return 0;
    }

    const start = this.startOfUtcDay(task.startsAt);
    const end = this.startOfUtcDay(task.dueAt);

    if (end < start || date < start || date > end) {
      return 0;
    }

    const totalWorkingDays = this.workingDaysBetween(
      start,
      end,
      workingDays,
    );

    if (
      totalWorkingDays === 0 ||
      !workingDays.includes(date.getUTCDay() || 7)
    ) {
      return 0;
    }

    return estimatedHours / totalWorkingDays;
  }

  private overlapWorkingDays(start: Date, end: Date, rangeStart: Date, rangeEnd: Date, days: number[]): number {
    if (end < rangeStart || start > rangeEnd) return 0;
    return this.workingDaysBetween(
      new Date(Math.max(start.getTime(), rangeStart.getTime())),
      new Date(Math.min(end.getTime(), rangeEnd.getTime())),
      days,
    );
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
