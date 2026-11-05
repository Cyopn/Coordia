import { IsArray, IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';
import { TaskPriority, TaskStatus } from '@prisma/client';

export class UpdateTaskDto {
  @IsString()
  @Length(2, 240)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsEnum(TaskStatus)
  status!: TaskStatus;

  @IsEnum(TaskPriority)
  priority!: TaskPriority;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  estimatedHours?: number;

  @IsOptional()
  @IsUUID()
  parentTaskId?: string;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  labelIds?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  dependsOnIds?: string[];

  @IsOptional()
  @IsUUID('4', { each: true })
  collaboratorIds?: string[];
}
