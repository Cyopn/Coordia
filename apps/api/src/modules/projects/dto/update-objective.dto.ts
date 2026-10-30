import { IsDateString, IsEnum, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { ObjectiveStatus } from '@prisma/client';

export class UpdateObjectiveDto {
  @IsString()
  @Length(2, 200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsEnum(ObjectiveStatus)
  status!: ObjectiveStatus;

  @IsOptional()
  @IsDateString()
  dueAt?: string;
}
