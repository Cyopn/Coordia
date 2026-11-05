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

@Injectable()
export class WorkManagementService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
  ) {}

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
    const items = dto.items ?? [];
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
      return created;
    });
    await this.audit(organizationId, userId, 'project_template.created', template.id);
    return this.prisma.projectTemplate.findUniqueOrThrow({
      where: { id: template.id },
      include: { workItems: { orderBy: { sortOrder: 'asc' } } },
    });
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
      for (const item of template.workItems) {
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
    const userId = await this.authorized(organizationId, request, PERMISSIONS.CAPACITY_READ);
    void userId;
    const start = from ? new Date(from) : new Date();
    const end = to ? new Date(to) : new Date(start.getTime() + 30 * 86400000);
    const [memberships, settings, tasks, adjustments, absences] = await this.prisma.$transaction([
      this.prisma.membership.findMany({
        where: { organizationId, status: 'ACTIVE' },
        include: { user: { select: { id: true, email: true } } },
      }),
      this.prisma.organizationSettings.findUnique({ where: { organizationId } }),
      this.prisma.task.findMany({
        where: { project: { organizationId }, assigneeId: { not: null }, startsAt: { lt: end }, dueAt: { gte: start } },
        select: { assigneeId: true, estimatedHours: true, status: true },
      }),
      this.prisma.workCapacityAdjustment.findMany({ where: { organizationId, date: { gte: start, lte: end } } }),
      this.prisma.workAbsence.findMany({ where: { organizationId, startsAt: { lte: end }, endsAt: { gte: start } } }),
    ]);
    const workingDays = this.workingDays(settings?.workingDays);
    const dailyHours = this.workingHours(settings?.workingHours);
    return memberships.map((membership) => {
      const assigned = tasks.filter((task) => task.assigneeId === membership.id)
        .reduce((sum, task) => sum + Number(task.estimatedHours ?? 0), 0);
      const adjusted = adjustments.filter((item) => item.membershipId === membership.id)
        .reduce((sum, item) => sum + (item.type === 'INCREASE' ? Number(item.hours) : -Number(item.hours)), 0);
      const absentDays = absences
        .filter((item) => item.membershipId === membership.id)
        .reduce((days, item) => days + this.workingDaysBetween(
          new Date(Math.max(item.startsAt.getTime(), start.getTime())),
          new Date(Math.min(item.endsAt.getTime(), end.getTime())),
          workingDays,
        ), 0);
      const capacity = Math.max(0, this.workingDaysBetween(start, end, workingDays) - absentDays) * dailyHours + adjusted;
      return { membershipId: membership.id, user: membership.user, assignedHours: assigned, capacityHours: capacity, overCapacity: assigned > capacity };
    });
  }

  private workingHours(value: unknown): number {
    if (!value || typeof value !== 'object') return 40;
    const record = value as { start?: string; end?: string };
    if (!record.start || !record.end) return 40;
    const [startHour = 0, startMinute = 0] = record.start.split(':').map(Number);
    const [endHour = 0, endMinute = 0] = record.end.split(':').map(Number);
    return Math.max(0, ((endHour * 60 + endMinute) - (startHour * 60 + startMinute)) / 60) * 5;
  }

  private workingDays(value: unknown): number[] {
    return Array.isArray(value) && value.every((day) => Number.isInteger(day))
      ? value as number[]
      : [1, 2, 3, 4, 5];
  }

  private workingDaysBetween(start: Date, end: Date, days: number[]): number {
    let total = 0;
    const cursor = new Date(start);
    cursor.setHours(0, 0, 0, 0);
    const last = new Date(end);
    last.setHours(0, 0, 0, 0);
    while (cursor <= last) {
      if (days.includes(cursor.getDay() || 7)) total += 1;
      cursor.setDate(cursor.getDate() + 1);
    }
    return total;
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
