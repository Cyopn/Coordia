import { Body, Controller, Get, Inject, Param, Post, Req, Res, forwardRef } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RequestEmailChangeDto } from './dto/request-email-change.dto';
import { ConfirmEmailChangeDto } from './dto/confirm-email-change.dto';
import { SessionService } from './session.service';

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(forwardRef(() => AuthService))
    private readonly auth: AuthService,
    @Inject(forwardRef(() => SessionService))
    private readonly sessions: SessionService,
  ) {}

  @Post('register')
  register(@Body() dto: RegisterDto, @Req() request: Request) {
    return this.auth.register(dto, request);
  }

  @Post('verify-email')
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.auth.verifyEmail(dto);
  }

  @Post('resend-verification')
  resendVerification(@Body() dto: ResendVerificationDto) {
    return this.auth.resendVerification(dto);
  }

  @Post('login')
  login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.auth.login(dto, request, response);
  }

  @Post('request-password-reset')
  requestPasswordReset(@Body() dto: RequestPasswordResetDto) {
    return this.auth.requestPasswordReset(dto);
  }

  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto);
  }

  @Post('change-password')
  changePassword(@Body() dto: ChangePasswordDto, @Req() request: Request) {
    return this.auth.changePassword(dto, request);
  }

  @Post('request-email-change')
  requestEmailChange(@Body() dto: RequestEmailChangeDto, @Req() request: Request) {
    return this.auth.requestEmailChange(dto, request);
  }

  @Post('confirm-email-change')
  confirmEmailChange(@Body() dto: ConfirmEmailChangeDto, @Req() request: Request) {
    return this.auth.confirmEmailChange(dto, request);
  }

  @Post('logout')
  logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.sessions.revoke(request, response);
  }

  @Get('sessions')
  sessionsList(@Req() request: Request) {
    return this.sessions.list(request);
  }

  @Post('sessions/revoke-others')
  revokeOtherSessions(@Req() request: Request) {
    return this.sessions.revokeOthers(request);
  }

  @Post('sessions/:sessionId/revoke')
  revokeSession(@Param('sessionId') sessionId: string, @Req() request: Request) {
    return this.sessions.revokeById(sessionId, request);
  }
}
