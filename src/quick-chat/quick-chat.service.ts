import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CreateQuickChatSessionDto } from './dto/create-session.dto';
import { SendQuickChatMessageDto } from './dto/send-message.dto';
import { UpsertQuickChatAgentProfileDto } from './dto/upsert-agent-profile.dto';
import { PrismaService } from '../prisma/prisma.service';
import { QuickChatOrchestratorService } from './quick-chat-orchestrator.service';
import { QuickChatToolRegistryService } from './quick-chat-tool-registry.service';
import { QuickChatToolExecutorService } from './quick-chat-tool-executor.service';
import {
  QuickChatAgentProfile,
  QuickChatAction,
  QuickChatRole,
  QuickChatSession,
  QuickChatToolName,
} from './quick-chat.types';

@Injectable()
export class QuickChatService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly orchestrator: QuickChatOrchestratorService,
    private readonly toolExecutor: QuickChatToolExecutorService,
    private readonly toolRegistry: QuickChatToolRegistryService,
  ) {}

  createSession(
    workspaceId: string | undefined,
    userId: string,
    dto: CreateQuickChatSessionDto,
  ): Promise<QuickChatSession> {
    return this.createSessionInternal(workspaceId, userId, dto);
  }

  private async createSessionInternal(
    workspaceId: string | undefined,
    userId: string,
    dto: CreateQuickChatSessionDto,
  ) {
    await this.ensureDefaultAgentExists();
    const agentId = dto.agentId ?? 'default-agent';
    const agent = await this.prismaService.quickChatAgentProfile.findUnique({
      where: { id: agentId },
    });
    if (!agent || !agent.active) {
      throw new BadRequestException('Agent not found or inactive');
    }

    const created = await this.prismaService.quickChatSession.create({
      data: {
        workspaceId: workspaceId ?? null,
        userId,
        title: dto.title,
        agentId: agent.id,
      },
      include: { messages: true, actions: true },
    });

    return this.mapSession(created);
  }

  async getSession(
    workspaceId: string | undefined,
    userId: string,
    sessionId: string,
  ) {
    const session = await this.getScopedSession(workspaceId, userId, sessionId);
    return this.mapSession(session);
  }

  async sendMessage(
    workspaceId: string | undefined,
    userId: string,
    role: QuickChatRole,
    sessionId: string,
    dto: SendQuickChatMessageDto,
  ) {
    const session = await this.getScopedSession(workspaceId, userId, sessionId);
    await this.prismaService.quickChatMessage.create({
      data: {
        sessionId: session.id,
        userId,
        role: 'USER',
        content: dto.message,
      },
    });

    const orchestration = this.orchestrator.orchestrate({
      message: dto.message,
      role,
      toolInput: dto.toolInput,
    });
    await this.prismaService.quickChatMessage.create({
      data: {
        sessionId: session.id,
        userId,
        role: 'ASSISTANT',
        content: orchestration.assistantMessage,
      },
    });
    const agent = await this.prismaService.quickChatAgentProfile.findUnique({
      where: { id: session.agentId },
    });

    if (orchestration.executeNow) {
      this.ensureToolAllowed(agent, orchestration.executeNow.toolName);
      const startedAt = Date.now();
      const idempotencyKey = `exec_${session.id}_${Date.now()}`;
      try {
        const result = await this.toolExecutor.execute({
          toolName: orchestration.executeNow.toolName,
          workspaceId,
          userId,
          role,
          args: orchestration.executeNow.args,
        });
        await this.prismaService.quickChatExecutionLog.create({
          data: {
            sessionId: session.id,
            userId,
            toolName: orchestration.executeNow.toolName,
            inputJson: orchestration.executeNow.args as Prisma.InputJsonValue,
            outputJson: result as Prisma.InputJsonValue,
            durationMs: Date.now() - startedAt,
            idempotencyKey,
          },
        });
        return { sessionId: session.id, plan: orchestration.plan, result };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Execution failed';
        await this.prismaService.quickChatExecutionLog.create({
          data: {
            sessionId: session.id,
            userId,
            toolName: orchestration.executeNow.toolName,
            inputJson: orchestration.executeNow.args as Prisma.InputJsonValue,
            errorMessage: message,
            durationMs: Date.now() - startedAt,
            idempotencyKey,
          },
        });
        throw error;
      }
    }

    if (
      orchestration.plan?.toolName &&
      orchestration.plan.requiresConfirmation &&
      orchestration.plan.args
    ) {
      this.ensureToolAllowed(agent, orchestration.plan.toolName);
      const action = await this.prismaService.quickChatAction.create({
        data: {
          sessionId: session.id,
          userId,
          toolName: orchestration.plan.toolName,
          argsJson: orchestration.plan.args as Prisma.InputJsonValue,
          summary: orchestration.assistantMessage,
          status: 'PENDING_CONFIRMATION',
        },
      });
      return {
        sessionId: session.id,
        plan: orchestration.plan,
        pendingAction: this.mapAction(action),
      };
    }

    return { sessionId: session.id, plan: orchestration.plan };
  }

  async confirmAction(
    workspaceId: string | undefined,
    userId: string,
    role: QuickChatRole,
    sessionId: string,
    actionId: string,
  ) {
    const session = await this.getScopedSession(workspaceId, userId, sessionId);
    const action = await this.prismaService.quickChatAction.findFirst({
      where: { id: actionId, sessionId: session.id },
    });
    if (!action) {
      throw new NotFoundException('Action not found');
    }
    if (action.status !== 'PENDING_CONFIRMATION') {
      throw new BadRequestException('Action is already processed');
    }

    const startedAt = Date.now();
    const idempotencyKey = `action_${action.id}`;
    try {
      const result = await this.toolExecutor.execute({
        toolName: action.toolName,
        workspaceId,
        userId,
        role,
        args: (action.argsJson as Record<string, unknown>) ?? {},
      });

      await this.prismaService.$transaction(async (tx) => {
        await tx.quickChatAction.update({
          where: { id: action.id },
          data: { status: 'EXECUTED', executedAt: new Date() },
        });
        await tx.quickChatExecutionLog.create({
          data: {
            sessionId: session.id,
            actionId: action.id,
            userId,
            toolName: action.toolName,
            inputJson: this.toInputJson(action.argsJson),
            outputJson: result as Prisma.InputJsonValue,
            durationMs: Date.now() - startedAt,
            idempotencyKey,
          },
        });
        await tx.quickChatMessage.create({
          data: {
            sessionId: session.id,
            userId,
            role: 'ASSISTANT',
            content: `Da thuc thi thanh cong tool ${action.toolName}.`,
          },
        });
      });

      return { sessionId: session.id, actionId: action.id, result };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Execution failed';
      await this.prismaService.quickChatExecutionLog.create({
        data: {
          sessionId: session.id,
          actionId: action.id,
          userId,
          toolName: action.toolName,
          inputJson: this.toInputJson(action.argsJson),
          errorMessage: message,
          durationMs: Date.now() - startedAt,
          idempotencyKey,
        },
      });
      throw error;
    }
  }

  private async getScopedSession(
    workspaceId: string | undefined,
    userId: string,
    sessionId: string,
  ) {
    const session = await this.prismaService.quickChatSession.findUnique({
      where: { id: sessionId },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        actions: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!session) {
      throw new NotFoundException('Session not found');
    }
    const scopedWorkspace = workspaceId ?? null;
    if (session.workspaceId !== scopedWorkspace || session.userId !== userId) {
      throw new NotFoundException('Session not found');
    }
    return session;
  }

  async listAgents() {
    await this.ensureDefaultAgentExists();
    const agents = await this.prismaService.quickChatAgentProfile.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return agents.map((item) => this.mapAgent(item));
  }

  listAllToolNames() {
    return [
      'wallet.getBalance',
      'templates.list',
      'members.list',
      'topups.createQr',
      'templates.create',
      'messaging.sendSingle',
      ...this.toolRegistry.listToolNames(),
    ];
  }

  async upsertAgent(agentId: string, dto: UpsertQuickChatAgentProfileDto) {
    const profile = await this.prismaService.quickChatAgentProfile.upsert({
      where: { id: agentId },
      update: {
        name: dto.name,
        provider: dto.provider,
        systemPrompt: dto.systemPrompt,
        allowedTools: dto.allowedTools as Prisma.InputJsonValue,
        skills: (dto.skills ?? []) as Prisma.InputJsonValue,
        active: dto.active ?? true,
      },
      create: {
        id: agentId,
        name: dto.name,
        provider: dto.provider,
        systemPrompt: dto.systemPrompt,
        allowedTools: dto.allowedTools as Prisma.InputJsonValue,
        skills: (dto.skills ?? []) as Prisma.InputJsonValue,
        active: dto.active ?? true,
      },
    });

    return this.mapAgent(profile);
  }

  private ensureToolAllowed(
    agent: {
      allowedTools: Prisma.JsonValue;
    } | null,
    toolName: QuickChatToolName,
  ) {
    const allowedTools = this.readStringArray(agent?.allowedTools);
    if (
      !agent ||
      (!allowedTools.includes('*') && !allowedTools.includes(toolName))
    ) {
      throw new BadRequestException(
        'Tool is not allowed by current agent policy',
      );
    }
  }

  private async ensureDefaultAgentExists() {
    await this.prismaService.quickChatAgentProfile.upsert({
      where: { id: 'default-agent' },
      update: {},
      create: {
        id: 'default-agent',
        name: 'John',
        provider: 'openai',
        systemPrompt:
          'You are a workspace operations assistant. Follow workspace rules and never bypass confirmation for write actions.',
        allowedTools: ['*'],
        skills: ['workspace-ops', 'billing-safety'],
        active: true,
      },
    });
  }

  private mapSession(session: {
    id: string;
    workspaceId: string | null;
    userId: string;
    title: string | null;
    createdAt: Date;
    updatedAt: Date;
    agentId: string;
    messages: Array<{
      id: string;
      role: 'USER' | 'ASSISTANT';
      content: string;
      createdAt: Date;
    }>;
    actions: Array<{
      id: string;
      toolName: string;
      argsJson: Prisma.JsonValue;
      summary: string;
      status: 'PENDING_CONFIRMATION' | 'EXECUTED' | 'CANCELLED' | 'REJECTED';
      createdAt: Date;
      executedAt: Date | null;
    }>;
  }): QuickChatSession {
    return {
      id: session.id,
      workspaceId: session.workspaceId ?? undefined,
      userId: session.userId,
      title: session.title ?? undefined,
      agentId: session.agentId,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
      messages: session.messages.map((item) => ({
        id: item.id,
        role: item.role === 'USER' ? 'user' : 'assistant',
        content: item.content,
        createdAt: item.createdAt.toISOString(),
      })),
      actions: session.actions.map((item) => this.mapAction(item)),
    };
  }

  private mapAction(action: {
    id: string;
    toolName: string;
    argsJson: Prisma.JsonValue;
    summary: string;
    status: 'PENDING_CONFIRMATION' | 'EXECUTED' | 'CANCELLED' | 'REJECTED';
    createdAt: Date;
    executedAt: Date | null;
  }): QuickChatAction {
    return {
      id: action.id,
      toolName: action.toolName,
      args: (action.argsJson as Record<string, unknown>) ?? {},
      summary: action.summary,
      status: this.mapActionStatus(action.status),
      createdAt: action.createdAt.toISOString(),
      executedAt: action.executedAt?.toISOString(),
    };
  }

  private mapActionStatus(
    status: 'PENDING_CONFIRMATION' | 'EXECUTED' | 'CANCELLED' | 'REJECTED',
  ): QuickChatAction['status'] {
    if (status === 'PENDING_CONFIRMATION') return 'pending_confirmation';
    if (status === 'EXECUTED') return 'executed';
    return 'cancelled';
  }

  private mapAgent(agent: {
    id: string;
    name: string;
    provider: string;
    systemPrompt: string;
    allowedTools: Prisma.JsonValue;
    skills: Prisma.JsonValue;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): QuickChatAgentProfile {
    return {
      id: agent.id,
      name: agent.name,
      provider: this.mapProvider(agent.provider),
      systemPrompt: agent.systemPrompt,
      allowedTools: this.readStringArray(agent.allowedTools),
      skills: this.readStringArray(agent.skills),
      active: agent.active,
      createdAt: agent.createdAt.toISOString(),
      updatedAt: agent.updatedAt.toISOString(),
    };
  }

  private mapProvider(provider: string): QuickChatAgentProfile['provider'] {
    if (provider === 'gemini' || provider === 'claude') return provider;
    return 'openai';
  }

  private readStringArray(value: Prisma.JsonValue | undefined): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === 'string');
  }

  private toInputJson(value: Prisma.JsonValue): Prisma.InputJsonValue {
    if (value === null) {
      return {} as Prisma.InputJsonValue;
    }
    return value as Prisma.InputJsonValue;
  }
}
