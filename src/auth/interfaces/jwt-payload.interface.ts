import { UserRole } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  tokenVersion?: number;
  // Set only on a short-lived impersonation token (see AdminService.impersonateWorkspaceOwner):
  // the id of the ADMIN who generated it. Absent on every normal login token.
  impersonatedBy?: string;
}
