import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MembershipStatus, Prisma } from '@prisma/client';
import { Request } from 'express';
import { AuthorizationService } from '../../common/authorization/authorization.service';
import { PrismaService } from '../../common/database/prisma.service';
import { SessionService } from '../auth/session.service';
import { PERMISSIONS } from '@coordia/shared';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { CreateTeamDto } from './dto/create-team.dto';

@Injectable()
export class TeamsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
  ) {}

  private async requireAccess(
    organizationId: string,
    request: Request,
    permission: string = PERMISSIONS.TEAM_READ,
  ): Promise<string> {
    const userId = await this.sessions.requireUser(request);
    await this.authorization.requirePermission(userId, organizationId, permission);
    return userId;
  }

  async createDepartment(
    organizationId: string,
    dto: CreateDepartmentDto,
    request: Request,
  ) {
    const userId = await this.requireAccess(organizationId, request, PERMISSIONS.TEAM_CREATE);
    try {
      const department = await this.prisma.department.create({
        data: {
          organizationId,
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
        },
      });
      await this.prisma.auditEvent.create({
        data: {
          organizationId,
          actorId: userId,
          action: 'department.created',
          resourceType: 'department',
          resourceId: department.id,
          result: 'SUCCESS',
        },
      });
      return department;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Ya existe un departamento con ese nombre');
      }
      throw error;
    }
  }

  async listDepartments(organizationId: string, request: Request) {
    await this.requireAccess(organizationId, request);
    return this.prisma.department.findMany({
      where: { organizationId },
      include: { _count: { select: { teams: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async createTeam(organizationId: string, dto: CreateTeamDto, request: Request) {
    const userId = await this.requireAccess(organizationId, request, PERMISSIONS.TEAM_CREATE);
    if (dto.departmentId) {
      const department = await this.prisma.department.findFirst({
        where: { id: dto.departmentId, organizationId },
        select: { id: true },
      });
      if (!department) throw new NotFoundException('Departamento no encontrado');
    }
    try {
      const team = await this.prisma.team.create({
        data: {
          organizationId,
          departmentId: dto.departmentId,
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
        },
        include: { department: true, _count: { select: { members: true } } },
      });
      await this.prisma.auditEvent.create({
        data: {
          organizationId,
          actorId: userId,
          action: 'team.created',
          resourceType: 'team',
          resourceId: team.id,
          result: 'SUCCESS',
        },
      });
      return team;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Ya existe un equipo con ese nombre');
      }
      throw error;
    }
  }

  async listTeams(organizationId: string, request: Request) {
    await this.requireAccess(organizationId, request);
    return this.prisma.team.findMany({
      where: { organizationId },
      include: {
        department: { select: { id: true, name: true } },
        members: {
          include: {
            membership: { select: { id: true, user: { select: { id: true, email: true } } } },
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async addMember(
    organizationId: string,
    teamId: string,
    membershipId: string,
    request: Request,
  ) {
    const userId = await this.requireAccess(organizationId, request, PERMISSIONS.TEAM_ASSIGN);
    const membership = await this.prisma.membership.findFirst({
      where: { id: membershipId, organizationId, status: MembershipStatus.ACTIVE },
      select: { id: true },
    });
    if (!membership) throw new NotFoundException('Membresía no encontrada');
    const team = await this.prisma.team.findFirst({
      where: { id: teamId, organizationId },
      select: { id: true },
    });
    if (!team) throw new NotFoundException('Equipo no encontrado');
    try {
      const member = await this.prisma.teamMember.create({
        data: { teamId, membershipId },
      });
      await this.prisma.auditEvent.create({
        data: {
          organizationId,
          actorId: userId,
          action: 'team.member_added',
          resourceType: 'team',
          resourceId: teamId,
          result: 'SUCCESS',
        },
      });
      return member;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('El miembro ya pertenece al equipo');
      }
      throw error;
    }
  }

  async removeMember(
    organizationId: string,
    teamId: string,
    membershipId: string,
    request: Request,
  ) {
    const userId = await this.requireAccess(organizationId, request, PERMISSIONS.TEAM_ASSIGN);
    const result = await this.prisma.teamMember.deleteMany({
      where: { teamId, membershipId, team: { organizationId } },
    });
    if (result.count === 0) throw new ForbiddenException('El miembro no pertenece al equipo');
    await this.prisma.auditEvent.create({
      data: {
        organizationId,
        actorId: userId,
        action: 'team.member_removed',
        resourceType: 'team',
        resourceId: teamId,
        result: 'SUCCESS',
      },
    });
  }
}
