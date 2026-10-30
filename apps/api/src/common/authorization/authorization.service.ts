import { ForbiddenException, Injectable } from '@nestjs/common';
import { MembershipStatus } from '@prisma/client';
import { PERMISSIONS } from '@coordia/shared';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class AuthorizationService {
  constructor(private readonly prisma: PrismaService) {}

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
                    key: {
                      in: [
                        permissionKey,
                        ...(permissionKey.startsWith('project:')
                          ? [PERMISSIONS.PROJECT_MANAGE]
                          : []),
                        ...(permissionKey.startsWith('resource:')
                          ? [PERMISSIONS.PROJECT_MANAGE]
                          : []),
                      ],
                    },
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
}
