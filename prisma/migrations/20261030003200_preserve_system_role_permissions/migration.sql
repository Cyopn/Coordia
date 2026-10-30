INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role.id, permission.id
FROM "Role" role
JOIN "RolePermission" broad
  ON broad."roleId" = role.id
JOIN "Permission" broad_permission
  ON broad_permission.id = broad."permissionId"
JOIN "Permission" permission
  ON (
    broad_permission.key = 'role:manage'
    AND permission.key IN ('role:create', 'role:update', 'role:delete', 'role:assign')
  )
  OR (
    broad_permission.key = 'project:manage'
    AND permission.key IN (
      'project:create',
      'project:update',
      'project:archive',
      'project:delete',
      'project:assign',
      'resource:read',
      'resource:create',
      'resource:update',
      'resource:assign',
      'resource:status',
      'resource:delete'
    )
  )
WHERE role."isSystem" = true
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
