'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { apiRequest } from '../lib/api-client';

type AuthFormProps = {
  mode: 'login' | 'register';
};

export function AuthForm({ mode }: AuthFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const isRegister = mode === 'register';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    if (!email.trim()) {
      setError('El correo electrónico es obligatorio.');
      return;
    }
    if (!password.trim()) {
      setError('La contraseña es obligatoria.');
      return;
    }
    if (isRegister && password.length < 12) {
      setError('La contraseña debe tener al menos 12 caracteres.');
      return;
    }
    try {
      const result = await apiRequest<{ message: string }> (
        isRegister ? '/auth/register' : '/auth/login',
        {
          method: 'POST',
          body: JSON.stringify(
            isRegister
              ? { email, password, termsVersion: '1.0', privacyVersion: '1.0' }
              : { email, password },
          ),
        },
      );
      setMessage(result.message);
      if (mode === 'login') window.location.assign('/workspace');
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
      <label htmlFor="email">Correo electrónico</label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <label htmlFor="password">Contraseña</label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete={isRegister ? 'new-password' : 'current-password'}
        required
        minLength={12}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
      <button type="submit">{isRegister ? 'Crear cuenta' : 'Iniciar sesión'}</button>
      {message && <p role="status">{message}</p>}
      {message && isRegister && (
        <p><Link href="/verify-email">Introducir código de verificación</Link></p>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
  );
}
