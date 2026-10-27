import { MemberRole } from '@prisma/client';
import { WORKSPACE_ROLES_KEY } from '../common/decorators/workspace-roles.decorator';
import { WorkspaceFinanceController } from './workspace-finance.controller';

describe('WorkspaceFinanceController authorization', () => {
  it('allows only the workspace owner to access finance routes', () => {
    expect(
      Reflect.getMetadata(WORKSPACE_ROLES_KEY, WorkspaceFinanceController),
    ).toEqual([MemberRole.OWNER]);
  });
});
