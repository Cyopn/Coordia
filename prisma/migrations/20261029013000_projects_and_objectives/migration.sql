CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "ObjectiveStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'ACHIEVED', 'CANCELLED');

CREATE TABLE "Project" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Objective" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "ObjectiveStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "dueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Objective_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Project_organizationId_name_key" ON "Project"("organizationId", "name");
CREATE INDEX "Project_organizationId_status_idx" ON "Project"("organizationId", "status");
CREATE UNIQUE INDEX "Objective_projectId_title_key" ON "Objective"("projectId", "title");
CREATE INDEX "Objective_projectId_status_idx" ON "Objective"("projectId", "status");

ALTER TABLE "Project" ADD CONSTRAINT "Project_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Objective" ADD CONSTRAINT "Objective_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "Permission" ("id", "key", "description")
VALUES
  ('00000000-0000-0000-0000-000000000021', 'project:read', 'Consultar proyectos y objetivos'),
  ('00000000-0000-0000-0000-000000000022', 'project:manage', 'Gestionar proyectos y objetivos')
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p ON p."key" IN ('project:read', 'project:manage')
WHERE r."isSystem" = true AND r."name" = 'Propietario'
ON CONFLICT DO NOTHING;
