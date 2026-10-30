import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 256)
  token!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @Length(12, 256)
  password!: string;
}
