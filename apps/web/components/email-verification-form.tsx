'use client';

import { FormEvent, useState } from 'react';
import { apiRequest } from '../lib/api-client';

export function EmailVerificationForm() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
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
    if (!/^\d{6}$/.test(code)) {
      setError('Introduce el código de 6 dígitos recibido por correo.');
      return;
    }
    try {
      const result = await apiRequest<{ message: string }>('/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ email, code }),
      });
      setMessage(result.message);
      setCode('');
    } catch (requestError) {
      setError(getError(requestError));
    }
  }

  async function resend() {
    setError('');
    setMessage('');
    if (!email.trim()) {
      setError('Escribe tu correo electrónico para reenviar el código.');
      return;
    }
    try {
      const result = await apiRequest<{ message: string }>('/auth/resend-verification', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setMessage(result.message);
    } catch (requestError) {
      setError(getError(requestError));
    }
  }

  return (
    <div>
      <form className="auth-form" onSubmit={submit}>
        <label htmlFor="verification-email">Correo electrónico</label>
        <input
          id="verification-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <label htmlFor="verification-code">Código de verificación</label>
        <input
          id="verification-code"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
        />
        <button type="submit">Verificar cuenta</button>
      </form>
      <button type="button" className="secondary-button" onClick={resend}>
        Reenviar código
      </button>
      {message && <p role="status">{message}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}

function getError(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo completar la operación';
}
