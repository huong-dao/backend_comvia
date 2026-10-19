import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { MemberRole, UserRole, WorkspaceStatus } from '@prisma/client';
import { AllowWorkspaceStatuses } from '../common/decorators/allow-workspace-statuses.decorator';
import { WorkspaceRoles } from '../common/decorators/workspace-roles.decorator';
import { WorkspaceContextGuard } from '../common/guards/workspace-context.guard';
import { WorkspaceRolesGuard } from '../common/guards/workspace-roles.guard';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { WorkspacesService } from './workspaces.service';

@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Post()
  create(
    @Request() req: { user: { id: string } },
    @Body() dto: CreateWorkspaceDto,
  ) {
    return this.workspacesService.create(req.user.id, dto);
  }

  @Get()
  list(@Request() req: { user: { id: string; role: UserRole } }) {
    return this.workspacesService.listForUser(req.user.id, req.user.role);
  }

  @Post(':workspaceId/switch')
  switchWorkspace(
    @Request() req: { user: { id: string; role: UserRole } },
    @Param('workspaceId') workspaceId: string,
  ) {
    return this.workspacesService.switchWorkspace(
      req.user.id,
      workspaceId,
      req.user.role,
    );
  }

  @Get(':workspaceId')
  @UseGuards(WorkspaceContextGuard, WorkspaceRolesGuard)
  @WorkspaceRoles(MemberRole.OWNER)
  @AllowWorkspaceStatuses(
    WorkspaceStatus.ACTIVE,
    WorkspaceStatus.DISABLED,
    WorkspaceStatus.SUSPENDED,
  )
  async getDetail(
    @Request()
    req: { user: { role: UserRole }; workspaceMember?: { role: MemberRole } },
    @Param('workspaceId') workspaceId: string,
  ) {
    const detail = await this.workspacesService.getDetail(workspaceId);
    return {
      ...detail,
      role:
        req.user.role === UserRole.ADMIN ? 'ADMIN' : req.workspaceMember?.role,
    };
  }

  @Patch(':workspaceId')
  @UseGuards(WorkspaceContextGuard, WorkspaceRolesGuard)
  @WorkspaceRoles(MemberRole.OWNER)
  @AllowWorkspaceStatuses(
    WorkspaceStatus.ACTIVE,
    WorkspaceStatus.DISABLED,
    WorkspaceStatus.SUSPENDED,
  )
  updateOwner(
    @Request() req: { user: { id: string; role: UserRole } },
    @Param('workspaceId') workspaceId: string,
    @Body() dto: UpdateWorkspaceDto,
  ) {
    return this.workspacesService.updateOwner(
      req.user.id,
      workspaceId,
      dto,
      req.user.role,
    );
  }

  @Delete(':workspaceId')
  @UseGuards(WorkspaceContextGuard, WorkspaceRolesGuard)
  @WorkspaceRoles(MemberRole.OWNER)
  softDelete(
    @Request() req: { user: { id: string; role: UserRole } },
    @Param('workspaceId') workspaceId: string,
  ) {
    return this.workspacesService.softDelete(
      req.user.id,
      workspaceId,
      req.user.role,
    );
  }
}
