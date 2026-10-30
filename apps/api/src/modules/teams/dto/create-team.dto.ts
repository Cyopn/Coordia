import { IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';

export class CreateTeamDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;
}
