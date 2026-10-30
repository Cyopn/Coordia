import { IsNotEmpty, IsString, IsUUID, Length, Matches } from 'class-validator';

export class ResetPasswordDto {
  @IsUUID()
  @IsNotEmpty()
  userId!: string;

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
