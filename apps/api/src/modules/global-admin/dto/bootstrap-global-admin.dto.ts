import { IsEmail, IsNotEmpty, IsString, Length } from 'class-validator';

export class BootstrapGlobalAdminDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  @Length(12, 256)
  password!: string;

  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  mfaCode!: string;

  @IsString()
  @IsNotEmpty()
  @Length(32, 256)
  bootstrapToken!: string;
}
