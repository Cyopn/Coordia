import { Controller, Get, Inject, Param, Req, forwardRef } from '@nestjs/common';
import { Request } from 'express';
import { AuditService } from './audit.service';

@Controller('organizations/:organizationId/audit')
export class AuditController {
  constructor(
    @Inject(forwardRef(() => AuditService))
    private readonly audit: AuditService,
  ) {}

  @Get()
  list(@Param('organizationId') organizationId: string, @Req() request: Request) {
    return this.audit.list(organizationId, request);
  }
}
