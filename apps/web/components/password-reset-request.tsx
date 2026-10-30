'use client';

import { FormEvent, useState } from 'react';
import { apiRequest } from '../lib/api-client';

export function PasswordResetRequest() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    if (!email.trim()) {
      setError('El correo electrónico es obligatorio.');
      return;
    }
    try {
      const result = await apiRequest<{ message: string }>('/auth/request-password-reset', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setMessage(result.message);
    } catch (requestError) {
      setError(getError(requestError));
    }
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <label htmlFor="reset-email">Correo electrónico</label>
      <input
        id="reset-email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <button type="submit">Enviar instrucciones</button>
      {message && <p role="status">{message}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
  );
}

function getError(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo completar la operación';
}
