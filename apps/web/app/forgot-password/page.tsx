import Link from 'next/link';
import { PasswordResetRequest } from '../../components/password-reset-request';

export default function ForgotPasswordPage() {
  return (
    <main className="auth-page">
      <p className="eyebrow">Coordia</p>
      <h1>Recuperar contraseña</h1>
      <p>Te enviaremos instrucciones si existe una cuenta asociada al correo.</p>
      <PasswordResetRequest />
      <p><Link href="/login">Volver a iniciar sesión</Link></p>
    </main>
  );
}
