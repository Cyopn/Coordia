import { IsDateString, IsEnum, IsObject, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';
import { DelayPolicy, ProjectStatus, ProjectVisibility, TaskPriority } from '@prisma/client';

export class UpdateProjectDto {
  @IsString()
  @Length(2, 160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsEnum(ProjectStatus)
  status!: ProjectStatus;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsEnum(ProjectVisibility)
  visibility?: ProjectVisibility;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @IsOptional()
  @IsEnum(DelayPolicy)
  delayPolicy?: DelayPolicy;

  @IsOptional()
  @IsObject()
  configuration?: Record<string, unknown>;
}
