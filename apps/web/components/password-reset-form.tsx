'use client';

import { FormEvent, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiRequest } from '../lib/api-client';

export function PasswordResetForm() {
  const params = useSearchParams();
  const userId = params.get('userId') ?? '';
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    if (!userId || !token) {
      setError('El enlace de recuperación no es válido.');
      return;
    }
    if (!password.trim()) {
      setError('La nueva contraseña es obligatoria.');
      return;
    }
    if (password.length < 12) {
      setError('La contraseña debe tener al menos 12 caracteres.');
      return;
    }
    if (password !== confirmation) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    try {
      const result = await apiRequest<{ message: string }>('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ userId, token, password }),
      });
      setMessage(result.message);
      setPassword('');
      setConfirmation('');
    } catch (requestError) {
      setError(getError(requestError));
    }
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <label htmlFor="new-password">Nueva contraseña</label>
      <input
        id="new-password"
        type="password"
        autoComplete="new-password"
        minLength={12}
        required
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
      <label htmlFor="confirm-password">Confirmar contraseña</label>
      <input
        id="confirm-password"
        type="password"
        autoComplete="new-password"
        minLength={12}
        required
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
      />
      <button type="submit">Actualizar contraseña</button>
      {message && <p role="status">{message}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
  );
}

function getError(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo completar la operación';
}
