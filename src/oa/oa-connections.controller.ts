import {
  Body,
  Controller,
  Get,
  Post,
  Request,
  Param,
  UseGuards,
} from '@nestjs/common';
import { MemberRole } from '@prisma/client';
import { WorkspaceContextGuard } from '../common/guards/workspace-context.guard';
import { WorkspaceRoles } from '../common/decorators/workspace-roles.decorator';
import { WorkspaceRolesGuard } from '../common/guards/workspace-roles.guard';
import { OaConnectionsService } from './oa-connections.service';

@Controller('workspaces/:workspaceId/oa')
export class OaConnectionsController {
  constructor(private readonly service: OaConnectionsService) {}

  @Get('status')
  @UseGuards(WorkspaceContextGuard, WorkspaceRolesGuard)
  @WorkspaceRoles(MemberRole.OWNER, MemberRole.MEMBER)
  status(@Param('workspaceId') workspaceId: string) {
    return this.service.getStatus(workspaceId);
  }

  @Post('connect')
  @UseGuards(WorkspaceContextGuard, WorkspaceRolesGuard)
  @WorkspaceRoles(MemberRole.OWNER)
  connect(
    @Request() req: { user: { id: string } },
    @Param('workspaceId') workspaceId: string,
  ) {
    return this.service.connect(workspaceId, req.user.id);
  }

  @Post('disconnect')
  @UseGuards(WorkspaceContextGuard, WorkspaceRolesGuard)
  @WorkspaceRoles(MemberRole.OWNER)
  disconnect(
    @Request() req: { user: { id: string } },
    @Param('workspaceId') workspaceId: string,
  ) {
    return this.service.disconnect(workspaceId, req.user.id);
  }
}
