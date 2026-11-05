import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Request } from 'express';
import { PERMISSIONS } from '@coordia/shared';
import { AuthorizationService } from '../../common/authorization/authorization.service';
import { PrismaService } from '../../common/database/prisma.service';
import { SessionService } from '../auth/session.service';
import { CreateTaskCommentDto } from './dto/create-task-comment.dto';
import { UpdateTaskCommentDto } from './dto/update-task-comment.dto';

@Injectable()
export class TaskCommentsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
  ) {}

  async list(organizationId: string, projectId: string, taskId: string, request: Request) {
    const userId = await this.authorized(organizationId, projectId, taskId, request, PERMISSIONS.RESOURCE_READ);
    void userId;
    return this.prisma.taskComment.findMany({
      where: { taskId },
      include: { author: { select: { id: true, user: { select: { id: true, email: true } } } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(
    organizationId: string,
    projectId: string,
    taskId: string,
    dto: CreateTaskCommentDto,
    request: Request,
  ) {
    const userId = await this.authorized(organizationId, projectId, taskId, request, PERMISSIONS.COMMENT_CREATE);
    const membership = await this.prisma.membership.findUniqueOrThrow({
      where: { userId_organizationId: { userId, organizationId } },
      select: { id: true },
    });
    const comment = await this.prisma.taskComment.create({
      data: { taskId, authorId: membership.id, content: dto.content.trim() },
    });
    await this.audit(organizationId, userId, 'task.comment_created', comment.id);
    return comment;
  }

  async update(
    organizationId: string,
    projectId: string,
    taskId: string,
    commentId: string,
    dto: UpdateTaskCommentDto,
    request: Request,
  ) {
    const userId = await this.authorized(organizationId, projectId, taskId, request, PERMISSIONS.COMMENT_UPDATE);
    const comment = await this.prisma.taskComment.findFirst({
      where: { id: commentId, taskId },
      include: { author: { select: { userId: true } } },
    });
    if (!comment) throw new NotFoundException('Comentario no encontrado');
    if (comment.author.userId !== userId) throw new ForbiddenException('Solo puedes modificar tus comentarios');
    return this.prisma.taskComment.update({
      where: { id: commentId },
      data: { content: dto.content.trim() },
    });
  }

  async remove(
    organizationId: string,
    projectId: string,
    taskId: string,
    commentId: string,
    request: Request,
  ) {
    const userId = await this.authorized(organizationId, projectId, taskId, request, PERMISSIONS.COMMENT_DELETE);
    const comment = await this.prisma.taskComment.findFirst({ where: { id: commentId, taskId } });
    if (!comment) throw new NotFoundException('Comentario no encontrado');
    await this.prisma.taskComment.delete({ where: { id: commentId } });
    await this.audit(organizationId, userId, 'task.comment_deleted', commentId);
  }

  private async authorized(
    organizationId: string,
    projectId: string,
    taskId: string,
    request: Request,
    permission: string,
  ): Promise<string> {
    const userId = await this.sessions.requireUser(request);
    await this.authorization.requireProjectAccess(userId, organizationId, projectId, permission);
    const task = await this.prisma.task.findFirst({ where: { id: taskId, projectId }, select: { id: true } });
    if (!task) throw new NotFoundException('Tarea no encontrada');
    return userId;
  }

  private audit(organizationId: string, actorId: string, action: string, resourceId: string) {
    return this.prisma.auditEvent.create({
      data: { organizationId, actorId, action, resourceType: 'task_comment', resourceId, result: 'SUCCESS' },
    });
  }
}
