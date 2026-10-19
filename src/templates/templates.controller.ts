import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { MemberRole, UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { WorkspaceContextGuard } from '../common/guards/workspace-context.guard';
import { WorkspaceRoles } from '../common/decorators/workspace-roles.decorator';
import { WorkspaceRolesGuard } from '../common/guards/workspace-roles.guard';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { SubmitTemplateDto } from './dto/submit-template.dto';
import { ApproveTemplateDto } from './dto/approve-template.dto';
import { RejectTemplateDto } from './dto/reject-template.dto';
import { InternalTemplatesQueryDto } from './dto/internal-templates-query.dto';
import { UpdateTemplateCtaButtonPriceDto } from './dto/template-cta-button.dto';
import { TemplatesService } from './templates.service';

@Controller('workspaces/:workspaceId/templates')
export class TemplatesController {
  constructor(private readonly service: TemplatesService) {}

  @Post()
  @UseGuards(WorkspaceContextGuard, WorkspaceRolesGuard)
  @WorkspaceRoles(MemberRole.OWNER, MemberRole.MEMBER)
  create(
    @Request() req: { user: { id: string; role: UserRole } },
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateTemplateDto,
  ) {
    return this.service.create(workspaceId, req.user.id, req.user.role, dto);
  }

  @Get()
  @UseGuards(WorkspaceContextGuard, WorkspaceRolesGuard)
  @WorkspaceRoles(MemberRole.OWNER, MemberRole.MEMBER)
  list(
    @Request() req: { user: { role: UserRole } },
    @Param('workspaceId') workspaceId: string,
  ) {
    return this.service.list(workspaceId, req.user.role);
  }

  @Get(':templateId')
  @UseGuards(WorkspaceContextGuard, WorkspaceRolesGuard)
  @WorkspaceRoles(MemberRole.OWNER, MemberRole.MEMBER)
  get(
    @Request() req: { user: { role: UserRole } },
    @Param('workspaceId') workspaceId: string,
    @Param('templateId') templateId: string,
  ) {
    return this.service.get(workspaceId, templateId, req.user.role);
  }

  @Patch(':templateId')
  @UseGuards(WorkspaceContextGuard, WorkspaceRolesGuard)
  @WorkspaceRoles(MemberRole.OWNER, MemberRole.MEMBER)
  update(
    @Request() req: { user: { id: string; role: UserRole } },
    @Param('workspaceId') workspaceId: string,
    @Param('templateId') templateId: string,
    @Body() dto: UpdateTemplateDto,
  ) {
    return this.service.update(
      workspaceId,
      templateId,
      req.user.id,
      req.user.role,
      dto,
    );
  }

  @Patch(':templateId/cta-buttons/:ctaButtonId/unit-price')
  @UseGuards(WorkspaceContextGuard, WorkspaceRolesGuard)
  @WorkspaceRoles(MemberRole.OWNER, MemberRole.MEMBER)
  updateCtaUnitPrice(
    @Request() req: { user: { role: UserRole } },
    @Param('workspaceId') workspaceId: string,
    @Param('templateId') templateId: string,
    @Param('ctaButtonId') ctaButtonId: string,
    @Body() dto: UpdateTemplateCtaButtonPriceDto,
  ) {
    return this.service.updateCtaUnitPrice(
      workspaceId,
      templateId,
      ctaButtonId,
      dto.unitPrice,
      req.user.role,
    );
  }

  @Post(':templateId/submit')
  @UseGuards(WorkspaceContextGuard, WorkspaceRolesGuard)
  @WorkspaceRoles(MemberRole.OWNER, MemberRole.MEMBER)
  submit(
    @Request() req: { user: { id: string } },
    @Param('workspaceId') workspaceId: string,
    @Param('templateId') templateId: string,
    @Body() _dto: SubmitTemplateDto,
  ) {
    void _dto;
    return this.service.submit(workspaceId, templateId, req.user.id);
  }

  @Post(':templateId/disable')
  @UseGuards(WorkspaceContextGuard, WorkspaceRolesGuard)
  @WorkspaceRoles(MemberRole.OWNER)
  disable(
    @Request() req: { user: { id: string } },
    @Param('workspaceId') workspaceId: string,
    @Param('templateId') templateId: string,
  ) {
    return this.service.disable(workspaceId, templateId, req.user.id);
  }
}

@Controller('internal/templates')
export class InternalTemplatesController {
  constructor(private readonly service: TemplatesService) {}

  @Get()
  @Roles(UserRole.STAFF)
  list(@Query() query: InternalTemplatesQueryDto) {
    return this.service.staffListTemplates(query);
  }

  @Get(':templateId')
  @Roles(UserRole.STAFF)
  get(@Param('templateId') templateId: string) {
    return this.service.staffGetTemplate(templateId);
  }

  @Post(':templateId/mark-pending-zalo-approval')
  @Roles(UserRole.STAFF)
  markPendingZaloApproval(@Param('templateId') templateId: string) {
    return this.service.staffMarkPendingZaloApproval(templateId);
  }

  @Post(':templateId/approve')
  @Roles(UserRole.STAFF)
  approve(
    @Request() req: { user: { id: string } },
    @Param('templateId') templateId: string,
    @Body() dto: ApproveTemplateDto,
  ) {
    return this.service.staffApprove(templateId, req.user.id, dto);
  }

  @Post(':templateId/reject')
  @Roles(UserRole.STAFF)
  reject(
    @Request() req: { user: { id: string } },
    @Param('templateId') templateId: string,
    @Body() dto: RejectTemplateDto,
  ) {
    return this.service.staffReject(templateId, req.user.id, dto);
  }

  @Post(':templateId/disable')
  @Roles(UserRole.STAFF)
  disable(@Param('templateId') templateId: string) {
    return this.service.staffDisable(templateId);
  }
}
