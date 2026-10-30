import { IsString, Length, Matches } from 'class-validator';

export class VerifyLoginMfaDto {
  @IsString()
  @Length(32, 256)
  challengeToken!: string;

  @IsString()
  @Length(6, 32)
  @Matches(/^[A-Za-z0-9]+$/)
  code!: string;
}
