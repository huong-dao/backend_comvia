import { Body, Controller, Get, Patch, Param } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminService } from './admin.service';

@Controller('admin')
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(private readonly service: AdminService) {}

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
}
