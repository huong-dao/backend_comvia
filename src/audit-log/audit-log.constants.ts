export const AUDIT_ACTIONS = {
  WORKSPACE_CREATED: 'workspace.created',
  WORKSPACE_UPDATED: 'workspace.updated',
  BILLING_INFO_UPDATED: 'billing_info.updated',
  MEMBER_INVITED: 'member.invited',
  MEMBER_REMOVED: 'member.removed',
  OA_CONNECTED: 'oa.connected',
  OA_DISCONNECTED: 'oa.disconnected',
  TEMPLATE_SUBMITTED: 'template.submitted',
  TEMPLATE_APPROVED: 'template.approved',
  TEMPLATE_REJECTED: 'template.rejected',
  API_KEY_CREATED: 'api_key.created',
  API_KEY_DISABLED: 'api_key.disabled',
  API_KEY_REGENERATED: 'api_key.regenerated',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export const AUDIT_RESOURCE_TYPES = {
  WORKSPACE: 'Workspace',
  WORKSPACE_BILLING_PROFILE: 'WorkspaceBillingProfile',
  WORKSPACE_INVITATION: 'WorkspaceInvitation',
  WORKSPACE_MEMBER: 'WorkspaceMember',
  WORKSPACE_OA_CONNECTION: 'WorkspaceOaConnection',
  TEMPLATE: 'Template',
  API_KEY: 'ApiKey',
} as const;

export type AuditResourceType =
  (typeof AUDIT_RESOURCE_TYPES)[keyof typeof AUDIT_RESOURCE_TYPES];
