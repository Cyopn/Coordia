/*
  Warnings:

  - The primary key for the `MembershipRole` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `ObjectiveTask` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `ProjectAccess` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `TaskCollaborator` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `TaskDependency` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `TaskLabel` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `TeamMember` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - A unique constraint covering the columns `[organizationId,id]` on the table `Department` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[organizationId,id]` on the table `Label` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[projectId,id]` on the table `Objective` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[organizationId,id]` on the table `Project` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[organizationId,id]` on the table `ProjectTemplate` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[organizationId,id]` on the table `ProjectWorkItem` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[organizationId,id]` on the table `Role` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[organizationId,id]` on the table `Task` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[projectId,id]` on the table `Task` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[organizationId,id]` on the table `Team` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `organizationId` to the `MembershipRole` table without a default value. This is not possible if the table is not empty.
  - Added the required column `projectId` to the `ObjectiveTask` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organizationId` to the `ProjectAccess` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organizationId` to the `ProjectWorkItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organizationId` to the `Task` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organizationId` to the `TaskCollaborator` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organizationId` to the `TaskComment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `projectId` to the `TaskDependency` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organizationId` to the `TaskHistory` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organizationId` to the `TaskLabel` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organizationId` to the `TeamMember` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "MembershipRole" DROP CONSTRAINT "MembershipRole_membershipId_fkey";

-- DropForeignKey
ALTER TABLE "MembershipRole" DROP CONSTRAINT "MembershipRole_roleId_fkey";

-- DropForeignKey
ALTER TABLE "ObjectiveTask" DROP CONSTRAINT "ObjectiveTask_objectiveId_fkey";

-- DropForeignKey
ALTER TABLE "ObjectiveTask" DROP CONSTRAINT "ObjectiveTask_taskId_fkey";

-- DropForeignKey
ALTER TABLE "Project" DROP CONSTRAINT "Project_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "Project" DROP CONSTRAINT "Project_templateId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectAccess" DROP CONSTRAINT "ProjectAccess_membershipId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectAccess" DROP CONSTRAINT "ProjectAccess_projectId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectTemplate" DROP CONSTRAINT "ProjectTemplate_createdById_fkey";

-- DropForeignKey
ALTER TABLE "ProjectWorkItem" DROP CONSTRAINT "ProjectWorkItem_parentId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectWorkItem" DROP CONSTRAINT "ProjectWorkItem_projectId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectWorkItem" DROP CONSTRAINT "ProjectWorkItem_templateId_fkey";

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_assigneeId_fkey";

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_parentTaskId_fkey";

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_projectId_fkey";

-- DropForeignKey
ALTER TABLE "TaskCollaborator" DROP CONSTRAINT "TaskCollaborator_membershipId_fkey";

-- DropForeignKey
ALTER TABLE "TaskCollaborator" DROP CONSTRAINT "TaskCollaborator_taskId_fkey";

-- DropForeignKey
ALTER TABLE "TaskComment" DROP CONSTRAINT "TaskComment_authorId_fkey";

-- DropForeignKey
ALTER TABLE "TaskComment" DROP CONSTRAINT "TaskComment_taskId_fkey";

-- DropForeignKey
ALTER TABLE "TaskDependency" DROP CONSTRAINT "TaskDependency_dependsOnId_fkey";

-- DropForeignKey
ALTER TABLE "TaskDependency" DROP CONSTRAINT "TaskDependency_taskId_fkey";

-- DropForeignKey
ALTER TABLE "TaskHistory" DROP CONSTRAINT "TaskHistory_actorId_fkey";

-- DropForeignKey
ALTER TABLE "TaskHistory" DROP CONSTRAINT "TaskHistory_taskId_fkey";

-- DropForeignKey
ALTER TABLE "TaskLabel" DROP CONSTRAINT "TaskLabel_labelId_fkey";

-- DropForeignKey
ALTER TABLE "TaskLabel" DROP CONSTRAINT "TaskLabel_taskId_fkey";

-- DropForeignKey
ALTER TABLE "Team" DROP CONSTRAINT "Team_departmentId_fkey";

-- DropForeignKey
ALTER TABLE "TeamMember" DROP CONSTRAINT "TeamMember_membershipId_fkey";

-- DropForeignKey
ALTER TABLE "TeamMember" DROP CONSTRAINT "TeamMember_teamId_fkey";

-- DropIndex
DROP INDEX "ObjectiveTask_taskId_idx";

-- DropIndex
DROP INDEX "ProjectAccess_membershipId_idx";

-- DropIndex
DROP INDEX "ProjectWorkItem_projectId_sortOrder_idx";

-- DropIndex
DROP INDEX "ProjectWorkItem_templateId_sortOrder_idx";

-- DropIndex
DROP INDEX "TaskComment_taskId_createdAt_idx";

-- DropIndex
DROP INDEX "TaskDependency_dependsOnId_idx";

-- DropIndex
DROP INDEX "TaskHistory_taskId_createdAt_idx";

-- DropIndex
DROP INDEX "TeamMember_membershipId_idx";

-- DropIndex
DROP INDEX "User_isGlobalAdmin_idx";

-- AlterTable
ALTER TABLE "MembershipRole" DROP CONSTRAINT "MembershipRole_pkey",
ADD COLUMN     "organizationId" UUID NOT NULL,
ADD CONSTRAINT "MembershipRole_pkey" PRIMARY KEY ("organizationId", "membershipId", "roleId");

-- AlterTable
ALTER TABLE "ObjectiveTask" DROP CONSTRAINT "ObjectiveTask_pkey",
ADD COLUMN     "projectId" UUID NOT NULL,
ADD CONSTRAINT "ObjectiveTask_pkey" PRIMARY KEY ("projectId", "objectiveId", "taskId");

-- AlterTable
ALTER TABLE "ProjectAccess" DROP CONSTRAINT "ProjectAccess_pkey",
ADD COLUMN     "organizationId" UUID NOT NULL,
ADD CONSTRAINT "ProjectAccess_pkey" PRIMARY KEY ("organizationId", "projectId", "membershipId");

-- AlterTable
ALTER TABLE "ProjectTemplate" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ProjectWorkItem" ADD COLUMN     "organizationId" UUID NOT NULL,
ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "organizationId" UUID NOT NULL;

-- AlterTable
ALTER TABLE "TaskCollaborator" DROP CONSTRAINT "TaskCollaborator_pkey",
ADD COLUMN     "organizationId" UUID NOT NULL,
ADD CONSTRAINT "TaskCollaborator_pkey" PRIMARY KEY ("organizationId", "taskId", "membershipId");

-- AlterTable
ALTER TABLE "TaskComment" ADD COLUMN     "organizationId" UUID NOT NULL,
ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "TaskDependency" DROP CONSTRAINT "TaskDependency_pkey",
ADD COLUMN     "projectId" UUID NOT NULL,
ADD CONSTRAINT "TaskDependency_pkey" PRIMARY KEY ("projectId", "taskId", "dependsOnId");

-- AlterTable
ALTER TABLE "TaskHistory" ADD COLUMN     "organizationId" UUID NOT NULL,
ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "TaskLabel" DROP CONSTRAINT "TaskLabel_pkey",
ADD COLUMN     "organizationId" UUID NOT NULL,
ADD CONSTRAINT "TaskLabel_pkey" PRIMARY KEY ("organizationId", "taskId", "labelId");

-- AlterTable
ALTER TABLE "TeamMember" DROP CONSTRAINT "TeamMember_pkey",
ADD COLUMN     "organizationId" UUID NOT NULL,
ADD CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("organizationId", "teamId", "membershipId");

-- AlterTable
ALTER TABLE "WorkAbsence" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "WorkCapacityAdjustment" ALTER COLUMN "id" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "Department_organizationId_id_key" ON "Department"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Label_organizationId_id_key" ON "Label"("organizationId", "id");

-- CreateIndex
CREATE INDEX "MembershipRole_organizationId_roleId_idx" ON "MembershipRole"("organizationId", "roleId");

-- CreateIndex
CREATE UNIQUE INDEX "Objective_projectId_id_key" ON "Objective"("projectId", "id");

-- CreateIndex
CREATE INDEX "ObjectiveTask_projectId_taskId_idx" ON "ObjectiveTask"("projectId", "taskId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_organizationId_id_key" ON "Project"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectTemplate_organizationId_id_key" ON "ProjectTemplate"("organizationId", "id");

-- CreateIndex
CREATE INDEX "ProjectWorkItem_organizationId_templateId_sortOrder_idx" ON "ProjectWorkItem"("organizationId", "templateId", "sortOrder");

-- CreateIndex
CREATE INDEX "ProjectWorkItem_organizationId_projectId_sortOrder_idx" ON "ProjectWorkItem"("organizationId", "projectId", "sortOrder");

-- CreateIndex
CREATE INDEX "ProjectWorkItem_organizationId_parentId_idx" ON "ProjectWorkItem"("organizationId", "parentId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectWorkItem_organizationId_id_key" ON "ProjectWorkItem"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Role_organizationId_id_key" ON "Role"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Task_organizationId_id_key" ON "Task"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Task_projectId_id_key" ON "Task"("projectId", "id");

-- CreateIndex
CREATE INDEX "TaskComment_organizationId_taskId_createdAt_idx" ON "TaskComment"("organizationId", "taskId", "createdAt");

-- CreateIndex
CREATE INDEX "TaskDependency_projectId_dependsOnId_idx" ON "TaskDependency"("projectId", "dependsOnId");

-- CreateIndex
CREATE INDEX "TaskHistory_organizationId_taskId_createdAt_idx" ON "TaskHistory"("organizationId", "taskId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Team_organizationId_id_key" ON "Team"("organizationId", "id");

-- AddForeignKey
ALTER TABLE "ObjectiveTask" ADD CONSTRAINT "ObjectiveTask_projectId_objectiveId_fkey" FOREIGN KEY ("projectId", "objectiveId") REFERENCES "Objective"("projectId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObjectiveTask" ADD CONSTRAINT "ObjectiveTask_projectId_taskId_fkey" FOREIGN KEY ("projectId", "taskId") REFERENCES "Task"("projectId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_organizationId_taskId_fkey" FOREIGN KEY ("organizationId", "taskId") REFERENCES "Task"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_organizationId_authorId_fkey" FOREIGN KEY ("organizationId", "authorId") REFERENCES "Membership"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskHistory" ADD CONSTRAINT "TaskHistory_organizationId_taskId_fkey" FOREIGN KEY ("organizationId", "taskId") REFERENCES "Task"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskHistory" ADD CONSTRAINT "TaskHistory_organizationId_actorId_fkey" FOREIGN KEY ("organizationId", "actorId") REFERENCES "Membership"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskCollaborator" ADD CONSTRAINT "TaskCollaborator_organizationId_taskId_fkey" FOREIGN KEY ("organizationId", "taskId") REFERENCES "Task"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskCollaborator" ADD CONSTRAINT "TaskCollaborator_organizationId_membershipId_fkey" FOREIGN KEY ("organizationId", "membershipId") REFERENCES "Membership"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTemplate" ADD CONSTRAINT "ProjectTemplate_organizationId_createdById_fkey" FOREIGN KEY ("organizationId", "createdById") REFERENCES "Membership"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectWorkItem" ADD CONSTRAINT "ProjectWorkItem_organizationId_templateId_fkey" FOREIGN KEY ("organizationId", "templateId") REFERENCES "ProjectTemplate"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectWorkItem" ADD CONSTRAINT "ProjectWorkItem_organizationId_projectId_fkey" FOREIGN KEY ("organizationId", "projectId") REFERENCES "Project"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectWorkItem" ADD CONSTRAINT "ProjectWorkItem_organizationId_parentId_fkey" FOREIGN KEY ("organizationId", "parentId") REFERENCES "ProjectWorkItem"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_organizationId_ownerId_fkey" FOREIGN KEY ("organizationId", "ownerId") REFERENCES "Membership"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_organizationId_templateId_fkey" FOREIGN KEY ("organizationId", "templateId") REFERENCES "ProjectTemplate"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAccess" ADD CONSTRAINT "ProjectAccess_organizationId_projectId_fkey" FOREIGN KEY ("organizationId", "projectId") REFERENCES "Project"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAccess" ADD CONSTRAINT "ProjectAccess_organizationId_membershipId_fkey" FOREIGN KEY ("organizationId", "membershipId") REFERENCES "Membership"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_organizationId_projectId_fkey" FOREIGN KEY ("organizationId", "projectId") REFERENCES "Project"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_parentTaskId_fkey" FOREIGN KEY ("projectId", "parentTaskId") REFERENCES "Task"("projectId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_organizationId_assigneeId_fkey" FOREIGN KEY ("organizationId", "assigneeId") REFERENCES "Membership"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskLabel" ADD CONSTRAINT "TaskLabel_organizationId_taskId_fkey" FOREIGN KEY ("organizationId", "taskId") REFERENCES "Task"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskLabel" ADD CONSTRAINT "TaskLabel_organizationId_labelId_fkey" FOREIGN KEY ("organizationId", "labelId") REFERENCES "Label"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_projectId_taskId_fkey" FOREIGN KEY ("projectId", "taskId") REFERENCES "Task"("projectId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_projectId_dependsOnId_fkey" FOREIGN KEY ("projectId", "dependsOnId") REFERENCES "Task"("projectId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_organizationId_departmentId_fkey" FOREIGN KEY ("organizationId", "departmentId") REFERENCES "Department"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_organizationId_teamId_fkey" FOREIGN KEY ("organizationId", "teamId") REFERENCES "Team"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_organizationId_membershipId_fkey" FOREIGN KEY ("organizationId", "membershipId") REFERENCES "Membership"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipRole" ADD CONSTRAINT "MembershipRole_organizationId_membershipId_fkey" FOREIGN KEY ("organizationId", "membershipId") REFERENCES "Membership"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipRole" ADD CONSTRAINT "MembershipRole_organizationId_roleId_fkey" FOREIGN KEY ("organizationId", "roleId") REFERENCES "Role"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
