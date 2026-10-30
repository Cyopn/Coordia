import { IsNotEmpty, IsString, Length } from 'class-validator';

export class ConfirmEmailChangeDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 256)
  token!: string;
}
