import { IsDateString, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { AbsenceType } from '@prisma/client';

export class CreateAbsenceDto {
  @IsUUID()
  membershipId!: string;

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;

  @IsEnum(AbsenceType)
  type!: AbsenceType;

  @IsOptional()
  @IsString()
  reason?: string;
}
