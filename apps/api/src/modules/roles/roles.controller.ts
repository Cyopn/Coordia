import { Body, Controller, Get, Inject, Param, Patch, Post, Req, forwardRef } from '@nestjs/common';
import { Request } from 'express';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RolesService } from './roles.service';

@Controller('organizations/:organizationId/roles')
export class RolesController {
  constructor(
    @Inject(forwardRef(() => RolesService))
    private readonly roles: RolesService,
  ) {}

  @Get()
  list(@Param('organizationId') organizationId: string, @Req() request: Request) {
    return this.roles.list(organizationId, request);
  }

  @Post()
  create(
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateRoleDto,
    @Req() request: Request,
  ) {
    return this.roles.create(organizationId, dto, request);
  }

  @Patch(':roleId')
  update(
    @Param('organizationId') organizationId: string,
    @Param('roleId') roleId: string,
    @Body() dto: UpdateRoleDto,
    @Req() request: Request,
  ) {
    return this.roles.update(organizationId, roleId, dto, request);
  }
}
