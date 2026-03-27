import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { MemberRole } from '@prisma/client';
import { WorkspaceRoles } from '../common/decorators/workspace-roles.decorator';
import { WorkspaceContextGuard } from '../common/guards/workspace-context.guard';
import { WorkspaceRolesGuard } from '../common/guards/workspace-roles.guard';
import { CreateQuickChatSessionDto } from './dto/create-session.dto';
import { SendQuickChatMessageDto } from './dto/send-message.dto';
import { QuickChatService } from './quick-chat.service';

type QuickChatRequest = {
  user: { id: string };
  workspaceMember?: { role?: string };
};

@Controller('workspaces/:workspaceId/quick-chat')
@UseGuards(WorkspaceContextGuard, WorkspaceRolesGuard)
@WorkspaceRoles(MemberRole.OWNER, MemberRole.MEMBER)
export class QuickChatController {
  constructor(private readonly service: QuickChatService) {}

  @Post('sessions')
  createSession(
    @Request() req: QuickChatRequest,
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateQuickChatSessionDto,
  ) {
    return this.service.createSession(workspaceId, req.user.id, dto);
  }

  @Get('sessions/:sessionId')
  getSession(
    @Request() req: QuickChatRequest,
    @Param('workspaceId') workspaceId: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.service.getSession(workspaceId, req.user.id, sessionId);
  }

  @Post('sessions/:sessionId/messages')
  sendMessage(
    @Request() req: QuickChatRequest,
    @Param('workspaceId') workspaceId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: SendQuickChatMessageDto,
  ) {
    const role = roleFromWorkspaceMember(req.workspaceMember?.role);
    return this.service.sendMessage(
      workspaceId,
      req.user.id,
      role,
      sessionId,
      dto,
    );
  }

  @Post('sessions/:sessionId/actions/:actionId/confirm')
  confirmAction(
    @Request() req: QuickChatRequest,
    @Param('workspaceId') workspaceId: string,
    @Param('sessionId') sessionId: string,
    @Param('actionId') actionId: string,
  ) {
    return this.service.confirmAction(
      workspaceId,
      req.user.id,
      roleFromWorkspaceMember(req.workspaceMember?.role),
      sessionId,
      actionId,
    );
  }
}

function roleFromWorkspaceMember(role?: string): 'OWNER' | 'MEMBER' {
  return role === MemberRole.OWNER ? 'OWNER' : 'MEMBER';
}
