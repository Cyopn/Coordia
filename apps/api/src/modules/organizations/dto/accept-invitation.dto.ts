import { IsString, Length } from 'class-validator';

export class AcceptInvitationDto {
  @IsString()
  @Length(32, 256)
  token!: string;
}
