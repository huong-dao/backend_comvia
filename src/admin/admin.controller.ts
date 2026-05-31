import { Body, Controller, Get, Patch, Param, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ListAuditLogsQueryDto } from '../audit-log/dto/list-audit-logs-query.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { SystemConfigService } from '../system-config/system-config.service';
import { AdminService } from './admin.service';
import { UpdateMessagePricingConfigDto } from './dto/update-message-pricing-config.dto';

@Controller('admin')
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(
    private readonly service: AdminService,
    private readonly systemConfigService: SystemConfigService,
  ) {}

  @Get('users')
  listUsers() {
    return this.service.listUsers();
  }

  @Patch('users/:userId/lock')
  lockUser(@Param('userId') userId: string, @Body() body: { locked: boolean }) {
    return this.service.lockUser(userId, body.locked);
  }

  @Get('workspaces')
  listWorkspaces() {
    return this.service.listWorkspaces();
  }

  @Patch('workspaces/:workspaceId/disable')
  disableWorkspace(@Param('workspaceId') workspaceId: string) {
    return this.service.disableWorkspace(workspaceId);
  }

  @Get('audit-logs')
  listAuditLogs(@Query() query: ListAuditLogsQueryDto) {
    return this.service.listAuditLogs({
      workspaceId: query.workspaceId,
      action: query.action,
      limit: query.limit,
    });
  }

  @Get('config/message-pricing')
  getMessagePricingConfig() {
    return this.systemConfigService.getConfig();
  }

  @Patch('config/message-pricing')
  updateMessagePricingConfig(@Body() dto: UpdateMessagePricingConfigDto) {
    return this.systemConfigService.updateDefaultMessageUnitPrice(
      dto.defaultMessageUnitPrice,
    );
  }
}
