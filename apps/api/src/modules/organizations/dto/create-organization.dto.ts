import { IsString, Length } from 'class-validator';

export class CreateOrganizationDto {
  @IsString()
  @Length(1, 120)
  name!: string;
}
