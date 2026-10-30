import { IsUUID } from 'class-validator';

export class ManageTeamMemberDto {
  @IsUUID()
  membershipId!: string;
}
