import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MemberRole } from '@prisma/client';
import { WorkspaceRoles } from '../common/decorators/workspace-roles.decorator';
import { WorkspaceContextGuard } from '../common/guards/workspace-context.guard';
import { WorkspaceRolesGuard } from '../common/guards/workspace-roles.guard';
import { CreateOaDto } from './dto/create-oa.dto';
import { UpdateOaDto } from './dto/update-oa.dto';
import { OaProfileService } from './oa-profile.service';
import type { UploadedImageFile } from './oa-profile.service';

type AuthenticatedRequest = { user: { id: string } };

/**
 * CRUD thông tin OA nội bộ (box "Thông tin OA"), path gốc `workspaces/:workspaceId/oa`.
 * Sub-path OAuth (status/connect/disconnect) thuộc OaConnectionsController.
 * Role theo BR-MEMBER-04: tạo/sửa = OWNER; đọc = OWNER + MEMBER.
 */
@Controller('workspaces/:workspaceId/oa')
export class OaProfileController {
  constructor(private readonly service: OaProfileService) {}

  @Get()
  @UseGuards(WorkspaceContextGuard, WorkspaceRolesGuard)
  @WorkspaceRoles(MemberRole.OWNER, MemberRole.MEMBER)
  get(@Param('workspaceId') workspaceId: string) {
    return this.service.getProfile(workspaceId);
  }

  @Post()
  @UseGuards(WorkspaceContextGuard, WorkspaceRolesGuard)
  @WorkspaceRoles(MemberRole.OWNER)
  create(
    @Request() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateOaDto,
  ) {
    return this.service.createProfile(workspaceId, req.user.id, dto);
  }

  @Patch()
  @UseGuards(WorkspaceContextGuard, WorkspaceRolesGuard)
  @WorkspaceRoles(MemberRole.OWNER)
  update(
    @Request() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Body() dto: UpdateOaDto,
  ) {
    return this.service.updateProfile(workspaceId, req.user.id, dto);
  }

  @Post('avatar')
  @UseGuards(WorkspaceContextGuard, WorkspaceRolesGuard)
  @WorkspaceRoles(MemberRole.OWNER)
  @UseInterceptors(FileInterceptor('file'))
  uploadAvatar(
    @Request() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @UploadedFile() file: UploadedImageFile,
  ) {
    return this.service.uploadAvatar(workspaceId, req.user.id, file);
  }

  @Post('logo-light')
  @UseGuards(WorkspaceContextGuard, WorkspaceRolesGuard)
  @WorkspaceRoles(MemberRole.OWNER)
  @UseInterceptors(FileInterceptor('file'))
  uploadLogoLight(
    @Request() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @UploadedFile() file: UploadedImageFile,
  ) {
    return this.service.uploadLogoLight(workspaceId, req.user.id, file);
  }

  @Post('logo-dark')
  @UseGuards(WorkspaceContextGuard, WorkspaceRolesGuard)
  @WorkspaceRoles(MemberRole.OWNER)
  @UseInterceptors(FileInterceptor('file'))
  uploadLogoDark(
    @Request() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @UploadedFile() file: UploadedImageFile,
  ) {
    return this.service.uploadLogoDark(workspaceId, req.user.id, file);
  }
}
