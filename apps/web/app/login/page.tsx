import Link from 'next/link';
import { AuthForm } from '../../components/auth-form';

export default function LoginPage() {
  return (
    <main className="auth-page">
      <p className="eyebrow">Coordia</p>
      <h1>Iniciar sesión</h1>
      <AuthForm mode="login" />
      <p><Link href="/forgot-password">¿Olvidaste tu contraseña?</Link></p>
      <p>¿Todavía no tienes cuenta? <Link href="/register">Regístrate</Link></p>
    </main>
  );
}
