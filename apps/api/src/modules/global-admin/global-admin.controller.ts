import { Body, Controller, Inject, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { BootstrapGlobalAdminDto } from './dto/bootstrap-global-admin.dto';
import { GlobalAdminService } from './global-admin.service';

@Controller('platform')
export class GlobalAdminController {
  constructor(@Inject(GlobalAdminService) private readonly globalAdmin: GlobalAdminService) {}

  @Post('bootstrap')
  bootstrap(@Body() dto: BootstrapGlobalAdminDto, @Req() request: Request) {
    return this.globalAdmin.bootstrap(dto, request);
  }
}
