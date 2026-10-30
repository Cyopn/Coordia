# Coordia

Monolito modular para gestión de organizaciones, equipos y colaboración empresarial.

## Estado actual

Se ha implementado la base de la Etapa 1 — Fundamentos y seguridad:

- Monorepo pnpm con frontend Next.js, API NestJS y paquete compartido.
- PostgreSQL y Prisma con migraciones versionadas.
- Registro con correo y contraseña.
- Contraseñas con Argon2id e historial de cinco contraseñas.
- Verificación de correo con códigos de seis dígitos, caducidad e intentos limitados.
- Recuperación de cuenta con tokens de un solo uso.
- Sesiones opacas en cookies `HttpOnly`, expiración y revocación.
- Listado de sesiones y cierre de sesiones individuales o restantes.
- MFA TOTP con secreto cifrado AES-256-GCM.
- MFA obligatorio para propietarios y administradores.
- Códigos de recuperación MFA hasheados y de un solo uso.
- Reconocimiento de dispositivos durante 30 días sin fingerprinting invasivo.
- Organizaciones y membresías.
- Invitaciones con caducidad, revocación y validación de correo.
- Roles iniciales, roles personalizados y permisos granulares.
- Autorización centralizada en backend con aislamiento por organización.
- Auditoría protegida, consulta autorizada y redacción de metadatos sensibles.
- UI pública base con páginas de inicio, login y registro.
- Componentes accesibles iniciales y formularios conectados a la API.
- EmailJS abstraído con solo dos plantillas por la limitación del plan gratuito.

La Etapa 2 funcional incluye departamentos, equipos, proyectos, objetivos,
tareas y subtareas. El frontend incluye un espacio de trabajo inicial para
consultar y crear tareas; la visualización avanzada de trabajo todavía está
pendiente.

## Estructura del proyecto

- `apps/web`: aplicación web Next.js.
- `apps/api`: API NestJS.
- `packages/shared`: contratos y constantes compartidas.
- `prisma`: esquema, seed y migraciones Prisma.
- `tests`: pruebas transversales.
- `docs`: arquitectura y decisiones técnicas.

La ruta `/workspace` requiere sesión y permite seleccionar una organización y
un proyecto, consultar tareas con filtros, crear tareas rápidamente y editar
su descripción, estado, prioridad y fecha límite. El cierre de sesión revoca la
sesión mediante `POST /auth/logout`. También permite crear etiquetas, asignarlas
a tareas nuevas, crear subtareas y establecer dependencias dentro del proyecto.

La autenticación web incluye `/forgot-password` para solicitar recuperación y
`/reset-password?userId=...&token=...` para establecer la nueva contraseña desde
el enlace enviado por EmailJS. El login enlaza directamente a la recuperación.
`WEB_PUBLIC_ORIGIN` define el origen público usado en enlaces de recuperación,
invitaciones y alertas; debe ser accesible desde el dispositivo del usuario.
El registro informa cuando el correo ya está registrado. La recuperación solo
se inicia para cuentas activas; correos inexistentes, cuentas desactivadas o
pendientes de verificación reciben un error explícito y no generan tokens ni
envíos.

## Endpoints implementados

### Autenticación

- `POST /auth/register`
- `POST /auth/verify-email`
- `POST /auth/resend-verification`
- `POST /auth/login`
- `POST /auth/request-password-reset`
- `POST /auth/reset-password`
- `POST /auth/logout`
- `GET /auth/sessions`
- `POST /auth/sessions/revoke-others`
- `POST /auth/sessions/:sessionId/revoke`

### MFA

- `POST /security/mfa/begin`
- `POST /security/mfa/activate`
- `POST /security/mfa/disable`
- `POST /security/mfa/verify-login`

### Organizaciones

- `POST /organizations`
- `GET /organizations`
- `POST /organizations/:organizationId/invitations`
- `POST /organizations/invitations/accept`
- `POST /organizations/:organizationId/invitations/:invitationId/revoke`

### Roles y auditoría

- `GET /organizations/:organizationId/roles`
- `POST /organizations/:organizationId/roles`
- `PATCH /organizations/:organizationId/roles/:roleId`
- `GET /organizations/:organizationId/audit`
- `GET /health`

### Departamentos y equipos

- `POST /organizations/:organizationId/departments`
- `GET /organizations/:organizationId/departments`
- `POST /organizations/:organizationId/teams`
- `GET /organizations/:organizationId/teams`
- `POST /organizations/:organizationId/teams/:teamId/members`
- `DELETE /organizations/:organizationId/teams/:teamId/members/:membershipId`

La creación y gestión requiere `organization:update`; la consulta requiere
pertenecer activamente a la organización. Los departamentos, equipos y
miembros de equipo siempre se validan contra la organización de la URL.

### Proyectos y objetivos

- `POST /organizations/:organizationId/projects`
- `GET /organizations/:organizationId/projects`
- `PATCH /organizations/:organizationId/projects/:projectId`
- `POST /organizations/:organizationId/projects/:projectId/objectives`
- `GET /organizations/:organizationId/projects/:projectId/objectives`
- `PATCH /organizations/:organizationId/projects/:projectId/objectives/:objectiveId`

La gestión requiere `project:manage` y la consulta `project:read`. Los
objetivos siempre se comprueban contra el proyecto y la organización indicada.
Los proyectos soportan estado activo o archivado; los objetivos soportan
pendiente, en progreso, logrado y cancelado.

### Tareas, subtareas, etiquetas y dependencias

- `POST /organizations/:organizationId/labels`
- `GET /organizations/:organizationId/labels`
- `POST /organizations/:organizationId/projects/:projectId/tasks`
- `GET /organizations/:organizationId/projects/:projectId/tasks`
- `PATCH /organizations/:organizationId/projects/:projectId/tasks/:taskId`

Las tareas admiten subtareas mediante `parentTaskId`, asignación a una
membresía activa, prioridad (`LOW`, `MEDIUM`, `HIGH`, `URGENT`), estado
(`TODO`, `IN_PROGRESS`, `BLOCKED`, `DONE`, `CANCELLED`), fecha límite,
etiquetas y dependencias dentro del mismo proyecto. La gestión requiere
`project:manage` y la consulta requiere `project:read`.

La consulta de tareas acepta los parámetros opcionales `status`, `priority`,
`assigneeId`, `labelId`, `search`, `page` y `pageSize` (máximo 100). Devuelve
`items`, `total`, `page`, `pageSize` y `totalPages`.

## Base de datos

Comandos disponibles:

```powershell
corepack pnpm prisma:validate
corepack pnpm prisma:generate
corepack pnpm prisma:migrate:deploy
corepack pnpm prisma:seed
```

Las migraciones aplicadas de la Etapa 1 son:

- `20261028023000_initial_foundation`
- `20261029002000_mfa_login_challenges`

Migración inicial de la Etapa 2:

- `20261029011000_departments_and_teams`
- `20261029013000_projects_and_objectives`
- `20261029015000_tasks_subtasks_labels_dependencies`

## EmailJS con plan gratuito de dos plantillas

El backend utiliza únicamente:

```env
EMAILJS_VERIFICATION_TEMPLATE_ID=
EMAILJS_GENERAL_TEMPLATE_ID=
```

La plantilla de verificación recibe:

- `to_email`
- `verification_code`

La plantilla general se reutiliza para recuperación, invitaciones y seguridad.
Recibe:

- `to_email`
- `notification_type`
- `subject`
- `message`
- `action_link`

También son necesarias las credenciales de servicio:

```env
EMAILJS_SERVICE_ID=
EMAILJS_PUBLIC_KEY=
EMAILJS_PRIVATE_KEY=
```

No se incluyen credenciales en el repositorio.

## Seguridad y configuración

- `MFA_ENCRYPTION_KEY` debe representar 32 bytes mediante Base64.
- Las contraseñas nunca se almacenan en texto plano.
- Los tokens de sesiones, recuperación e invitaciones se almacenan como hashes.
- Los secretos TOTP se almacenan cifrados.
- Los registros de auditoría no tienen endpoints de edición o eliminación.
- PostgreSQL se utiliza mediante una URL externa al código y no se publica
  directamente.

Políticas relacionadas:

- `docs/security/session-mfa-policy.md`
- `docs/security/audit-policy.md`
- `docs/architecture/data-model.md`

## Desarrollo local

1. Instalar Node.js LTS y pnpm.
2. Copiar `.env.example` a `.env`.
3. Configurar `DATABASE_URL` con una base PostgreSQL disponible.
4. Configurar `MFA_ENCRYPTION_KEY`.
5. Configurar `WEB_ORIGINS` con los orígenes permitidos separados por comas.
6. Si se accede desde otro dispositivo, configurar `NEXT_PUBLIC_API_URL` con
   la IP accesible de la máquina que ejecuta la API, por ejemplo
   `http://192.168.1.110:3001`.
7. Configurar EmailJS si se necesitan correos reales.
8. Ejecutar `corepack pnpm install`.
9. Ejecutar `corepack pnpm prisma:migrate:deploy`.
10. Ejecutar `corepack pnpm prisma:seed`.
11. Ejecutar `corepack pnpm dev`.

Validaciones:

```powershell
corepack pnpm typecheck
corepack pnpm --filter @coordia/api test
corepack pnpm --filter @coordia/api build
```

La configuración de Docker Compose es un artefacto de desarrollo. No configura ni administra ningún servidor físico.

La API carga explícitamente el `.env` del workspace al iniciar. Para acceso
desde una red local, `WEB_ORIGINS` debe incluir el origen exacto del navegador,
por ejemplo `http://192.168.1.110:3000`.

## Verificaciones realizadas en esta sesión

- Conexión real a PostgreSQL confirmada.
- Dos migraciones aplicadas correctamente.
- Esquema Prisma validado.
- Seed de permisos ejecutado.
- API NestJS iniciada correctamente con Prisma conectado.
- `GET /health` respondió HTTP 200.
- Login con datos inválidos respondió HTTP 401.
- Rutas protegidas sin sesión respondieron HTTP 401.
- Typecheck completo correcto.
- Build completo de frontend y API correcto.
- Build de la API correcto.
- Pruebas unitarias: 4 correctas, 0 fallos.
- Migración incremental de departamentos y equipos aplicada sin resetear la base.
- Esquema Prisma y typecheck del API correctos después del primer módulo de la Etapa 2.
- Migración de proyectos y objetivos aplicada sin resetear la base.
- Ruta protegida de proyectos validada: sin sesión responde HTTP 401.
- Typecheck completo y build del API correctos después del módulo de proyectos.
- Migración de tareas, subtareas, etiquetas y dependencias aplicada sin resetear la base.
- Healthcheck HTTP correcto y rutas protegidas de tareas respondieron HTTP 401 sin sesión.
- Typecheck completo, build del API y pruebas unitarias correctos después del módulo de tareas.
- Filtros y paginación de tareas validados; la ruta sin sesión respondió HTTP 401.
- Panel `/workspace` integrado con organizaciones, proyectos, filtros y creación de tareas.
- Typecheck y build del frontend correctos después de la integración del panel.
- Edición de tareas integrada en `/workspace` para descripción, estado, prioridad y fecha límite.
- Typecheck completo, build web y pruebas/build del API correctos después de la edición.
- Gestión visual de etiquetas, subtareas y dependencias integrada en `/workspace`.
- Typecheck completo, build web, build API y pruebas unitarias correctos después de esta integración.
- Validación final: Prisma validado y migraciones sincronizadas, build completo correcto y API HTTP validada con health `200`, login inválido `401`, sesiones sin cookie `401` y tareas sin cookie `401`.
- Recuperación de contraseña integrada en el frontend y build web validado con las rutas `/forgot-password` y `/reset-password`.

Las pruebas de integración de flujos completos todavía deben ampliarse con
casos automatizados de registro, aislamiento, invitaciones, revocación y
autorización, departamentos y equipos. La configuración de producción y la
infraestructura física quedan fuera del alcance de este desarrollo.
