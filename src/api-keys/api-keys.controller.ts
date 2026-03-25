import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  Request,
} from '@nestjs/common';
import { MemberRole } from '@prisma/client';
import { WorkspaceContextGuard } from '../common/guards/workspace-context.guard';
import { WorkspaceRoles } from '../common/decorators/workspace-roles.decorator';
import { WorkspaceRolesGuard } from '../common/guards/workspace-roles.guard';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { ApiKeysService } from './api-keys.service';

@Controller('workspaces/:workspaceId/api-keys')
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Post()
  @UseGuards(WorkspaceContextGuard, WorkspaceRolesGuard)
  @WorkspaceRoles(MemberRole.OWNER)
  create(
    @Request() req: { user: { id: string } },
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateApiKeyDto,
  ) {
    // userId comes from JWT guard
    return this.apiKeysService.create(workspaceId, dto, req.user.id);
  }

  @Get()
  @UseGuards(WorkspaceContextGuard, WorkspaceRolesGuard)
  @WorkspaceRoles(MemberRole.OWNER)
  list(@Param('workspaceId') workspaceId: string) {
    return this.apiKeysService.list(workspaceId);
  }

  @Patch(':apiKeyId/disable')
  @UseGuards(WorkspaceContextGuard, WorkspaceRolesGuard)
  @WorkspaceRoles(MemberRole.OWNER)
  disable(
    @Param('workspaceId') workspaceId: string,
    @Param('apiKeyId') apiKeyId: string,
  ) {
    return this.apiKeysService.disable(workspaceId, apiKeyId);
  }

  @Post(':apiKeyId/regenerate')
  @UseGuards(WorkspaceContextGuard, WorkspaceRolesGuard)
  @WorkspaceRoles(MemberRole.OWNER)
  regenerate(
    @Param('workspaceId') workspaceId: string,
    @Param('apiKeyId') apiKeyId: string,
  ) {
    return this.apiKeysService.regenerate(workspaceId, apiKeyId);
  }
}
