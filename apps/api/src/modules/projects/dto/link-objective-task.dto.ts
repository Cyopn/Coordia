import { IsUUID } from 'class-validator';

export class LinkObjectiveTaskDto {
  @IsUUID()
  taskId!: string;
}
