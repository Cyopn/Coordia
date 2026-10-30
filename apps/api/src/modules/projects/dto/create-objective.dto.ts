import { IsDateString, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class CreateObjectiveDto {
  @IsString()
  @Length(2, 200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;
}
