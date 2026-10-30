import { IsString, Length, Matches } from 'class-validator';

export class DisableMfaDto {
  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;

  @IsString()
  @Length(1, 256)
  password!: string;
}
