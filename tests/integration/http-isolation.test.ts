import assert from 'node:assert/strict';
import test from 'node:test';
import { PrismaClient } from '@prisma/client';
import { PERMISSIONS } from '@coordia/shared';
import { createApplication } from '../../apps/api/src/app.factory';
import { TokenService } from '../../apps/api/src/modules/auth/token.service';

const prisma = new PrismaClient();
const tokens = new TokenService();

test('HTTP real rechaza acceso cruzado a organizaciones, proyectos y tareas', async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const emailA = `http-a-${suffix}@example.invalid`;
  const emailB = `http-b-${suffix}@example.invalid`;
  const userA = await prisma.user.create({
    data: { email: emailA, emailNormalized: emailA, status: 'ACTIVE' },
  });
  const userB = await prisma.user.create({
    data: { email: emailB, emailNormalized: emailB, status: 'ACTIVE' },
  });
  const orgA = await prisma.organization.create({
    data: { name: `HTTP A ${suffix}`, ownerId: userA.id },
  });
  const orgB = await prisma.organization.create({
    data: { name: `HTTP B ${suffix}`, ownerId: userB.id },
  });
  const membershipA = await prisma.membership.create({
    data: { userId: userA.id, organizationId: orgA.id },
  });
  const membershipB = await prisma.membership.create({
    data: { userId: userB.id, organizationId: orgB.id },
  });
  const permission = await prisma.permission.upsert({
    where: { key: PERMISSIONS.PROJECT_READ },
    update: { description: 'Consultar proyectos y objetivos' },
    create: { key: PERMISSIONS.PROJECT_READ, description: 'Consultar proyectos y objetivos' },
  });
  const roleA = await prisma.role.create({
    data: {
      organizationId: orgA.id,
      name: `HTTP A role ${suffix}`,
      permissions: { create: [{ permissionId: permission.id }] },
    },
  });
  const roleB = await prisma.role.create({
    data: {
      organizationId: orgB.id,
      name: `HTTP B role ${suffix}`,
      permissions: { create: [{ permissionId: permission.id }] },
    },
  });
  await prisma.membershipRole.createMany({
    data: [
      { membershipId: membershipA.id, roleId: roleA.id },
      { membershipId: membershipB.id, roleId: roleB.id },
    ],
  });
  const projectA = await prisma.project.create({
    data: { organizationId: orgA.id, name: `HTTP project A ${suffix}` },
  });
  const projectB = await prisma.project.create({
    data: { organizationId: orgB.id, name: `HTTP project B ${suffix}` },
  });
  const taskB = await prisma.task.create({
    data: { projectId: projectB.id, title: `HTTP task B ${suffix}` },
  });
  const sessionA = `http-session-a-${suffix}`;
  const sessionB = `http-session-b-${suffix}`;
  await prisma.session.createMany({
    data: [
      {
        userId: userA.id,
        tokenHash: tokens.hash(sessionA),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
      {
        userId: userB.id,
        tokenHash: tokens.hash(sessionB),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    ],
  });

  const app = await createApplication();
  await app.listen(0);
  const address = app.getHttpServer().address();
  assert.ok(address && typeof address !== 'string');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const request = (path: string, token: string, init?: RequestInit) =>
    fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
        cookie: `coordia_session=${token}`,
        ...(init?.headers ?? {}),
      },
    });

  try {
    const cases = [
      request(`/organizations/${orgB.id}/projects`, sessionA),
      request(`/organizations/${orgB.id}/projects`, sessionA, {
        method: 'POST',
        body: JSON.stringify({ name: `forbidden-${suffix}` }),
      }),
      request(`/organizations/${orgB.id}/projects/${projectB.id}/tasks`, sessionA),
      request(`/organizations/${orgB.id}/projects/${projectB.id}/tasks/${taskB.id}`, sessionA, {
        method: 'PATCH',
        body: JSON.stringify({ title: `tampered-${suffix}` }),
      }),
      request(`/organizations/${orgA.id}/projects`, sessionB),
    ];
    const responses = await Promise.all(cases);
    assert.deepEqual(responses.map((response) => response.status), [403, 403, 403, 403, 403]);
    const body = await responses[0].json() as { message?: string };
    assert.equal(body.message, 'No tienes permiso para realizar esta operación');

    const ownResponse = await request(`/organizations/${orgA.id}/projects`, sessionA);
    assert.equal(ownResponse.status, 200);
    const ownProjects = await ownResponse.json() as Array<{ id: string }>;
    assert.deepEqual(ownProjects.map(({ id }) => id), [projectA.id]);
  } finally {
    await app.close();
    await prisma.organization.deleteMany({ where: { id: { in: [orgA.id, orgB.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
  }
});

test.after(async () => {
  await prisma.$disconnect();
});
