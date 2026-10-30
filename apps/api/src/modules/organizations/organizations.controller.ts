import { Body, Controller, Get, Inject, Param, Post, Req, forwardRef } from '@nestjs/common';
import { Request } from 'express';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { OrganizationsService } from './organizations.service';

@Controller('organizations')
export class OrganizationsController {
  constructor(
    @Inject(forwardRef(() => OrganizationsService))
    private readonly organizations: OrganizationsService,
  ) {}

  @Post()
  create(@Body() dto: CreateOrganizationDto, @Req() request: Request) {
    return this.organizations.create(dto, request);
  }

  @Get()
  list(@Req() request: Request) {
    return this.organizations.list(request);
  }

  @Post(':organizationId/invitations')
  invite(
    @Param('organizationId') organizationId: string,
    @Body() dto: InviteMemberDto,
    @Req() request: Request,
  ) {
    return this.organizations.invite(organizationId, dto, request);
  }

  @Post('invitations/accept')
  accept(@Body() dto: AcceptInvitationDto, @Req() request: Request) {
    return this.organizations.accept(dto.token, request);
  }

  @Post(':organizationId/invitations/:invitationId/revoke')
  revoke(
    @Param('organizationId') organizationId: string,
    @Param('invitationId') invitationId: string,
    @Req() request: Request,
  ) {
    return this.organizations.revoke(organizationId, invitationId, request);
  }
}
