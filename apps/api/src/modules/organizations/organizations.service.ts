import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InvitationStatus, MembershipStatus, Prisma } from '@prisma/client';
import { Request } from 'express';
import { PERMISSIONS, INITIAL_PERMISSION_CATALOG } from '@coordia/shared';
import { AuthorizationService } from '../../common/authorization/authorization.service';
import { PrismaService } from '../../common/database/prisma.service';
import { SessionService } from '../auth/session.service';
import { TokenService } from '../auth/token.service';
import { EmailService } from '../email/email.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { InviteMemberDto } from './dto/invite-member.dto';

@Injectable()
export class OrganizationsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(EmailService) private readonly email: EmailService,
    @Inject(AuthorizationService)
    private readonly authorization: AuthorizationService,
  ) {}

  async create(dto: CreateOrganizationDto, request: Request) {
    const userId = await this.sessions.requireUser(request);
    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          const organization = await transaction.organization.create({
            data: {
              name: dto.name.trim(),
              ownerId: userId,
              settings: { create: { memberLimit: 25 } },
              memberships: {
                create: {
                  userId,
                  status: MembershipStatus.ACTIVE,
                },
              },
            },
          });
          for (const permission of INITIAL_PERMISSION_CATALOG) {
            await transaction.permission.upsert({
              where: { key: permission.key },
              update: { description: permission.description },
              create: permission,
            });
          }
          const ownerRole = await transaction.role.create({
            data: {
              organizationId: organization.id,
              name: 'Propietario',
              isSystem: true,
            },
          });
          const permissions = await transaction.permission.findMany({
            where: { key: { in: INITIAL_PERMISSION_CATALOG.map(({ key }) => key) } },
            select: { id: true },
          });
          await transaction.rolePermission.createMany({
            data: permissions.map((permission) => ({
              roleId: ownerRole.id,
              permissionId: permission.id,
            })),
          });
          const membership = await transaction.membership.findUniqueOrThrow({
            where: { userId_organizationId: { userId, organizationId: organization.id } },
          });
          await transaction.membershipRole.create({
            data: { membershipId: membership.id, roleId: ownerRole.id },
          });
          await transaction.auditEvent.create({
            data: {
              organizationId: organization.id,
              actorId: userId,
              action: 'organization.created',
              resourceType: 'organization',
              resourceId: organization.id,
              result: 'SUCCESS',
            },
          });
          return organization;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new ConflictException('La operación entró en conflicto; inténtalo de nuevo');
      }
      throw error;
    }
  }

  async list(request: Request) {
    const userId = await this.sessions.requireUser(request);
    return this.prisma.organization.findMany({
      where: {
        memberships: { some: { userId, status: MembershipStatus.ACTIVE } },
      },
      select: {
        id: true,
        name: true,
        createdAt: true,
        memberships: {
          where: { userId, status: MembershipStatus.ACTIVE },
          select: { id: true, roles: { select: { role: { select: { name: true } } } } },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async invite(
    organizationId: string,
    dto: InviteMemberDto,
    request: Request,
  ) {
    const userId = await this.sessions.requireUser(request);
    const emailNormalized = dto.email.trim().toLowerCase();
    const invitation = await this.prisma.$transaction(
      async (transaction) => {
        const membership = await transaction.membership.findFirst({
          where: {
            organizationId,
            userId,
            status: MembershipStatus.ACTIVE,
          },
        });
        if (!membership) throw new ForbiddenException('No tienes permiso para invitar miembros');
        await this.authorization.requirePermission(
          userId,
          organizationId,
          PERMISSIONS.MEMBERSHIP_INVITE,
        );
        const organization = await transaction.organization.findUnique({
          where: { id: organizationId },
          include: { settings: true },
        });
        if (!organization?.settings) throw new NotFoundException('Organización no encontrada');
        const activeMembers = await transaction.membership.count({
          where: { organizationId, status: MembershipStatus.ACTIVE },
        });
        if (activeMembers >= organization.settings.memberLimit) {
          throw new ConflictException('Se alcanzó el límite de miembros');
        }
        const existingMembership = await transaction.membership.findFirst({
          where: { organizationId, user: { emailNormalized }, status: MembershipStatus.ACTIVE },
        });
        if (existingMembership) throw new ConflictException('El usuario ya pertenece a la organización');
        await transaction.organizationInvitation.updateMany({
          where: { organizationId, emailNormalized, status: InvitationStatus.PENDING },
          data: { status: InvitationStatus.REVOKED, revokedAt: new Date() },
        });
        const rawToken = this.tokens.createToken();
        const created = await transaction.organizationInvitation.create({
          data: {
            organizationId,
            email: dto.email.trim(),
            emailNormalized,
            tokenHash: this.tokens.hash(rawToken),
            expiresAt: new Date(Date.now() + dto.expiresInDays * 86400000),
            createdById: userId,
          },
          include: { organization: { select: { name: true } } },
        });
        await transaction.auditEvent.create({
          data: {
            organizationId,
            actorId: userId,
            action: 'membership.invitation_created',
            resourceType: 'organization_invitation',
            resourceId: created.id,
            result: 'SUCCESS',
          },
        });
        return { ...created, rawToken };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    await this.email.sendInvitation(
      dto.email,
      `${process.env.WEB_PUBLIC_ORIGIN ?? process.env.WEB_ORIGIN ?? 'http://localhost:3000'}/organization/invitations/accept?token=${encodeURIComponent(invitation.rawToken)}`,
    );
    return { id: invitation.id, expiresAt: invitation.expiresAt };
  }

  async accept(token: string, request: Request) {
    const userId = await this.sessions.requireUser(request);
    const tokenHash = this.tokens.hash(token);
    return this.prisma.$transaction(
      async (transaction) => {
        const invitation = await transaction.organizationInvitation.findUnique({
          where: { tokenHash },
        });
        if (
          !invitation ||
          invitation.status !== InvitationStatus.PENDING ||
          invitation.expiresAt <= new Date()
        ) {
          throw new NotFoundException('Invitación no válida o expirada');
        }
        const user = await transaction.user.findUniqueOrThrow({
          where: { id: userId },
          select: { emailNormalized: true },
        });
        if (user.emailNormalized !== invitation.emailNormalized) {
          throw new ForbiddenException('La invitación no corresponde a esta cuenta');
        }
        const settings = await transaction.organizationSettings.findUniqueOrThrow({
          where: { organizationId: invitation.organizationId },
        });
        const count = await transaction.membership.count({
          where: { organizationId: invitation.organizationId, status: MembershipStatus.ACTIVE },
        });
        if (count >= settings.memberLimit) throw new ConflictException('Se alcanzó el límite de miembros');
        const membership = await transaction.membership.upsert({
          where: {
            userId_organizationId: { userId, organizationId: invitation.organizationId },
          },
          create: {
            userId,
            organizationId: invitation.organizationId,
            status: MembershipStatus.ACTIVE,
          },
          update: { status: MembershipStatus.ACTIVE },
        });
        await transaction.organizationInvitation.update({
          where: { id: invitation.id },
          data: { status: InvitationStatus.ACCEPTED, acceptedAt: new Date() },
        });
        await transaction.auditEvent.create({
          data: {
            organizationId: invitation.organizationId,
            actorId: userId,
            action: 'membership.invitation_accepted',
            resourceType: 'membership',
            resourceId: membership.id,
            result: 'SUCCESS',
          },
        });
        return { organizationId: invitation.organizationId, membershipId: membership.id };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async revoke(organizationId: string, invitationId: string, request: Request) {
    const userId = await this.sessions.requireUser(request);
    const invitation = await this.prisma.organizationInvitation.findFirst({
      where: {
        id: invitationId,
        organizationId,
        status: InvitationStatus.PENDING,
        organization: { memberships: { some: { userId, status: MembershipStatus.ACTIVE } } },
      },
    });
    if (!invitation) throw new NotFoundException('Invitación no encontrada');
    await this.authorization.requirePermission(
      userId,
      organizationId,
      PERMISSIONS.MEMBERSHIP_INVITE,
    );
    await this.prisma.organizationInvitation.update({
      where: { id: invitation.id },
      data: { status: InvitationStatus.REVOKED, revokedAt: new Date() },
    });
    return { message: 'Invitación revocada' };
  }
}
