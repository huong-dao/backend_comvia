export type QuickChatIntent =
  | 'GET_WALLET_BALANCE'
  | 'LIST_TEMPLATES'
  | 'LIST_MEMBERS'
  | 'CREATE_TOPUP_QR'
  | 'CREATE_TEMPLATE'
  | 'SEND_SINGLE_MESSAGE'
  | 'UNKNOWN';

export type QuickChatToolName =
  | 'wallet.getBalance'
  | 'templates.list'
  | 'members.list'
  | 'topups.createQr'
  | 'templates.create'
  | 'messaging.sendSingle'
  | string;

export type QuickChatRole = 'OWNER' | 'MEMBER' | 'STAFF' | 'ADMIN';

export type QuickChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
};

export type QuickChatActionStatus =
  | 'pending_confirmation'
  | 'executed'
  | 'cancelled';

export type QuickChatAction = {
  id: string;
  toolName: QuickChatToolName;
  args: Record<string, unknown>;
  summary: string;
  status: QuickChatActionStatus;
  createdAt: string;
  executedAt?: string;
};

export type QuickChatSession = {
  id: string;
  workspaceId?: string;
  userId: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
  agentId: string;
  messages: QuickChatMessage[];
  actions: QuickChatAction[];
};

export type QuickChatAgentProfile = {
  id: string;
  name: string;
  provider: 'openai' | 'gemini' | 'claude';
  systemPrompt: string;
  allowedTools: QuickChatToolName[];
  skills: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type OrchestratedResult = {
  assistantMessage: string;
  plan?: {
    intent: QuickChatIntent;
    toolName?: QuickChatToolName;
    requiresConfirmation: boolean;
    missingFields?: string[];
    args?: Record<string, unknown>;
  };
  executeNow?: {
    toolName: QuickChatToolName;
    args: Record<string, unknown>;
  };
};
