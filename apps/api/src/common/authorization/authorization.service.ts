import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { MembershipStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class AuthorizationService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async hasPermission(
    userId: string,
    organizationId: string,
    permissionKey: string,
  ): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isGlobalAdmin: true },
    });
    if (user?.isGlobalAdmin) return true;
    const membership = await this.prisma.membership.findFirst({
      where: {
        userId,
        organizationId,
        status: MembershipStatus.ACTIVE,
        roles: {
          some: {
            role: {
              permissions: {
                some: {
                  permission: {
                    key: permissionKey,
                  },
                },
              },
            },
          },
        },
      },
      select: { id: true },
    });
    return membership !== null;
  }

  async requirePermission(
    userId: string,
    organizationId: string,
    permissionKey: string,
  ): Promise<void> {
    if (!(await this.hasPermission(userId, organizationId, permissionKey))) {
      throw new ForbiddenException('No tienes permiso para realizar esta operación');
    }
  }

  async requireMembership(userId: string, organizationId: string): Promise<void> {
    const membership = await this.prisma.membership.findFirst({
      where: {
        userId,
        organizationId,
        status: MembershipStatus.ACTIVE,
      },
      select: { id: true },
    });
    if (!membership) throw new ForbiddenException('No perteneces a esta organización');
  }

  async requireProjectAccess(
    userId: string,
    organizationId: string,
    projectId: string,
    permissionKey: string,
  ): Promise<void> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId },
      select: {
        visibility: true,
        accessGrants: {
          where: { membership: { userId, status: MembershipStatus.ACTIVE } },
          select: { membershipId: true },
        },
      },
    });
    if (!project) throw new ForbiddenException('Recurso no disponible');
    if (project.visibility === 'PRIVATE' && project.accessGrants.length === 0) {
      throw new ForbiddenException('No tienes acceso a este proyecto');
    }
    await this.requirePermission(userId, organizationId, permissionKey);
  }
}
