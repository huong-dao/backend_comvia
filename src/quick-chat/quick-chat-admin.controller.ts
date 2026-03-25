import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { UpsertQuickChatAgentProfileDto } from './dto/upsert-agent-profile.dto';
import { QuickChatService } from './quick-chat.service';

@Controller('admin/quick-chat')
@Roles(UserRole.ADMIN)
export class QuickChatAdminController {
  constructor(private readonly service: QuickChatService) {}

  @Get('agents')
  listAgents() {
    return this.service.listAgents();
  }

  @Get('tools')
  listTools() {
    return this.service.listAllToolNames();
  }

  @Put('agents/:agentId')
  upsertAgent(
    @Param('agentId') agentId: string,
    @Body() dto: UpsertQuickChatAgentProfileDto,
  ) {
    return this.service.upsertAgent(agentId, dto);
  }
}
