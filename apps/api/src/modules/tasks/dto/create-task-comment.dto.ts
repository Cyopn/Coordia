import { IsString, Length, MaxLength } from 'class-validator';

export class CreateTaskCommentDto {
  @IsString()
  @Length(1, 4000)
  @MaxLength(4000)
  content!: string;
}
