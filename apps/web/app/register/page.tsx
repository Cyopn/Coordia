import Link from 'next/link';
import { AuthForm } from '../../components/auth-form';

export default function RegisterPage() {
  return (
    <main className="auth-page">
      <p className="eyebrow">Coordia</p>
      <h1>Crear cuenta</h1>
      <AuthForm mode="register" />
      <p>¿Ya tienes cuenta? <Link href="/login">Inicia sesión</Link></p>
    </main>
  );
}
