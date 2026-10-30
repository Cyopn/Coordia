# Política inicial de sesiones y MFA

## Sesiones

- Las sesiones utilizan identificadores opacos almacenados como hash.
- La cookie es `HttpOnly`, `SameSite=Lax` y `Secure` en producción.
- La inactividad máxima es de 30 minutos.
- La vida máxima ordinaria es de 12 horas.
- Las sesiones pueden consultarse y revocarse individualmente.
- El usuario puede revocar todas las sesiones salvo la actual.
- Una contraseña restablecida revoca las sesiones activas de la cuenta.
- La API vuelve a comprobar estado, expiración e inactividad en cada operación
  protegida.

## MFA

- Se utiliza TOTP mediante aplicaciones autenticadoras.
- El secreto TOTP se cifra con AES-256-GCM.
- La clave `MFA_ENCRYPTION_KEY` debe ser una clave Base64 de 32 bytes y permanece
  fuera del código fuente.
- Los dispositivos se reconocen durante un máximo de 30 días mediante una cookie
  aleatoria protegida y revocable; no se construye una huella invasiva.
- Un dispositivo nuevo genera un evento de seguridad y, si EmailJS está
  configurado, una alerta de correo con información mínima.

## EmailJS con plan de dos plantillas

Coordia utiliza dos plantillas:

1. `EMAILJS_VERIFICATION_TEMPLATE_ID`: verificación de cuenta.
2. `EMAILJS_GENERAL_TEMPLATE_ID`: recuperación de contraseña, invitaciones y
   alertas de seguridad.

La plantilla general recibe `to_email`, `notification_type`, `subject`,
`message` y `action_link`. Para alertas de seguridad, `action_link` apunta a la
aplicación y no contiene secretos.
- Los códigos de recuperación se almacenan como hashes y cada código es de un
  solo uso cuando se incorpore su consumo en el flujo de recuperación.
- La activación y desactivación quedan auditadas.
- No se utiliza SMS como segundo factor.

La integración final con PostgreSQL y la validación de los flujos completos
requieren una base local con credenciales válidas. Las pruebas unitarias no
simulan una conexión de base de datos.
