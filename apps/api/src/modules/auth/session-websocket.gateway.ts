import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Server as HttpServer, IncomingMessage } from 'node:http';
import { Duplex } from 'node:stream';
import { parse } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { PrismaService } from '../../common/database/prisma.service';
import { SessionRevocationService } from './session-revocation.service';
import { TokenService } from './token.service';

type Connection = { sessionId: string; socket: WebSocket; unsubscribe: () => void };

@Injectable()
export class SessionWebSocketGateway implements OnModuleDestroy {
  private readonly server = new WebSocketServer({ noServer: true });
  private readonly connections = new Set<Connection>();
  private detachUpgrade?: () => void;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(SessionRevocationService) revocations: SessionRevocationService,
  ) {
    revocations.subscribe((sessionId) => {
      for (const connection of this.connections) {
        if (connection.socket.readyState === WebSocket.OPEN) {
          if (connection.sessionId === sessionId) {
            connection.socket.close(4001, 'Sesión revocada');
          }
        }
      }
    });
  }

  attach(httpServer: HttpServer): void {
    const upgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) => {
      if (parse(request.url ?? '').pathname !== '/ws/sessions') return;
      this.server.handleUpgrade(request, socket, head, (client) => {
        this.server.emit('connection', client, request);
      });
    };
    httpServer.on('upgrade', upgrade);
    this.detachUpgrade = () => httpServer.off('upgrade', upgrade);
    this.server.on('connection', (socket, request) => void this.handleConnection(socket, request));
  }

  onModuleDestroy(): void {
    this.detachUpgrade?.();
    for (const connection of this.connections) connection.socket.close(1001, 'Servidor detenido');
    this.server.close();
  }

  private async handleConnection(socket: WebSocket, request: IncomingMessage): Promise<void> {
    const cookies = request.headers.cookie ?? '';
    const rawToken = cookies
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${process.env.SESSION_COOKIE_NAME ?? 'coordia_session'}=`))
      ?.split('=')
      .slice(1)
      .join('=');
    if (!rawToken) {
      socket.close(1008, 'Sesión no válida');
      return;
    }
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: this.tokens.hash(rawToken) },
      select: { id: true, status: true, expiresAt: true },
    });
    if (!session || session.status !== 'ACTIVE' || session.expiresAt <= new Date()) {
      socket.close(1008, 'Sesión no válida');
      return;
    }
    const connection: Connection = {
      sessionId: session.id,
      socket,
      unsubscribe: () => undefined,
    };
    this.connections.add(connection);
    connection.unsubscribe = () => this.connections.delete(connection);
    socket.once('close', connection.unsubscribe);
    socket.send(JSON.stringify({ type: 'session.connected' }));
  }

}
