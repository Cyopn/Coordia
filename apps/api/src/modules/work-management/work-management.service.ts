import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request } from 'express';
import { PERMISSIONS } from '@coordia/shared';
import { AuthorizationService } from '../../common/authorization/authorization.service';
import { PrismaService } from '../../common/database/prisma.service';
import { SessionService } from '../auth/session.service';
import { CreateCapacityAdjustmentDto } from './dto/create-capacity-adjustment.dto';
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
      create: { organizationId, ...dto },
      update: dto,
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
          configuration: dto.configuration,
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
    const project = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.project.create({
        data: {
          organizationId,
          name: name.trim(),
          templateId: template.id,
          configuration: template.configuration ?? Prisma.JsonNull,
        },
      });
      const ids = new Map<string, string>();
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

  async getWorkload(organizationId: string, request: Request, from?: string, to?: string) {
    const userId = await this.authorized(organizationId, request, PERMISSIONS.CAPACITY_READ);
    void userId;
    const start = from ? new Date(from) : new Date();
    const end = to ? new Date(to) : new Date(start.getTime() + 30 * 86400000);
    const [memberships, settings, tasks, adjustments] = await this.prisma.$transaction([
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
    ]);
    const defaultHours = this.workingHours(settings?.workingHours);
    return memberships.map((membership) => {
      const assigned = tasks.filter((task) => task.assigneeId === membership.id)
        .reduce((sum, task) => sum + Number(task.estimatedHours ?? 0), 0);
      const adjusted = adjustments.filter((item) => item.membershipId === membership.id)
        .reduce((sum, item) => sum + (item.type === 'INCREASE' ? Number(item.hours) : -Number(item.hours)), 0);
      return { membershipId: membership.id, user: membership.user, assignedHours: assigned, capacityHours: defaultHours + adjusted, overCapacity: assigned > defaultHours + adjusted };
    });
  }

  private workingHours(value: unknown): number {
    if (!value || typeof value !== 'object') return 40;
    const record = value as { start?: string; end?: string };
    if (!record.start || !record.end) return 40;
    const [startHour, startMinute] = record.start.split(':').map(Number);
    const [endHour, endMinute] = record.end.split(':').map(Number);
    return Math.max(0, ((endHour * 60 + endMinute) - (startHour * 60 + startMinute)) / 60) * 5;
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
