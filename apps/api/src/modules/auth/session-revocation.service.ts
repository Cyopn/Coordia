import { Injectable } from '@nestjs/common';

type RevocationListener = (sessionId: string) => void;

@Injectable()
export class SessionRevocationService {
  private readonly listeners = new Set<RevocationListener>();

  subscribe(listener: RevocationListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(sessionIds: string[]): void {
    for (const sessionId of sessionIds) {
      for (const listener of this.listeners) listener(sessionId);
    }
  }
}
