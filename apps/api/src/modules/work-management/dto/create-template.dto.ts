import { IsArray, IsNumber, IsObject, IsOptional, IsString, Length, MaxLength } from 'class-validator';

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
  parentIndex?: number;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
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
  items?: CreateTemplateWorkItemDto[];
}
