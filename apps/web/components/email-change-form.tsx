'use client';

import { FormEvent, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiRequest } from '../lib/api-client';

export function EmailChangeForm() {
  const token = useSearchParams().get('token') ?? '';
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    if (!token) {
      setError('El enlace de confirmación no es válido.');
      return;
    }
    try {
      const result = await apiRequest<{ message: string }>('/auth/confirm-email-change', {
        method: 'POST',
        body: JSON.stringify({ token }),
      });
      setMessage(result.message);
      setSubmitted(true);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudo completar la operación',
      );
    }
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <p>Confirma el cambio de correo electrónico desde tu sesión activa.</p>
      <button type="submit" disabled={submitted}>
        Confirmar cambio de correo
      </button>
      {message && <p role="status">{message}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
  );
}
