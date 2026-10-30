import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { config } from 'dotenv';
import { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { SessionWebSocketGateway } from './modules/auth/session-websocket.gateway';

config({ path: '../../.env' });

function validateConfiguration(): void {
  const required = ['DATABASE_URL'];
  const missing = required.filter((name) => !process.env[name]?.trim());
  const numeric = [
    'API_PORT',
    'SESSION_IDLE_MINUTES',
    'SESSION_MAX_HOURS',
    'ADMIN_SESSION_MAX_HOURS',
    'AUTH_THROTTLE_WINDOW_MS',
    'AUTH_THROTTLE_MAX_FAILURES',
    'AUTH_THROTTLE_BLOCK_MS',
    'AUDIT_RETENTION_DAYS',
  ];
  const invalidNumeric = numeric.filter((name) => {
    const value = process.env[name];
    return value !== undefined && (!Number.isFinite(Number(value)) || Number(value) <= 0);
  });
  if (process.env.NODE_ENV === 'production' && !process.env.MFA_ENCRYPTION_KEY?.trim()) {
    missing.push('MFA_ENCRYPTION_KEY');
  }
  if (process.env.NODE_ENV === 'production' && !process.env.WEB_ORIGINS?.trim()) {
    missing.push('WEB_ORIGINS');
  }
  if (missing.length || invalidNumeric.length) {
    throw new Error(
      `Configuración inválida. Faltan: ${missing.join(', ') || 'ninguna'}; ` +
        `valores numéricos inválidos: ${invalidNumeric.join(', ') || 'ninguno'}`,
    );
  }
  if (process.env.MFA_ENCRYPTION_KEY) {
    const keyLength = Buffer.from(process.env.MFA_ENCRYPTION_KEY, 'base64').length;
    if (keyLength !== 32) throw new Error('MFA_ENCRYPTION_KEY debe codificar 32 bytes');
  }
  if (
    process.env.AUDIT_RETENTION_DAYS !== undefined &&
    Number(process.env.AUDIT_RETENTION_DAYS) < 180
  ) {
    throw new Error('AUDIT_RETENTION_DAYS no puede ser menor de 180 días');
  }
}

async function bootstrap(): Promise<void> {
  validateConfiguration();
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (process.env.NODE_ENV === 'production') {
      response.setHeader(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains',
      );
    }
    next();
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  const allowedOrigins = (
    process.env.WEB_ORIGINS ??
    process.env.WEB_ORIGIN ??
    'http://localhost:3000'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });
  const websocket = app.get(SessionWebSocketGateway);
  websocket.attach(app.getHttpServer());
  await app.listen(Number(process.env.API_PORT ?? 3001));
}

void bootstrap();
