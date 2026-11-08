import { IsArray, IsInt, IsNumber, IsObject, IsOptional, IsString, Length, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateTemplateWorkItemDto {
  @IsString()
  @Length(1, 240)
  title!: string;

  @IsString()
  @Length(1, 40)
  type!: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  priority?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  estimatedHours?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  parentIndex?: number;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  dependsOnIndexes?: number[];
}

export class CreateTemplateDto {
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
