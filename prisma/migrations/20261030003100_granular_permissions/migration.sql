INSERT INTO "Permission" ("id", "key", "description")
VALUES
  (gen_random_uuid(), 'organization:settings', 'Gestionar la configuración de la organización'),
  (gen_random_uuid(), 'membership:update', 'Modificar membresías'),
  (gen_random_uuid(), 'role:create', 'Crear roles'),
  (gen_random_uuid(), 'role:update', 'Modificar roles'),
  (gen_random_uuid(), 'role:delete', 'Eliminar roles'),
  (gen_random_uuid(), 'role:assign', 'Asignar roles y permisos'),
  (gen_random_uuid(), 'project:create', 'Crear proyectos'),
  (gen_random_uuid(), 'project:update', 'Modificar proyectos'),
  (gen_random_uuid(), 'project:archive', 'Archivar proyectos'),
  (gen_random_uuid(), 'project:delete', 'Eliminar proyectos'),
  (gen_random_uuid(), 'project:assign', 'Gestionar responsables de proyectos'),
  (gen_random_uuid(), 'resource:read', 'Consultar recursos y tareas'),
  (gen_random_uuid(), 'resource:create', 'Crear recursos y tareas'),
  (gen_random_uuid(), 'resource:update', 'Modificar recursos y tareas'),
  (gen_random_uuid(), 'resource:assign', 'Asignar recursos y tareas'),
  (gen_random_uuid(), 'resource:status', 'Cambiar estado de recursos y tareas'),
  (gen_random_uuid(), 'resource:delete', 'Eliminar recursos y tareas')
ON CONFLICT ("key") DO NOTHING;
