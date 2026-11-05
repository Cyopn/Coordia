import { IsArray, IsObject, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { CreateTemplateWorkItemDto } from './create-template.dto';

export class UpdateTemplateDto {
  @IsString()
  @Length(2, 160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsObject()
  configuration?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  items?: CreateTemplateWorkItemDto[];
}
