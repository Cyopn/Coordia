import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';
import { WorkCapacityAdjustmentType } from '@prisma/client';

export class CreateCapacityAdjustmentDto {
  @IsUUID()
  membershipId!: string;

  @IsDateString()
  date!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  hours!: number;

  @IsEnum(WorkCapacityAdjustmentType)
  type!: WorkCapacityAdjustmentType;

  @IsOptional()
  @IsString()
  reason?: string;
}
