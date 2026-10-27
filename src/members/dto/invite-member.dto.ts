import { IsEmail, IsEnum, IsIn, IsOptional } from 'class-validator';
import { MemberRole } from '@prisma/client';

export class InviteMemberDto {
  @IsIn(['EMAIL'])
  inviteType!: 'EMAIL';

  @IsEmail()
  inviteValue!: string;

  @IsOptional()
  @IsEnum(MemberRole)
  role?: MemberRole;
}
