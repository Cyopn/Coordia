export const PERMISSIONS = {
  ORGANIZATION_READ: 'organization:read',
  ORGANIZATION_UPDATE: 'organization:update',
  MEMBERSHIP_READ: 'membership:read',
  MEMBERSHIP_INVITE: 'membership:invite',
  MEMBERSHIP_REMOVE: 'membership:remove',
  ROLE_READ: 'role:read',
  ROLE_MANAGE: 'role:manage',
  AUDIT_READ: 'audit:read',
  PROJECT_READ: 'project:read',
  PROJECT_MANAGE: 'project:manage',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const INITIAL_PERMISSION_CATALOG: ReadonlyArray<{
  key: PermissionKey;
  description: string;
}> = [
  { key: PERMISSIONS.ORGANIZATION_READ, description: 'Consultar la organización' },
  { key: PERMISSIONS.ORGANIZATION_UPDATE, description: 'Modificar la organización' },
  { key: PERMISSIONS.MEMBERSHIP_READ, description: 'Consultar membresías' },
  { key: PERMISSIONS.MEMBERSHIP_INVITE, description: 'Invitar miembros' },
  { key: PERMISSIONS.MEMBERSHIP_REMOVE, description: 'Retirar miembros' },
  { key: PERMISSIONS.ROLE_READ, description: 'Consultar roles' },
  { key: PERMISSIONS.ROLE_MANAGE, description: 'Gestionar roles y permisos' },
  { key: PERMISSIONS.AUDIT_READ, description: 'Consultar auditoría' },
  { key: PERMISSIONS.PROJECT_READ, description: 'Consultar proyectos y objetivos' },
  { key: PERMISSIONS.PROJECT_MANAGE, description: 'Gestionar proyectos y objetivos' },
];
