import { ForbiddenException } from '@nestjs/common';
import { Request } from 'express';

export function assertSameOriginForCookieRequest(
  request: Pick<Request, 'method' | 'headers' | 'cookies'>,
  allowedOrigins: readonly string[],
): void {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method.toUpperCase())) return;
  const sessionCookieName = process.env.SESSION_COOKIE_NAME ?? 'coordia_session';
  if (!request.cookies?.[sessionCookieName]) return;
  const origin = request.headers.origin;
  if (!origin || !allowedOrigins.includes(origin)) {
    throw new ForbiddenException('Origen de solicitud no permitido');
  }
}
