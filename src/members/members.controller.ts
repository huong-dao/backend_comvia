import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { MemberRole } from '@prisma/client';
import { WorkspaceContextGuard } from '../common/guards/workspace-context.guard';
import { WorkspaceRoles } from '../common/decorators/workspace-roles.decorator';
import { WorkspaceRolesGuard } from '../common/guards/workspace-roles.guard';
import { InviteMemberDto } from './dto/invite-member.dto';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { MembersService } from './members.service';

@Controller('workspaces/:workspaceId')
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  @Get('members')
  @UseGuards(WorkspaceContextGuard)
  listMembers(@Param('workspaceId') workspaceId: string) {
    return this.membersService.listMembers(workspaceId);
  }

  @Post('invitations')
  @UseGuards(WorkspaceContextGuard, WorkspaceRolesGuard)
  @WorkspaceRoles(MemberRole.OWNER)
  invite(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: InviteMemberDto,
  ) {
    return this.membersService.invite(workspaceId, dto);
  }

  @Delete('members/:memberUserId')
  @UseGuards(WorkspaceContextGuard, WorkspaceRolesGuard)
  @WorkspaceRoles(MemberRole.OWNER)
  removeMember(
    @Param('workspaceId') workspaceId: string,
    @Param('memberUserId') memberUserId: string,
  ) {
    return this.membersService.removeMember(workspaceId, memberUserId);
  }

  @Post('invitations/accept')
  acceptInvitation(
    @Request() req: { user: { id: string } },
    @Param('workspaceId') workspaceId: string,
    @Body() dto: AcceptInvitationDto,
  ) {
    return this.membersService.acceptInvitation(workspaceId, req.user.id, dto);
  }
}
