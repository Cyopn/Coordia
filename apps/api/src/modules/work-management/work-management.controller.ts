import { Body, Controller, Get, Inject, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { CreateCapacityAdjustmentDto } from './dto/create-capacity-adjustment.dto';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateOrganizationSettingsDto } from './dto/update-organization-settings.dto';
import { WorkManagementService } from './work-management.service';

@Controller('organizations/:organizationId')
export class WorkManagementController {
  constructor(@Inject(WorkManagementService) private readonly work: WorkManagementService) {}

  @Get('settings/work')
  getSettings(@Param('organizationId') organizationId: string, @Req() request: Request) {
    return this.work.getSettings(organizationId, request);
  }

  @Patch('settings/work')
  updateSettings(@Param('organizationId') organizationId: string, @Body() dto: UpdateOrganizationSettingsDto, @Req() request: Request) {
    return this.work.updateSettings(organizationId, dto, request);
  }

  @Get('project-templates')
  listTemplates(@Param('organizationId') organizationId: string, @Req() request: Request) {
    return this.work.listTemplates(organizationId, request);
  }

  @Post('project-templates')
  createTemplate(@Param('organizationId') organizationId: string, @Body() dto: CreateTemplateDto, @Req() request: Request) {
    return this.work.createTemplate(organizationId, dto, request);
  }

  @Post('project-templates/:templateId/projects')
  createProjectFromTemplate(
    @Param('organizationId') organizationId: string,
    @Param('templateId') templateId: string,
    @Body('name') name: string,
    @Req() request: Request,
  ) {
    return this.work.createProjectFromTemplate(organizationId, templateId, name, request);
  }

  @Post('capacity-adjustments')
  addCapacityAdjustment(@Param('organizationId') organizationId: string, @Body() dto: CreateCapacityAdjustmentDto, @Req() request: Request) {
    return this.work.addCapacityAdjustment(organizationId, dto, request);
  }

  @Get('workload')
  getWorkload(@Param('organizationId') organizationId: string, @Query('from') from: string | undefined, @Query('to') to: string | undefined, @Req() request: Request) {
    return this.work.getWorkload(organizationId, request, from, to);
  }
}
