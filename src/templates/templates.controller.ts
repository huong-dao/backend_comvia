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
import { TemplatesService } from './templates.service';

@Controller('workspaces/:workspaceId/templates')
export class TemplatesController {
  constructor(private readonly service: TemplatesService) {}

  @Post()
  @UseGuards(WorkspaceContextGuard, WorkspaceRolesGuard)
  @WorkspaceRoles(MemberRole.OWNER, MemberRole.MEMBER)
  create(
    @Request() req: { user: { id: string } },
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateTemplateDto,
  ) {
    return this.service.create(workspaceId, req.user.id, dto);
  }

  @Get()
  @UseGuards(WorkspaceContextGuard, WorkspaceRolesGuard)
  @WorkspaceRoles(MemberRole.OWNER, MemberRole.MEMBER)
  list(@Param('workspaceId') workspaceId: string) {
    return this.service.list(workspaceId);
  }

  @Get(':templateId')
  @UseGuards(WorkspaceContextGuard, WorkspaceRolesGuard)
  @WorkspaceRoles(MemberRole.OWNER, MemberRole.MEMBER)
  get(
    @Param('workspaceId') workspaceId: string,
    @Param('templateId') templateId: string,
  ) {
    return this.service.get(workspaceId, templateId);
  }

  @Patch(':templateId')
  @UseGuards(WorkspaceContextGuard, WorkspaceRolesGuard)
  @WorkspaceRoles(MemberRole.OWNER, MemberRole.MEMBER)
  update(
    @Request() req: { user: { id: string } },
    @Param('workspaceId') workspaceId: string,
    @Param('templateId') templateId: string,
    @Body() dto: UpdateTemplateDto,
  ) {
    return this.service.update(workspaceId, templateId, req.user.id, dto);
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
    @Param('templateId') templateId: string,
    @Body() dto: ApproveTemplateDto,
  ) {
    return this.service.staffApprove(templateId, dto);
  }

  @Post(':templateId/reject')
  @Roles(UserRole.STAFF)
  reject(
    @Param('templateId') templateId: string,
    @Body() dto: RejectTemplateDto,
  ) {
    return this.service.staffReject(templateId, dto);
  }

  @Post(':templateId/disable')
  @Roles(UserRole.STAFF)
  disable(@Param('templateId') templateId: string) {
    return this.service.staffDisable(templateId);
  }
}
