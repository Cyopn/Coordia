'use client';

import { FormEvent, useEffect, useState } from 'react';
import { apiRequest } from '../lib/api-client';

type Session = {
  id: string;
  createdAt: string;
  lastActivityAt: string;
  expiresAt: string;
  userAgent: string | null;
};

export function SecuritySettings() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [factorId, setFactorId] = useState('');
  const [mfaSecret, setMfaSecret] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    void loadSessions();
  }, []);

  async function loadSessions() {
    try {
      setSessions(await apiRequest<Session[]>('/auth/sessions'));
    } catch (requestError) {
      setError(getError(requestError));
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submit('/auth/change-password', {
      currentPassword,
      newPassword,
    }, 'Contraseña actualizada.');
    setCurrentPassword('');
    setNewPassword('');
  }

  async function requestEmailChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submit('/auth/request-email-change', {
      newEmail,
      currentPassword: emailPassword,
    }, 'Revisa el nuevo correo para confirmar el cambio.');
    setNewEmail('');
    setEmailPassword('');
  }

  async function submit(path: string, body: object, success: string) {
    setError('');
    setMessage('');
    try {
      const result = await apiRequest<{ message: string }>(path, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setMessage(result.message || success);
      await loadSessions();
    } catch (requestError) {
      setError(getError(requestError));
    }
  }

  async function revoke(sessionId: string) {
    await submit(`/auth/sessions/${sessionId}/revoke`, {}, 'Sesión revocada.');
  }

  async function revokeOthers() {
    await submit('/auth/sessions/revoke-others', {}, 'Las demás sesiones fueron revocadas.');
  }

  async function beginMfa() {
    try {
      const result = await apiRequest<{ factorId: string; secret: string }>('/security/mfa/begin', {
        method: 'POST',
      });
      setFactorId(result.factorId);
      setMfaSecret(result.secret);
      setError('');
    } catch (requestError) {
      setError(getError(requestError));
    }
  }

  async function activateMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const result = await apiRequest<{ recoveryCodes: string[] }>('/security/mfa/activate', {
        method: 'POST',
        body: JSON.stringify({ factorId, code: mfaCode }),
      });
      setRecoveryCodes(result.recoveryCodes);
      setMessage('MFA activado. Guarda los códigos de recuperación.');
      setMfaCode('');
    } catch (requestError) {
      setError(getError(requestError));
    }
  }

  return (
    <>
      <section>
        <h2>Autenticación multifactor</h2>
        {!factorId && <button type="button" onClick={() => void beginMfa()}>Configurar MFA</button>}
        {factorId && (
          <form className="auth-form" onSubmit={activateMfa}>
            <p>Introduce este secreto en tu aplicación autenticadora: <strong>{mfaSecret}</strong></p>
            <label>Código TOTP<input inputMode="numeric" pattern="[0-9]{6}" required value={mfaCode} onChange={(event) => setMfaCode(event.target.value)} /></label>
            <button type="submit">Activar MFA</button>
          </form>
        )}
        {recoveryCodes.length > 0 && <p>Códigos de recuperación: {recoveryCodes.join(', ')}</p>}
      </section>
      <section>
        <h2>Cambiar contraseña</h2>
        <form className="auth-form" onSubmit={changePassword}>
          <label>Contraseña actual<input type="password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label>
          <label>Nueva contraseña<input type="password" minLength={12} required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>
          <button type="submit">Actualizar contraseña</button>
        </form>
      </section>
      <section>
        <h2>Cambiar correo electrónico</h2>
        <form className="auth-form" onSubmit={requestEmailChange}>
          <label>Nuevo correo<input type="email" required value={newEmail} onChange={(event) => setNewEmail(event.target.value)} /></label>
          <label>Contraseña actual<input type="password" required value={emailPassword} onChange={(event) => setEmailPassword(event.target.value)} /></label>
          <button type="submit">Enviar confirmación</button>
        </form>
      </section>
      <section>
        <h2>Sesiones activas</h2>
        <button type="button" onClick={revokeOthers}>Cerrar otras sesiones</button>
        <ul>
          {sessions.map((session) => (
            <li key={session.id}>
              {session.userAgent || 'Dispositivo desconocido'} — última actividad {new Date(session.lastActivityAt).toLocaleString('es')}
              <button type="button" onClick={() => void revoke(session.id)}>Revocar</button>
            </li>
          ))}
        </ul>
      </section>
      {message && <p role="status">{message}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </>
  );
}

function getError(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo completar la operación';
}
