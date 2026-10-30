import { Body, Controller, Delete, Get, Inject, Param, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { CreateTeamDto } from './dto/create-team.dto';
import { ManageTeamMemberDto } from './dto/manage-team-member.dto';
import { TeamsService } from './teams.service';

@Controller('organizations/:organizationId')
export class TeamsController {
  constructor(@Inject(TeamsService) private readonly teams: TeamsService) {}

  @Post('departments')
  createDepartment(
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateDepartmentDto,
    @Req() request: Request,
  ) {
    return this.teams.createDepartment(organizationId, dto, request);
  }

  @Get('departments')
  listDepartments(@Param('organizationId') organizationId: string, @Req() request: Request) {
    return this.teams.listDepartments(organizationId, request);
  }

  @Post('teams')
  createTeam(
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateTeamDto,
    @Req() request: Request,
  ) {
    return this.teams.createTeam(organizationId, dto, request);
  }

  @Get('teams')
  listTeams(@Param('organizationId') organizationId: string, @Req() request: Request) {
    return this.teams.listTeams(organizationId, request);
  }

  @Post('teams/:teamId/members')
  addMember(
    @Param('organizationId') organizationId: string,
    @Param('teamId') teamId: string,
    @Body() dto: ManageTeamMemberDto,
    @Req() request: Request,
  ) {
    return this.teams.addMember(organizationId, teamId, dto.membershipId, request);
  }

  @Delete('teams/:teamId/members/:membershipId')
  removeMember(
    @Param('organizationId') organizationId: string,
    @Param('teamId') teamId: string,
    @Param('membershipId') membershipId: string,
    @Req() request: Request,
  ) {
    return this.teams.removeMember(organizationId, teamId, membershipId, request);
  }
}
