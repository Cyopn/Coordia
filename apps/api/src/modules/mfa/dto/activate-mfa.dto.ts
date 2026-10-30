import { IsString, Length, Matches } from 'class-validator';

export class ActivateMfaDto {
  @IsString()
  @Length(1, 100)
  factorId!: string;

  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;
}
