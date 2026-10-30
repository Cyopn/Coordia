import { Inject, Injectable } from '@nestjs/common';
import { EmailJsProvider } from './emailjs.provider';

@Injectable()
export class EmailService {
  constructor(@Inject(EmailJsProvider) private readonly provider: EmailJsProvider) {}

  sendVerification(to: string, code: string): Promise<void> {
    return this.provider.send({
      to,
      templateId: process.env.EMAILJS_VERIFICATION_TEMPLATE_ID ?? '',
      variables: {
        subject: 'Verifica tu cuenta de Coordia',
        verification_code: code,
      },
    });
  }

  sendPasswordReset(to: string, link: string): Promise<void> {
    return this.provider.send({
      to,
      templateId: process.env.EMAILJS_GENERAL_TEMPLATE_ID ?? '',
      variables: {
        notification_type: 'Recuperación de cuenta',
        subject: 'Recuperación de cuenta de Coordia',
        message: 'Utiliza el siguiente enlace para restablecer tu contraseña.',
        action_link: link,
      },
    });
  }

  sendInvitation(to: string, link: string): Promise<void> {
    return this.provider.send({
      to,
      templateId: process.env.EMAILJS_GENERAL_TEMPLATE_ID ?? '',
      variables: {
        notification_type: 'Invitación',
        subject: 'Invitación a una organización de Coordia',
        message: 'Utiliza el siguiente enlace para aceptar la invitación.',
        action_link: link,
      },
    });
  }

  sendNewDeviceAlert(to: string, userAgent: string): Promise<void> {
    return this.provider.send({
      to,
      templateId: process.env.EMAILJS_GENERAL_TEMPLATE_ID ?? '',
      variables: {
        notification_type: 'Seguridad',
        subject: 'Nuevo dispositivo detectado en Coordia',
        message: `Se detectó un nuevo dispositivo o navegador: ${userAgent}`,
        action_link:
          process.env.WEB_PUBLIC_ORIGIN ??
          process.env.WEB_ORIGIN ??
          'http://localhost:3000',
      },
    });
  }
}
