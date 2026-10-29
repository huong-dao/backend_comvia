export const AUDIT_ACTIONS = {
  WORKSPACE_CREATED: 'workspace.created',
  WORKSPACE_UPDATED: 'workspace.updated',
  BILLING_INFO_UPDATED: 'billing_info.updated',
  MEMBER_INVITED: 'member.invited',
  MEMBER_REMOVED: 'member.removed',
  OA_CREATED: 'oa.created',
  OA_UPDATED: 'oa.updated',
  OA_CONNECTED: 'oa.connected',
  OA_DISCONNECTED: 'oa.disconnected',
  TEMPLATE_SUBMITTED: 'template.submitted',
  TEMPLATE_APPROVED: 'template.approved',
  TEMPLATE_RETURNED_FOR_REVISION: 'template.returned_for_revision',
  TEMPLATE_ADMIN_OVERRIDDEN: 'template.admin_overridden',
  API_KEY_CREATED: 'api_key.created',
  API_KEY_DISABLED: 'api_key.disabled',
  API_KEY_REGENERATED: 'api_key.regenerated',
  TOPUP_PAID: 'topup.paid',
  TOPUP_FAILED: 'topup.failed',
  WORKSPACE_IMPERSONATED: 'workspace.admin_impersonated',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export const AUDIT_RESOURCE_TYPES = {
  WORKSPACE: 'Workspace',
  WORKSPACE_BILLING_PROFILE: 'WorkspaceBillingProfile',
  WORKSPACE_INVITATION: 'WorkspaceInvitation',
  WORKSPACE_MEMBER: 'WorkspaceMember',
  WORKSPACE_OA: 'WorkspaceOa',
  WORKSPACE_OA_CONNECTION: 'WorkspaceOaConnection',
  TEMPLATE: 'Template',
  API_KEY: 'ApiKey',
  TOPUP_REQUEST: 'TopupRequest',
} as const;

export type AuditResourceType =
  (typeof AUDIT_RESOURCE_TYPES)[keyof typeof AUDIT_RESOURCE_TYPES];
