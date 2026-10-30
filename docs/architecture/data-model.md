# Modelo de datos inicial

El esquema Prisma de la Etapa 1 separa identidad, organizaciones, autorización,
sesiones, MFA y auditoría. Las entidades privadas de organización contienen una
relación explícita con `organizationId`; los repositorios deberán exigir ese
ámbito en cada consulta.

Los tokens de verificación, recuperación, sesiones, dispositivos confiables y
códigos de recuperación MFA se almacenan mediante hashes o valores cifrados,
nunca como secretos utilizables en texto plano.

Los eventos de auditoría no se eliminan mediante la aplicación. La protección
frente a un administrador con acceso directo a PostgreSQL requiere privilegios
de base de datos restringidos y controles operativos posteriores.
