import { IsEmail, IsNotEmpty, IsString, Length, Matches } from 'class-validator';

export class LoginDto {
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @Length(1, 256)
  password!: string;
}
