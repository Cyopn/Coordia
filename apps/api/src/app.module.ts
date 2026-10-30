import { Controller, Get, Module } from '@nestjs/common';
import { PrismaModule } from './common/database/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { AuthorizationModule } from './common/authorization/authorization.module';
import { RolesModule } from './modules/roles/roles.module';
import { MfaModule } from './modules/mfa/mfa.module';
import { AuditModule } from './modules/audit/audit.module';
import { TeamsModule } from './modules/teams/teams.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { TasksModule } from './modules/tasks/tasks.module';

@Controller('health')
class HealthController {
  @Get()
  getHealth() {
    return { status: 'ok', service: 'coordia-api' };
  }
}

@Module({
  imports: [
    PrismaModule,
    AuthorizationModule,
    AuthModule,
    OrganizationsModule,
    RolesModule,
    MfaModule,
    AuditModule,
    TeamsModule,
    ProjectsModule,
    TasksModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
