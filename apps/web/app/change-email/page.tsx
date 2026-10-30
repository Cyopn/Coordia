import Link from 'next/link';
import { Suspense } from 'react';
import { EmailChangeForm } from '../../components/email-change-form';

export default function ChangeEmailPage() {
  return (
    <main className="auth-page">
      <p className="eyebrow">Coordia</p>
      <h1>Confirmar cambio de correo</h1>
      <Suspense fallback={<p>Cargando confirmación...</p>}>
        <EmailChangeForm />
      </Suspense>
      <p><Link href="/login">Volver a iniciar sesión</Link></p>
    </main>
  );
}
