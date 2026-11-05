import { IsArray, IsInt, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateOrganizationSettingsDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  taskStatuses?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  taskPriorities?: string[];

  @IsOptional()
  @IsObject()
  workRules?: unknown;

  @IsOptional()
  @IsObject()
  workingHours?: unknown;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  workingDays?: number[];

  @IsOptional()
  @IsObject()
  planning?: unknown;
}
