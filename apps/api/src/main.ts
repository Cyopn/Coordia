import { SessionWebSocketGateway } from './modules/auth/session-websocket.gateway';
import { createApplication } from './app.factory';

async function bootstrap(): Promise<void> {
  const app = await createApplication();
  const websocket = app.get(SessionWebSocketGateway);
  websocket.attach(app.getHttpServer());
  await app.listen(Number(process.env.API_PORT ?? 3001));
}

void bootstrap();
