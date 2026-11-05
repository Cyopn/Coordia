import { IsString, Length, MaxLength } from 'class-validator';

export class UpdateTaskCommentDto {
  @IsString()
  @Length(1, 4000)
  @MaxLength(4000)
  content!: string;
}
