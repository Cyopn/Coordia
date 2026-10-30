import assert from 'node:assert/strict';
import test from 'node:test';
import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { AuthorizationService } from '../../apps/api/src/common/authorization/authorization.service';

config({ path: '../../.env' });

const prisma = new PrismaClient();

test('authorization cannot cross organization boundaries', async () => {
  const rollback = new Error('rollback integration fixture');
  try {
    await prisma.$transaction(async (transaction) => {
      const permission = await transaction.permission.upsert({
        where: { key: 'integration:tenant-read' },
        update: { description: 'Integration tenant read' },
        create: { key: 'integration:tenant-read', description: 'Integration tenant read' },
      });
      const [userA, userB] = await Promise.all([
        transaction.user.create({
          data: { email: 'tenant-a@example.invalid', emailNormalized: 'tenant-a@example.invalid', status: 'ACTIVE' },
        }),
        transaction.user.create({
          data: { email: 'tenant-b@example.invalid', emailNormalized: 'tenant-b@example.invalid', status: 'ACTIVE' },
        }),
      ]);
      const [orgA, orgB] = await Promise.all([
        transaction.organization.create({
          data: { name: `Tenant A ${userA.id}`, ownerId: userA.id },
        }),
        transaction.organization.create({
          data: { name: `Tenant B ${userB.id}`, ownerId: userB.id },
        }),
      ]);
      const membershipA = await transaction.membership.create({
        data: { userId: userA.id, organizationId: orgA.id },
      });
      await transaction.membership.create({
        data: { userId: userB.id, organizationId: orgB.id },
      });
      const role = await transaction.role.create({
        data: {
          organizationId: orgA.id,
          name: `Reader ${userA.id}`,
          permissions: { create: [{ permissionId: permission.id }] },
        },
      });
      await transaction.membershipRole.create({
        data: { membershipId: membershipA.id, roleId: role.id },
      });

      const authorization = new AuthorizationService(transaction as never);
      assert.equal(await authorization.hasPermission(userA.id, orgA.id, permission.key), true);
      assert.equal(await authorization.hasPermission(userA.id, orgB.id, permission.key), false);
      const privateProject = await transaction.project.create({
        data: {
          organizationId: orgA.id,
          name: `Private ${userA.id}`,
          visibility: 'PRIVATE',
        },
      });
      await assert.rejects(
        authorization.requireProjectAccess(userB.id, orgA.id, privateProject.id, permission.key),
        /No tienes acceso a este proyecto/,
      );
      await transaction.projectAccess.create({
        data: { projectId: privateProject.id, membershipId: membershipA.id },
      });
      await authorization.requireProjectAccess(userA.id, orgA.id, privateProject.id, permission.key);
      await assert.rejects(
        authorization.requirePermission(userA.id, orgB.id, permission.key),
        /No tienes permiso/,
      );
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  } finally {
    await prisma.$disconnect();
  }
});
