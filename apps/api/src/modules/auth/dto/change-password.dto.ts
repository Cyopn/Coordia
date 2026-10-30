import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 256)
  currentPassword!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @Length(12, 256)
  newPassword!: string;
}
