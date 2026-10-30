import Link from 'next/link';
import { EmailVerificationForm } from '../../components/email-verification-form';

export default function VerifyEmailPage() {
  return (
    <main className="auth-page">
      <p className="eyebrow">Coordia</p>
      <h1>Verifica tu cuenta</h1>
      <p>Introduce el código de 6 dígitos que recibiste por correo para activar tu cuenta.</p>
      <EmailVerificationForm />
      <p><Link href="/login">Volver a iniciar sesión</Link></p>
    </main>
  );
}
