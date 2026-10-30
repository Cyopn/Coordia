import { Body, Controller, Inject, Post, Req, Res, forwardRef } from '@nestjs/common';
import { Request, Response } from 'express';
import { ActivateMfaDto } from './dto/activate-mfa.dto';
import { DisableMfaDto } from './dto/disable-mfa.dto';
import { VerifyLoginMfaDto } from './dto/verify-login-mfa.dto';
import { MfaService } from './mfa.service';

@Controller('security/mfa')
export class MfaController {
  constructor(
    @Inject(forwardRef(() => MfaService))
    private readonly mfa: MfaService,
  ) {}

  @Post('begin')
  begin(@Req() request: Request) {
    return this.mfa.begin(request);
  }

  @Post('activate')
  activate(@Body() dto: ActivateMfaDto, @Req() request: Request) {
    return this.mfa.activate(dto.factorId, dto.code, request);
  }

  @Post('disable')
  disable(@Body() dto: DisableMfaDto, @Req() request: Request) {
    return this.mfa.disable(dto.code, dto.password, request);
  }

  @Post('verify-login')
  verifyLogin(
    @Body() dto: VerifyLoginMfaDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.mfa.completeLogin(
      dto.challengeToken,
      dto.code,
      request,
      response,
    );
  }
}
