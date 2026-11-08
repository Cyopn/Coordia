import { IsArray, IsObject, IsOptional, IsString, Length, MaxLength, ValidateNested } from 'class-validator';
import { CreateTemplateWorkItemDto } from './create-template.dto';
import { Type } from 'class-transformer';

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
  @ValidateNested({ each: true })
  @Type(() => CreateTemplateWorkItemDto)
  items?: CreateTemplateWorkItemDto[];
}
