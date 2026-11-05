import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TaskPriority, TaskStatus } from '@prisma/client';
import { Request } from 'express';
import { PERMISSIONS } from '@coordia/shared';
import { AuthorizationService } from '../../common/authorization/authorization.service';
import { PrismaService } from '../../common/database/prisma.service';
import { SessionService } from '../auth/session.service';
import { CreateCapacityAdjustmentDto } from './dto/create-capacity-adjustment.dto';
import { CreateAbsenceDto } from './dto/create-absence.dto';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateOrganizationSettingsDto } from './dto/update-organization-settings.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';

@Injectable()
export class WorkManagementService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
  ) { }

  async getSettings(organizationId: string, request: Request) {
    const userId = await this.authorized(organizationId, request, PERMISSIONS.ORGANIZATION_SETTINGS);
    void userId;
    return this.prisma.organizationSettings.upsert({
      where: { organizationId },
      create: {
        organizationId,
        taskStatuses: ['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED'],
        taskPriorities: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
        workingDays: [1, 2, 3, 4, 5],
        workingHours: { start: '09:00', end: '17:00' },
        workRules: {},
        planning: { delayPolicy: 'WARN' },
      },
      update: {},
    });
  }

  async updateSettings(organizationId: string, dto: UpdateOrganizationSettingsDto, request: Request) {
    const userId = await this.authorized(organizationId, request, PERMISSIONS.ORGANIZATION_SETTINGS);
    this.validateSettings(dto);
    const settings = await this.prisma.organizationSettings.upsert({
      where: { organizationId },
      create: { organizationId, ...dto } as Prisma.OrganizationSettingsUncheckedCreateInput,
      update: dto as Prisma.OrganizationSettingsUpdateInput,
    });
    await this.audit(organizationId, userId, 'organization.settings_updated', settings.id);
    return settings;
  }

  async listTemplates(organizationId: string, request: Request) {
    const userId = await this.authorized(organizationId, request, PERMISSIONS.TEMPLATE_READ);
    void userId;
    return this.prisma.projectTemplate.findMany({
      where: { organizationId, status: 'ACTIVE' },
      include: { workItems: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { name: 'asc' },
    });
  }

  async createTemplate(organizationId: string, dto: CreateTemplateDto, request: Request) {
    const userId = await this.authorized(organizationId, request, PERMISSIONS.TEMPLATE_MANAGE);
    const membership = await this.prisma.membership.findUniqueOrThrow({
      where: { userId_organizationId: { userId, organizationId } },
      select: { id: true },
    });
    const items = this.validateTemplateItems(dto.items ?? []);
    const template = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.projectTemplate.create({
        data: {
          organizationId,
          createdById: membership.id,
          name: dto.name.trim(),
          description: dto.description?.trim(),
          configuration: dto.configuration as Prisma.InputJsonValue | undefined,
        },
      });
      const itemIds: string[] = [];
      for (const [index, item] of items.entries()) {
        const parentId = item.parentIndex === undefined ? undefined : itemIds[item.parentIndex];
        const createdItem = await transaction.projectWorkItem.create({
          data: {
            templateId: created.id,
            parentId,
            title: item.title.trim(),
            type: item.type,
            status: item.status,
            priority: item.priority,
            estimatedHours: item.estimatedHours,
            sortOrder: index,
          },
        });
        itemIds.push(createdItem.id);
      }
      for (const [index, item] of items.entries()) {
        const dependencyIds = (item.dependsOnIndexes ?? []).map((dependencyIndex) => itemIds[dependencyIndex]);
        if (dependencyIds.some((id) => !id) || dependencyIds.includes(itemIds[index])) {
          throw new ForbiddenException('La plantilla contiene una dependencia inválida');
        }
        if (dependencyIds.length) {
          await transaction.projectWorkItem.update({
            where: { id: itemIds[index] },
            data: { dependsOnIds: dependencyIds as Prisma.InputJsonValue } as unknown as Prisma.ProjectWorkItemUpdateInput,
          });
        }
      }
      return created;
    });
    await this.audit(organizationId, userId, 'project_template.created', template.id);
    return this.prisma.projectTemplate.findUniqueOrThrow({
      where: { id: template.id },
      include: { workItems: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  async updateTemplate(
    organizationId: string,
    templateId: string,
    dto: UpdateTemplateDto,
    request: Request,
  ) {
    const userId = await this.authorized(organizationId, request, PERMISSIONS.TEMPLATE_MANAGE);
    const items = dto.items === undefined ? undefined : this.validateTemplateItems(dto.items);
    const updated = await this.prisma.$transaction(async (transaction) => {
      const template = await transaction.projectTemplate.findFirst({
        where: { id: templateId, organizationId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!template) throw new NotFoundException('Plantilla no encontrada');
      const result = await transaction.projectTemplate.update({
        where: { id: templateId },
        data: {
          name: dto.name.trim(),
          description: dto.description?.trim(),
          configuration: dto.configuration as Prisma.InputJsonValue | undefined,
        },
      });
      if (items) {
        await transaction.projectWorkItem.deleteMany({ where: { templateId } });
        const ids: string[] = [];
        for (const [index, item] of items.entries()) {
          const created = await transaction.projectWorkItem.create({
            data: {
              templateId,
              parentId: item.parentIndex === undefined ? undefined : ids[item.parentIndex],
              title: item.title.trim(),
              type: item.type,
              status: item.status,
              priority: item.priority,
              estimatedHours: item.estimatedHours,
              sortOrder: index,
            },
          });
          ids.push(created.id);
        }
        for (const [index, item] of items.entries()) {
          const dependencyIds = (item.dependsOnIndexes ?? []).map((dependencyIndex) => ids[dependencyIndex]);
          if (dependencyIds.some((id) => !id) || dependencyIds.includes(ids[index])) {
            throw new ForbiddenException('La plantilla contiene una dependencia inválida');
          }
          if (dependencyIds.length) {
            await transaction.projectWorkItem.update({
              where: { id: ids[index] },
              data: { dependsOnIds: dependencyIds as Prisma.InputJsonValue } as unknown as Prisma.ProjectWorkItemUpdateInput,
            });
          }
        }
      }
      return result;
    });
    await this.audit(organizationId, userId, 'project_template.updated', updated.id);
    return updated;
  }

  async archiveTemplate(organizationId: string, templateId: string, request: Request) {
    const userId = await this.authorized(organizationId, request, PERMISSIONS.TEMPLATE_MANAGE);
    const template = await this.prisma.projectTemplate.updateMany({
      where: { id: templateId, organizationId, status: 'ACTIVE' },
      data: { status: 'ARCHIVED' },
    });
    if (!template.count) throw new NotFoundException('Plantilla no encontrada');
    await this.audit(organizationId, userId, 'project_template.archived', templateId);
  }

  async deleteTemplate(organizationId: string, templateId: string, request: Request) {
    const userId = await this.authorized(organizationId, request, PERMISSIONS.TEMPLATE_MANAGE);
    const template = await this.prisma.projectTemplate.findFirst({
      where: { id: templateId, organizationId },
      select: { id: true, _count: { select: { projects: true } } },
    });
    if (!template) throw new NotFoundException('Plantilla no encontrada');
    if (template._count.projects) throw new ForbiddenException('No se puede eliminar una plantilla usada por proyectos');
    await this.prisma.projectTemplate.delete({ where: { id: templateId } });
    await this.audit(organizationId, userId, 'project_template.deleted', templateId);
  }

  async createProjectFromTemplate(
    organizationId: string,
    templateId: string,
    name: string,
    request: Request,
  ) {
    const userId = await this.authorized(organizationId, request, PERMISSIONS.PROJECT_CREATE);
    const template = await this.prisma.projectTemplate.findFirst({
      where: { id: templateId, organizationId, status: 'ACTIVE' },
      include: { workItems: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!template) throw new NotFoundException('Plantilla no encontrada');
    const settings = await this.prisma.organizationSettings.findUnique({
      where: { organizationId },
      select: {
        taskStatuses: true,
        taskPriorities: true,
        workRules: true,
        workingHours: true,
        workingDays: true,
        planning: true,
      },
    });
    const membership = await this.prisma.membership.findUniqueOrThrow({
      where: { userId_organizationId: { userId, organizationId } },
      select: { id: true },
    });
    const configuration = {
      taskStatuses: settings?.taskStatuses ?? ['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED'],
      taskPriorities: settings?.taskPriorities ?? ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
      workRules: settings?.workRules ?? {},
      workingHours: settings?.workingHours ?? { start: '09:00', end: '17:00' },
      workingDays: settings?.workingDays ?? [1, 2, 3, 4, 5],
      planning: settings?.planning ?? { delayPolicy: 'WARN' },
      ...(template.configuration && typeof template.configuration === 'object'
        ? template.configuration as Record<string, unknown>
        : {}),
    };
    const project = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.project.create({
        data: {
          organizationId,
          name: name.trim(),
          ownerId: membership.id,
          templateId: template.id,
          configuration,
        },
      });
      const ids = new Map<string, string>();
      const taskIds = new Map<string, string>();
      for (const item of this.orderTemplateItems(template.workItems)) {
        const copy = await transaction.projectWorkItem.create({
          data: {
            projectId: created.id,
            parentId: item.parentId ? ids.get(item.parentId) : undefined,
            title: item.title,
            type: item.type,
            status: item.status,
            priority: item.priority,
            estimatedHours: item.estimatedHours,
            sortOrder: item.sortOrder,
          },
        });
        ids.set(item.id, copy.id);
        const status = Object.values(TaskStatus).includes(item.status as TaskStatus)
          ? item.status as TaskStatus
          : TaskStatus.TODO;
        const priority = Object.values(TaskPriority).includes(item.priority as TaskPriority)
          ? item.priority as TaskPriority
          : TaskPriority.MEDIUM;
        const task = await transaction.task.create({
          data: {
            projectId: created.id,
            parentTaskId: item.parentId ? taskIds.get(item.parentId) : undefined,
            title: item.title,
            status,
            priority,
            estimatedHours: item.estimatedHours,
          },
        });
        taskIds.set(item.id, task.id);
      }
      for (const item of template.workItems) {
        const templateItem = item as typeof item & { dependsOnIds?: unknown };
        const dependsOnIds = Array.isArray(templateItem.dependsOnIds) ? templateItem.dependsOnIds : [];
        if (dependsOnIds.length) {
          const dependencyTaskIds = dependsOnIds.map((sourceId) => taskIds.get(String(sourceId)));
          if (dependencyTaskIds.some((dependencyId) => !dependencyId)) {
            throw new ForbiddenException('La plantilla contiene una dependencia inexistente');
          }
          await transaction.projectWorkItem.update({
            where: { id: ids.get(item.id)! },
            data: { dependsOnIds: dependsOnIds.map((sourceId) => ids.get(String(sourceId))!) as Prisma.InputJsonValue } as unknown as Prisma.ProjectWorkItemUpdateInput,
          });
          await transaction.taskDependency.createMany({
            data: dependencyTaskIds.map((dependsOnId) => ({
              taskId: taskIds.get(item.id)!,
              dependsOnId: dependsOnId!,
            })),
          });
        }
      }
      return created;
    });
    await this.audit(organizationId, userId, 'project.created_from_template', project.id);
    return project;
  }

  async addCapacityAdjustment(
    organizationId: string,
    dto: CreateCapacityAdjustmentDto,
    request: Request,
  ) {
    const userId = await this.authorized(organizationId, request, PERMISSIONS.CAPACITY_MANAGE);
    const membership = await this.prisma.membership.findFirst({
      where: { id: dto.membershipId, organizationId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!membership) throw new NotFoundException('Membresía no encontrada');
    const adjustment = await this.prisma.workCapacityAdjustment.upsert({
      where: { membershipId_date: { membershipId: dto.membershipId, date: new Date(dto.date) } },
      create: {
        organizationId,
        membershipId: dto.membershipId,
        date: new Date(dto.date),
        hours: dto.hours,
        type: dto.type,
        reason: dto.reason?.trim(),
      },
      update: { hours: dto.hours, type: dto.type, reason: dto.reason?.trim() },
    });
    await this.audit(organizationId, userId, 'capacity.adjustment_updated', adjustment.id);
    return adjustment;
  }

  async addAbsence(organizationId: string, dto: CreateAbsenceDto, request: Request) {
    const userId = await this.authorized(organizationId, request, PERMISSIONS.CAPACITY_MANAGE);
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (endsAt < startsAt) throw new ForbiddenException('El fin de la ausencia no puede preceder al inicio');
    const membership = await this.prisma.membership.findFirst({
      where: { id: dto.membershipId, organizationId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!membership) throw new NotFoundException('Membresía no encontrada');
    const overlap = await this.prisma.workAbsence.findFirst({
      where: {
        membershipId: dto.membershipId,
        startsAt: { lte: endsAt },
        endsAt: { gte: startsAt },
      },
      select: { id: true },
    });
    if (overlap) throw new ForbiddenException('La ausencia se superpone con otra ausencia');
    const absence = await this.prisma.workAbsence.create({
      data: {
        organizationId,
        membershipId: dto.membershipId,
        startsAt,
        endsAt,
        type: dto.type,
        reason: dto.reason?.trim(),
      },
    });
    await this.audit(organizationId, userId, 'capacity.absence_created', absence.id);
    return absence;
  }

  async getWorkload(organizationId: string, request: Request, from?: string, to?: string) {
    const userId = await this.authorized(
      organizationId,
      request,
      PERMISSIONS.CAPACITY_READ,
    );
    void userId;

    const start = from ? new Date(from) : new Date();
    const end = to
      ? new Date(to)
      : new Date(start.getTime() + 30 * 86400000);

    if (
      !Number.isFinite(start.getTime()) ||
      !Number.isFinite(end.getTime()) ||
      end < start
    ) {
      throw new ForbiddenException('El intervalo de consulta no es válido');
    }

    const [memberships, settings, tasks, adjustments, absences] =
      await this.prisma.$transaction([
        this.prisma.membership.findMany({
          where: { organizationId, status: 'ACTIVE' },
          include: {
            user: { select: { id: true, email: true } },
          },
        }),

        this.prisma.organizationSettings.findUnique({
          where: { organizationId },
        }),

        this.prisma.task.findMany({
          where: {
            project: { organizationId },
            assigneeId: { not: null },
            status: {
              notIn: ['DONE', 'CANCELLED'],
            },
          },
          select: {
            id: true,
            assigneeId: true,
            estimatedHours: true,
            startsAt: true,
            dueAt: true,
            status: true,
          },
        }),

        this.prisma.workCapacityAdjustment.findMany({
          where: {
            organizationId,
            date: {
              gte: this.startOfUtcDay(start),
              lte: this.startOfUtcDay(end),
            },
          },
        }),

        this.prisma.workAbsence.findMany({
          where: {
            organizationId,
            startsAt: { lte: this.startOfUtcDay(end) },
            endsAt: { gte: this.startOfUtcDay(start) },
          },
        }),
      ]);

    const workingDays = this.workingDays(settings?.workingDays);
    const dailyHours = this.workingHours(settings?.workingHours);

    return memberships.map((membership) => {
      const memberTasks = tasks.filter(
        (task) => task.assigneeId === membership.id,
      );

      const unplannedTaskCount = memberTasks.filter(
        (task) => !task.startsAt || !task.dueAt,
      ).length;

      const unestimatedTaskCount = memberTasks.filter(
        (task) =>
          task.startsAt &&
          task.dueAt &&
          Number(task.estimatedHours ?? 0) <= 0,
      ).length;

      const plannedTasks = memberTasks.filter(
        (task) =>
          task.startsAt &&
          task.dueAt &&
          Number(task.estimatedHours ?? 0) > 0,
      );

      const memberAdjustments = adjustments.filter(
        (item) => item.membershipId === membership.id,
      );

      const memberAbsences = absences.filter(
        (item) => item.membershipId === membership.id,
      );

      let assignedHours = 0;
      let capacityHours = 0;
      let overCapacity = false;

      for (const date of this.eachUtcDay(start, end)) {
        const dateKey = this.dateKey(date);
        const isWorkingDay = workingDays.includes(date.getUTCDay() || 7);

        if (!isWorkingDay) continue;

        const absent = memberAbsences.some((absence) => {
          const absenceStart = this.startOfUtcDay(absence.startsAt);
          const absenceEnd = this.startOfUtcDay(absence.endsAt);

          return date >= absenceStart && date <= absenceEnd;
        });

        const adjustment = memberAdjustments
          .filter((item) => this.dateKey(item.date) === dateKey)
          .reduce(
            (sum, item) =>
              sum +
              (item.type === 'INCREASE'
                ? Number(item.hours)
                : -Number(item.hours)),
            0,
          );

        const dailyCapacity = absent
          ? 0
          : Math.max(0, dailyHours + adjustment);

        let dailyAssigned = 0;

        for (const task of plannedTasks) {
          dailyAssigned += this.taskHoursOnDay(
            task,
            date,
            Number(task.estimatedHours ?? 0),
            workingDays,
          );
        }

        assignedHours += dailyAssigned;
        capacityHours += dailyCapacity;

        if (dailyAssigned > dailyCapacity + 0.0001) {
          overCapacity = true;
        }
      }

      return {
        membershipId: membership.id,
        user: membership.user,
        assignedHours: Number(assignedHours.toFixed(2)),
        capacityHours: Number(capacityHours.toFixed(2)),
        overCapacity,
        unplannedTaskCount,
        unestimatedTaskCount,
      };
    });
  }

  private workingHours(value: unknown): number {
    if (!value || typeof value !== 'object') return 8;
    const record = value as { start?: string; end?: string };
    if (!record.start || !record.end) return 8;
    const [startHour = 0, startMinute = 0] = record.start.split(':').map(Number);
    const [endHour = 0, endMinute = 0] = record.end.split(':').map(Number);
    const hours = ((endHour * 60 + endMinute) - (startHour * 60 + startMinute)) / 60;
    return Number.isFinite(hours) && hours > 0 ? hours : 8;
  }

  private workingDays(value: unknown): number[] {
    return Array.isArray(value) &&
      value.length > 0 &&
      value.every(
        (day) =>
          Number.isInteger(day) &&
          Number(day) >= 1 &&
          Number(day) <= 7,
      ) &&
      new Set(value).size === value.length
      ? value as number[]
      : [1, 2, 3, 4, 5];
  }

  private startOfUtcDay(value: Date): Date {
    return new Date(Date.UTC(
      value.getUTCFullYear(),
      value.getUTCMonth(),
      value.getUTCDate(),
    ));
  }

  private dateKey(value: Date): string {
    return this.startOfUtcDay(value).toISOString().slice(0, 10);
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
    if (!task.startsAt || !task.dueAt || estimatedHours <= 0) {
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

  private validateTemplateItems(items: CreateTemplateDto['items']) {
    const normalized = items ?? [];
    normalized.forEach((item, index) => {
      if (item.parentIndex !== undefined && (item.parentIndex < 0 || item.parentIndex >= index)) {
        throw new ForbiddenException('La plantilla contiene una referencia de padre inválida');
      }
      if (item.dependsOnIndexes && new Set(item.dependsOnIndexes).size !== item.dependsOnIndexes.length) {
        throw new ForbiddenException('Una plantilla no puede repetir dependencias');
      }
      if (item.dependsOnIndexes?.some((dependencyIndex) => dependencyIndex < 0 || dependencyIndex >= normalized.length || dependencyIndex === index)) {
        throw new ForbiddenException('La plantilla contiene una dependencia inválida');
      }
    });
    const visiting = new Set<number>();
    const visited = new Set<number>();
    const visit = (index: number): void => {
      if (visiting.has(index)) throw new ForbiddenException('La plantilla contiene dependencias circulares');
      if (visited.has(index)) return;
      visiting.add(index);
      for (const dependencyIndex of normalized[index]?.dependsOnIndexes ?? []) visit(dependencyIndex);
      visiting.delete(index);
      visited.add(index);
    };
    normalized.forEach((_, index) => visit(index));
    return normalized;
  }

  private orderTemplateItems<T extends { id: string; parentId: string | null }>(items: T[]): T[] {
    const remaining = [...items].sort((a, b) => a.id.localeCompare(b.id));
    const ordered: T[] = [];
    const placed = new Set<string>();
    while (remaining.length) {
      const index = remaining.findIndex((item) => !item.parentId || placed.has(item.parentId));
      if (index < 0) throw new ForbiddenException('La plantilla contiene una jerarquía circular o inválida');
      const [item] = remaining.splice(index, 1);
      if (!item) throw new ForbiddenException('La plantilla contiene una jerarquía circular o inválida');
      ordered.push(item);
      placed.add(item.id);
    }
    return ordered;
  }

  private validateSettings(dto: UpdateOrganizationSettingsDto) {
    if (dto.workingDays && new Set(dto.workingDays).size !== dto.workingDays.length) {
      throw new ForbiddenException('Los días laborables no pueden repetirse');
    }
    if (dto.workingHours) {
      const value = dto.workingHours as { start?: unknown; end?: unknown };
      if (typeof value.start !== 'string' || typeof value.end !== 'string' ||
        !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value.start) ||
        !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value.end) ||
        value.start >= value.end) {
        throw new ForbiddenException('El horario laboral no es válido');
      }
    }
  }

  private async authorized(organizationId: string, request: Request, permission: string) {
    const userId = await this.sessions.requireUser(request);
    await this.authorization.requirePermission(userId, organizationId, permission);
    return userId;
  }

  private audit(organizationId: string, actorId: string, action: string, resourceId: string) {
    return this.prisma.auditEvent.create({
      data: { organizationId, actorId, action, resourceType: 'work_management', resourceId, result: 'SUCCESS' },
    });
  }
}
