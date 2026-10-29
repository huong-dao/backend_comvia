import {
  Body,
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Request,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ListAuditLogsQueryDto } from '../audit-log/dto/list-audit-logs-query.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { SystemConfigService } from '../system-config/system-config.service';
import { AdminService } from './admin.service';
import { UpdateMessagePricingConfigDto } from './dto/update-message-pricing-config.dto';
import { ListOaConnectionsQueryDto } from './dto/list-oa-connections-query.dto';
import { UpdateCtaPricingConfigDto } from './dto/update-cta-pricing-config.dto';
import { UpdateAdminCtaButtonPriceDto } from './dto/update-admin-cta-button-price.dto';
import { TemplatesService } from '../templates/templates.service';
import { InternalTemplatesQueryDto } from '../templates/dto/internal-templates-query.dto';
import { AdminOverrideTemplateDto } from '../templates/dto/admin-override-template.dto';

@Controller('admin')
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(
    private readonly service: AdminService,
    private readonly systemConfigService: SystemConfigService,
    private readonly templatesService: TemplatesService,
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

  @Get('oa-connections')
  listOaConnections(@Query() query: ListOaConnectionsQueryDto) {
    return this.service.listOaConnections(query);
  }

  @Get('templates')
  listTemplates(@Query() query: InternalTemplatesQueryDto) {
    return this.templatesService.staffListTemplates(query);
  }

  @Get('templates/:templateId')
  getTemplate(@Param('templateId') templateId: string) {
    return this.templatesService.staffGetTemplate(templateId);
  }

  // Admin override: writes any template field regardless of status, bypassing
  // the "APPROVED is read-only" rule that gates the workspace-scoped PATCH.
  @Patch('templates/:templateId')
  overrideTemplate(
    @Request() req: { user: { id: string } },
    @Param('templateId') templateId: string,
    @Body() dto: AdminOverrideTemplateDto,
  ) {
    return this.templatesService.adminOverride(templateId, req.user.id, dto);
  }

  @Patch('templates/:templateId/cta-buttons/:ctaButtonId/unit-price')
  updateTemplateCtaPrice(
    @Request() req: { user: { id: string } },
    @Param('templateId') templateId: string,
    @Param('ctaButtonId') ctaButtonId: string,
    @Body() dto: UpdateAdminCtaButtonPriceDto,
  ) {
    return this.templatesService.updateCtaUnitPriceForAdmin(
      req.user.id,
      templateId,
      ctaButtonId,
      dto.unitPrice,
    );
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

  @Get('config/cta-pricing')
  getCtaPricingConfig() {
    return this.systemConfigService.getCtaPricing();
  }

  @Patch('config/cta-pricing')
  updateCtaPricingConfig(@Body() dto: UpdateCtaPricingConfigDto) {
    return this.systemConfigService.updateCtaPricing(dto.prices);
  }
}
