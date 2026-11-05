import { IsObject, IsOptional } from 'class-validator';

export class UpdateOrganizationSettingsDto {
  @IsOptional()
  @IsObject()
  taskStatuses?: unknown;

  @IsOptional()
  @IsObject()
  taskPriorities?: unknown;

  @IsOptional()
  @IsObject()
  workRules?: unknown;

  @IsOptional()
  @IsObject()
  workingHours?: unknown;

  @IsOptional()
  @IsObject()
  workingDays?: unknown;

  @IsOptional()
  @IsObject()
  planning?: unknown;
}
