import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { config } from 'dotenv';
import { AppModule } from './app.module';

config({ path: '../../.env' });

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
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
  await app.listen(Number(process.env.API_PORT ?? 3001));
}

void bootstrap();
