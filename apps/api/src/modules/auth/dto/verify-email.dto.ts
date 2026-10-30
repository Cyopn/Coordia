import { IsEmail, IsNotEmpty, IsString, Length, Matches } from 'class-validator';

export class VerifyEmailDto {
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  code!: string;
}
