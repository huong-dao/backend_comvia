import { UserRole } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  tokenVersion?: number;
  // Set only on a short-lived impersonation token (see AdminService.impersonateWorkspaceOwner):
  // the id of the ADMIN who generated it. Absent on every normal login token.
  impersonatedBy?: string;
  // ISSUE-003: distinguishes a long-lived refresh token from a normal access
  // token so one can never be used in place of the other. Absent (undefined)
  // on access tokens issued before this field existed — JwtStrategy treats
  // that the same as 'access' for backward compatibility with tokens already
  // in the wild at deploy time.
  type?: 'access' | 'refresh';
  // Refresh-token-only: unique id of this specific refresh token, checked
  // against User.currentRefreshTokenId to detect reuse of a rotated-out token.
  jti?: string;
}
