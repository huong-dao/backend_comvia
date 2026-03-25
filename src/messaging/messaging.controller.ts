import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { MemberRole } from '@prisma/client';
import { WorkspaceContextGuard } from '../common/guards/workspace-context.guard';
import { WorkspaceRoles } from '../common/decorators/workspace-roles.decorator';
import { WorkspaceRolesGuard } from '../common/guards/workspace-roles.guard';
import { SendSingleDto } from './dto/send-single.dto';
import { MessageLogsQueryDto } from './dto/message-logs-query.dto';
import { MessagingService } from './messaging.service';

@Controller('workspaces/:workspaceId/messages')
export class MessagingController {
  constructor(private readonly service: MessagingService) {}

  @Post('send-single')
  @UseGuards(WorkspaceContextGuard, WorkspaceRolesGuard)
  @WorkspaceRoles(MemberRole.OWNER, MemberRole.MEMBER)
  sendSingle(
    @Request() req: { user: { id: string } },
    @Param('workspaceId') workspaceId: string,
    @Body() dto: SendSingleDto,
  ) {
    return this.service.sendSingle(workspaceId, req.user.id, dto);
  }

  @Get('logs')
  @UseGuards(WorkspaceContextGuard, WorkspaceRolesGuard)
  @WorkspaceRoles(MemberRole.OWNER, MemberRole.MEMBER)
  listLogs(
    @Param('workspaceId') workspaceId: string,
    @Query() query: MessageLogsQueryDto,
  ) {
    return this.service.listMessageLogs(
      workspaceId,
      query.status,
      query.sendType,
      query.limit,
    );
  }
}
