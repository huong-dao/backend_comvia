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
import { MemberRole } from '@prisma/client';
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
  list(@Request() req: { user: { id: string } }) {
    return this.workspacesService.listForUser(req.user.id);
  }

  @Post(':workspaceId/switch')
  switchWorkspace(
    @Request() req: { user: { id: string } },
    @Param('workspaceId') workspaceId: string,
  ) {
    return this.workspacesService.switchWorkspace(req.user.id, workspaceId);
  }

  @Patch(':workspaceId')
  @UseGuards(WorkspaceContextGuard, WorkspaceRolesGuard)
  @WorkspaceRoles(MemberRole.OWNER)
  updateOwner(
    @Request() req: { user: { id: string } },
    @Param('workspaceId') workspaceId: string,
    @Body() dto: UpdateWorkspaceDto,
  ) {
    return this.workspacesService.updateOwner(req.user.id, workspaceId, dto);
  }

  @Delete(':workspaceId')
  @UseGuards(WorkspaceContextGuard, WorkspaceRolesGuard)
  @WorkspaceRoles(MemberRole.OWNER)
  softDelete(
    @Request() req: { user: { id: string } },
    @Param('workspaceId') workspaceId: string,
  ) {
    return this.workspacesService.softDelete(req.user.id, workspaceId);
  }
}
