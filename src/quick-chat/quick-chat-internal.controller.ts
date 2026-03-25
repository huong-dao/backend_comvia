import { Body, Controller, Get, Param, Post, Request } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { InternalCreateQuickChatSessionDto } from './dto/internal-create-session.dto';
import { SendQuickChatMessageDto } from './dto/send-message.dto';
import { QuickChatRole } from './quick-chat.types';
import { QuickChatService } from './quick-chat.service';

type InternalQuickChatRequest = {
  user: { id: string; role?: UserRole };
};

@Controller('internal/quick-chat')
@Roles(UserRole.ADMIN, UserRole.STAFF)
export class QuickChatInternalController {
  constructor(private readonly service: QuickChatService) {}

  @Post('sessions')
  createSession(
    @Request() req: InternalQuickChatRequest,
    @Body() dto: InternalCreateQuickChatSessionDto,
  ) {
    return this.service.createSession(dto.workspaceId, req.user.id, dto);
  }

  @Get('sessions/:sessionId')
  getSession(
    @Request() req: InternalQuickChatRequest,
    @Param('sessionId') sessionId: string,
  ) {
    return this.service.getSession(undefined, req.user.id, sessionId);
  }

  @Post('sessions/:sessionId/messages')
  sendMessage(
    @Request() req: InternalQuickChatRequest,
    @Param('sessionId') sessionId: string,
    @Body() dto: SendQuickChatMessageDto,
  ) {
    const role = mapUserRole(req.user.role);
    return this.service.sendMessage(
      undefined,
      req.user.id,
      role,
      sessionId,
      dto,
    );
  }

  @Post('sessions/:sessionId/actions/:actionId/confirm')
  confirmAction(
    @Request() req: InternalQuickChatRequest,
    @Param('sessionId') sessionId: string,
    @Param('actionId') actionId: string,
  ) {
    const role = mapUserRole(req.user.role);
    return this.service.confirmAction(
      undefined,
      req.user.id,
      role,
      sessionId,
      actionId,
    );
  }
}

function mapUserRole(role?: UserRole): QuickChatRole {
  if (role === UserRole.ADMIN) return 'ADMIN';
  if (role === UserRole.STAFF) return 'STAFF';
  return 'MEMBER';
}
