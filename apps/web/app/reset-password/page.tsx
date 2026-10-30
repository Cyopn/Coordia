import Link from 'next/link';
import { Suspense } from 'react';
import { PasswordResetForm } from '../../components/password-reset-form';

export default function ResetPasswordPage() {
  return (
    <main className="auth-page">
      <p className="eyebrow">Coordia</p>
      <h1>Establecer nueva contraseña</h1>
      <p>El enlace es temporal y solo puede utilizarse una vez.</p>
      <Suspense fallback={<p>Cargando formulario...</p>}>
        <PasswordResetForm />
      </Suspense>
      <p><Link href="/login">Volver a iniciar sesión</Link></p>
    </main>
  );
}
