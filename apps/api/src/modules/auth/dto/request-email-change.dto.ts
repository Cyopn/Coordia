import { IsEmail, IsNotEmpty, IsString, Length } from 'class-validator';

export class RequestEmailChangeDto {
  @IsEmail()
  @IsNotEmpty()
  newEmail!: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 256)
  currentPassword!: string;
}
