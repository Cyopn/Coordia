import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { EmailMessage, EmailProvider } from './email-provider.interface';

@Injectable()
export class EmailJsProvider implements EmailProvider {
  private readonly logger = new Logger(EmailJsProvider.name);

  async send(message: EmailMessage): Promise<void> {
    const serviceId = process.env.EMAILJS_SERVICE_ID;
    const publicKey = process.env.EMAILJS_PUBLIC_KEY;
    const privateKey = process.env.EMAILJS_PRIVATE_KEY;

    if (!serviceId || !publicKey || !privateKey || !message.templateId) {
      throw new ServiceUnavailableException(
        'El servicio de correo no está configurado',
      );
    }

    let response: Response;
    try {
      response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: serviceId,
          template_id: message.templateId,
          user_id: publicKey,
          accessToken: privateKey,
          template_params: {
            to_email: message.to,
            ...message.variables,
          },
        }),
      });
    } catch (error) {
      this.logger.error(
        `EmailJS network error for template ${message.templateId}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException(
        'No se pudo conectar con el proveedor de correo',
      );
    }

    if (!response.ok) {
      const providerMessage = (await response.text()).trim().slice(0, 300);
      this.logger.error(
        `EmailJS rejected template ${message.templateId} with HTTP ${response.status}: ${providerMessage || 'no response body'}`,
      );
      throw new ServiceUnavailableException(
        'EmailJS rechazó el envío. Revisa el log de la API para conocer el motivo.',
      );
    }
  }
}
