CREATE TYPE "DelayPolicy" AS ENUM ('WARN', 'AUTO_RESCHEDULE');
CREATE TYPE "TemplateStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "WorkCapacityAdjustmentType" AS ENUM ('INCREASE', 'DECREASE');

ALTER TABLE "OrganizationSettings"
  ADD COLUMN "taskStatuses" JSONB,
  ADD COLUMN "taskPriorities" JSONB,
  ADD COLUMN "workRules" JSONB,
  ADD COLUMN "workingHours" JSONB,
  ADD COLUMN "workingDays" JSONB,
  ADD COLUMN "planning" JSONB;

ALTER TABLE "Project"
  ADD COLUMN "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
  ADD COLUMN "ownerId" UUID,
  ADD COLUMN "delayPolicy" "DelayPolicy" NOT NULL DEFAULT 'WARN',
  ADD COLUMN "configuration" JSONB,
  ADD COLUMN "templateId" UUID;

ALTER TABLE "Task"
  ADD COLUMN "startsAt" TIMESTAMP(3),
  ADD COLUMN "estimatedHours" DECIMAL(8,2);

CREATE TABLE "ObjectiveTask" (
  "objectiveId" UUID NOT NULL,
  "taskId" UUID NOT NULL,
  CONSTRAINT "ObjectiveTask_pkey" PRIMARY KEY ("objectiveId", "taskId")
);

CREATE TABLE "TaskComment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "taskId" UUID NOT NULL,
  "authorId" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TaskComment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TaskHistory" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "taskId" UUID NOT NULL,
  "actorId" UUID NOT NULL,
  "field" TEXT NOT NULL,
  "oldValue" TEXT,
  "newValue" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaskHistory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TaskCollaborator" (
  "taskId" UUID NOT NULL,
  "membershipId" UUID NOT NULL,
  CONSTRAINT "TaskCollaborator_pkey" PRIMARY KEY ("taskId", "membershipId")
);

CREATE TABLE "ProjectTemplate" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "createdById" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" "TemplateStatus" NOT NULL DEFAULT 'ACTIVE',
  "configuration" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectWorkItem" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "templateId" UUID,
  "projectId" UUID,
  "parentId" UUID,
  "title" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT,
  "priority" TEXT,
  "estimatedHours" DECIMAL(8,2),
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ProjectWorkItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkCapacityAdjustment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "membershipId" UUID NOT NULL,
  "date" DATE NOT NULL,
  "hours" DECIMAL(8,2) NOT NULL,
  "type" "WorkCapacityAdjustmentType" NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkCapacityAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectTemplate_organizationId_name_key" ON "ProjectTemplate"("organizationId", "name");
CREATE INDEX "ProjectTemplate_organizationId_status_idx" ON "ProjectTemplate"("organizationId", "status");
CREATE INDEX "ObjectiveTask_taskId_idx" ON "ObjectiveTask"("taskId");
CREATE INDEX "TaskComment_taskId_createdAt_idx" ON "TaskComment"("taskId", "createdAt");
CREATE INDEX "TaskHistory_taskId_createdAt_idx" ON "TaskHistory"("taskId", "createdAt");
CREATE INDEX "ProjectWorkItem_templateId_sortOrder_idx" ON "ProjectWorkItem"("templateId", "sortOrder");
CREATE INDEX "ProjectWorkItem_projectId_sortOrder_idx" ON "ProjectWorkItem"("projectId", "sortOrder");
CREATE UNIQUE INDEX "WorkCapacityAdjustment_membershipId_date_key" ON "WorkCapacityAdjustment"("membershipId", "date");
CREATE INDEX "WorkCapacityAdjustment_organizationId_date_idx" ON "WorkCapacityAdjustment"("organizationId", "date");

ALTER TABLE "Project" ADD CONSTRAINT "Project_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "ProjectTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ObjectiveTask" ADD CONSTRAINT "ObjectiveTask_objectiveId_fkey"
  FOREIGN KEY ("objectiveId") REFERENCES "Objective"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ObjectiveTask" ADD CONSTRAINT "ObjectiveTask_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskHistory" ADD CONSTRAINT "TaskHistory_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskHistory" ADD CONSTRAINT "TaskHistory_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskCollaborator" ADD CONSTRAINT "TaskCollaborator_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskCollaborator" ADD CONSTRAINT "TaskCollaborator_membershipId_fkey"
  FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectTemplate" ADD CONSTRAINT "ProjectTemplate_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectTemplate" ADD CONSTRAINT "ProjectTemplate_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectWorkItem" ADD CONSTRAINT "ProjectWorkItem_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "ProjectTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectWorkItem" ADD CONSTRAINT "ProjectWorkItem_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectWorkItem" ADD CONSTRAINT "ProjectWorkItem_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "ProjectWorkItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkCapacityAdjustment" ADD CONSTRAINT "WorkCapacityAdjustment_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkCapacityAdjustment" ADD CONSTRAINT "WorkCapacityAdjustment_membershipId_fkey"
  FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
