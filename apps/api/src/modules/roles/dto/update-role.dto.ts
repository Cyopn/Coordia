import { ArrayNotEmpty, IsArray, IsString, Length } from 'class-validator';

export class UpdateRoleDto {
  @IsString()
  @Length(1, 80)
  name!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  permissionKeys!: string[];
}
