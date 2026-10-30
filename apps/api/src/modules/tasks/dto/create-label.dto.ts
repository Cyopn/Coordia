import { IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

export class CreateLabelDto {
  @IsString()
  @Length(1, 80)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(7)
  @Matches(/^#[0-9A-Fa-f]{6}$/)
  color?: string;
}
