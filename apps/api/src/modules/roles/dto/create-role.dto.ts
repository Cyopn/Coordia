import { ArrayNotEmpty, IsArray, IsString, Length } from 'class-validator';

export class CreateRoleDto {
  @IsString()
  @Length(1, 80)
  name!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  permissionKeys!: string[];
}
