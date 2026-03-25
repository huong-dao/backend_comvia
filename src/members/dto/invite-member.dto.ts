import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { MemberRole } from '@prisma/client';

export class InviteMemberDto {
  @IsString()
  @MinLength(3)
  inviteType!: 'EMAIL' | 'PHONE';

  @IsString()
  @MinLength(5)
  inviteValue!: string;

  @IsOptional()
  @IsEnum(MemberRole)
  role?: MemberRole;
}
