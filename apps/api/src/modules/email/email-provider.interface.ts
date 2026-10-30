export interface EmailMessage {
  readonly to: string;
  readonly templateId: string;
  readonly variables: Readonly<Record<string, string>>;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}
