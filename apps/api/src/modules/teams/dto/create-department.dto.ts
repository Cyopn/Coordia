import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class CreateDepartmentDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
