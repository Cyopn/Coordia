import Link from 'next/link';
import { SecuritySettings } from '../../components/security-settings';

export default function SecurityPage() {
  return (
    <main className="auth-page">
      <p className="eyebrow">Coordia</p>
      <h1>Seguridad de la cuenta</h1>
      <SecuritySettings />
      <p><Link href="/workspace">Volver al espacio de trabajo</Link></p>
    </main>
  );
}
