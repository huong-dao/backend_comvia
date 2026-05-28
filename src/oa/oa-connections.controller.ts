import {
  Controller,
  Get,
  Param,
  Post,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
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

  @Get('connect/redirect')
  @UseGuards(WorkspaceContextGuard, WorkspaceRolesGuard)
  @WorkspaceRoles(MemberRole.OWNER)
  async connectRedirect(
    @Request() req: { user: { id: string } },
    @Param('workspaceId') workspaceId: string,
    @Res() res: Response,
  ) {
    const result = await this.service.startConnect(workspaceId, req.user.id);
    return res.redirect(result.authorizationUrl);
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
