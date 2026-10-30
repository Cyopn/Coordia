import { IsEmail, IsNotEmpty, IsString, Length, Matches } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @Length(12, 256)
  password!: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  termsVersion!: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  privacyVersion!: string;

  @IsString()
  @Length(0, 2048)
  userAgent = '';
}
