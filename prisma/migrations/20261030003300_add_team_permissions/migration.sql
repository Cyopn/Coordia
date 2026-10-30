INSERT INTO "Permission" ("id", "key", "description")
VALUES
  (gen_random_uuid(), 'team:read', 'Consultar equipos'),
  (gen_random_uuid(), 'team:create', 'Crear equipos'),
  (gen_random_uuid(), 'team:update', 'Modificar equipos'),
  (gen_random_uuid(), 'team:assign', 'Asignar miembros a equipos')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role.id, permission.id
FROM "Role" role
JOIN "Permission" permission
  ON permission.key IN ('team:read', 'team:create', 'team:update', 'team:assign')
WHERE role."isSystem" = true
  AND role.name = 'Propietario'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
