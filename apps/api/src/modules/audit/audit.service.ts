import { Injectable } from '@nestjs/common';
import { AuditResult, Prisma } from '@prisma/client';
import { Request } from 'express';
import { PERMISSIONS } from '@coordia/shared';
import { AuthorizationService } from '../../common/authorization/authorization.service';
import { PrismaService } from '../../common/database/prisma.service';
import { SessionService } from '../auth/session.service';

@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly authorization: AuthorizationService,
  ) {}

  async list(organizationId: string, request: Request) {
    const userId = await this.sessions.requireUser(request);
    await this.authorization.requirePermission(
      userId,
      organizationId,
      PERMISSIONS.AUDIT_READ,
    );
    return this.prisma.auditEvent.findMany({
      where: { organizationId },
      select: {
        id: true,
        actorId: true,
        action: true,
        resourceType: true,
        resourceId: true,
        result: true,
        metadata: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async record(input: {
    organizationId?: string;
    actorId?: string;
    action: string;
    resourceType: string;
    resourceId?: string;
    result: AuditResult;
    metadata?: Record<string, string | number | boolean | null>;
  }): Promise<void> {
    await this.prisma.auditEvent.create({
      data: {
        organizationId: input.organizationId,
        actorId: input.actorId,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        result: input.result,
        metadata: input.metadata ? this.redact(input.metadata) : undefined,
      },
    });
  }

  private redact(
    metadata: Record<string, string | number | boolean | null>,
  ): Prisma.InputJsonObject {
    const blocked = /password|token|secret|code|key|link/i;
    return Object.fromEntries(
      Object.entries(metadata).map(([name, value]) => [
        name,
        blocked.test(name) ? '[REDACTED]' : value,
      ]),
    ) as Prisma.InputJsonObject;
  }
}
