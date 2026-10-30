# Política de auditoría inicial

La auditoría de negocio y seguridad se almacena separada de los logs técnicos
en `AuditEvent`. La aplicación no expone operaciones para editar o eliminar
eventos.

La consulta requiere el permiso `audit:read` dentro de la organización y se
limita a los 100 eventos más recientes por solicitud. Los metadatos se redactan
para evitar almacenar contraseñas, tokens, secretos, códigos, claves o enlaces
privados.

La retención mínima prevista es de 180 días. La protección frente a un
administrador con acceso directo a PostgreSQL requiere privilegios de base de
datos restringidos y controles operativos.
