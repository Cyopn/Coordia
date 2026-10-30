import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, MembershipStatus } from '@prisma/client';
import { Request } from 'express';
import { PERMISSIONS } from '@coordia/shared';
import { AuthorizationService } from '../../common/authorization/authorization.service';
import { PrismaService } from '../../common/database/prisma.service';
import { SessionService } from '../auth/session.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

const allowedPermissionKeys = new Set<string>(Object.values(PERMISSIONS));

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly authorization: AuthorizationService,
  ) {}

  async list(organizationId: string, request: Request) {
    const userId = await this.sessions.requireUser(request);
    await this.authorization.requirePermission(userId, organizationId, PERMISSIONS.ROLE_READ);
    return this.prisma.role.findMany({
      where: { organizationId },
      select: {
        id: true,
        name: true,
        isSystem: true,
        permissions: { select: { permission: { select: { key: true, description: true } } } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async create(
    organizationId: string,
    dto: CreateRoleDto,
    request: Request,
  ) {
    const userId = await this.sessions.requireUser(request);
    await this.authorization.requirePermission(
      userId,
      organizationId,
      PERMISSIONS.ROLE_CREATE,
    );
    this.validatePermissionKeys(dto.permissionKeys);
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const permissions = await transaction.permission.findMany({
          where: { key: { in: dto.permissionKeys } },
          select: { id: true, key: true },
        });
        if (permissions.length !== new Set(dto.permissionKeys).size) {
          throw new ConflictException('Se solicitó un permiso inexistente');
        }
        const role = await transaction.role.create({
          data: {
            organizationId,
            name: dto.name.trim(),
            permissions: {
              create: permissions.map((permission) => ({
                permissionId: permission.id,
              })),
            },
          },
          include: { permissions: { include: { permission: true } } },
        });
        await transaction.auditEvent.create({
          data: {
            organizationId,
            actorId: userId,
            action: 'role.created',
            resourceType: 'role',
            resourceId: role.id,
            result: 'SUCCESS',
            metadata: { permissionKeys: dto.permissionKeys },
          },
        });
        return role;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Ya existe un rol con ese nombre');
      }
      throw error;
    }
  }

  async update(
    organizationId: string,
    roleId: string,
    dto: UpdateRoleDto,
    request: Request,
  ) {
    const userId = await this.sessions.requireUser(request);
    await this.authorization.requirePermission(
      userId,
      organizationId,
      PERMISSIONS.ROLE_UPDATE,
    );
    this.validatePermissionKeys(dto.permissionKeys);
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, organizationId },
      select: { id: true, isSystem: true },
    });
    if (!role) throw new NotFoundException('Rol no encontrado');
    if (role.isSystem) throw new ConflictException('Los roles del sistema no se pueden modificar');
    const permissions = await this.prisma.permission.findMany({
      where: { key: { in: dto.permissionKeys } },
      select: { id: true },
    });
    if (permissions.length !== new Set(dto.permissionKeys).size) {
      throw new ConflictException('Se solicitó un permiso inexistente');
    }
    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.role.update({
        where: { id: role.id },
        data: {
          name: dto.name.trim(),
          permissions: {
            deleteMany: {},
            create: permissions.map((permission) => ({ permissionId: permission.id })),
          },
        },
        include: { permissions: { include: { permission: true } } },
      });
      await transaction.auditEvent.create({
        data: {
          organizationId,
          actorId: userId,
          action: 'role.updated',
          resourceType: 'role',
          resourceId: role.id,
          result: 'SUCCESS',
          metadata: { permissionKeys: dto.permissionKeys },
        },
      });
      return updated;
    });
  }

  private validatePermissionKeys(permissionKeys: string[]): void {
    const uniqueKeys = new Set(permissionKeys);
    if (uniqueKeys.size !== permissionKeys.length || permissionKeys.some((key) => !allowedPermissionKeys.has(key))) {
      throw new ConflictException('La lista de permisos no es válida');
    }
  }
}
