import { BadRequestException } from '@nestjs/common';
import { PublicApiService } from './public-api.service';

describe('PublicApiService.sendSingle pricing', () => {
  it('uses template price plus CTA prices instead of a fixed public-send price', async () => {
    const tx = {
      messageLog: { create: jest.fn().mockResolvedValue({ id: 'log-1' }) },
    };
    const prisma = {
      template: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'template-1',
          type: 'TEXT',
          workspaceId: 'workspace-1',
          status: 'APPROVED',
          oaConnectionId: 'oa-1',
          content: 'content',
          providerTemplateId: 'provider-1',
          unitPricePerMessage: 400,
          ctaButtons: [
            { unitPrice: 100, defaultUnitPrice: 0 },
            { unitPrice: null, defaultUnitPrice: 50 },
          ],
        }),
      },
      workspaceOaConnection: {
        findUnique: jest.fn().mockResolvedValue({ status: 'CONNECTED' }),
      },
      workspace: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'workspace-1',
          status: 'ACTIVE',
          ownerUserId: 'owner-1',
        }),
      },
      walletAccount: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ ownerUserId: 'owner-1', balance: 1_000 }),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const ledger = { debit: jest.fn().mockResolvedValue('wallet-tx-1') };
    const service = new PublicApiService(
      prisma as never,
      {
        dispatchZnsTemplate: jest
          .fn()
          .mockResolvedValue({ providerMessageId: 'provider-msg-1' }),
      } as never,
      ledger as never,
      { resolveTemplateUnitPrice: jest.fn().mockResolvedValue(400) } as never,
      { assertCanSend: jest.fn().mockResolvedValue(undefined) } as never,
    );

    await service.sendSingle(
      { workspaceId: 'workspace-1' },
      { templateId: 'template-1', phoneNumber: '0900000000', data: {} },
    );

    expect(ledger.debit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ amount: 550 }),
    );
    expect(tx.messageLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ costAtTime: 550 }),
      }),
    );
  });
});

describe('PublicApiService.sendSingle failure logging', () => {
  function build(oaStatus = 'CONNECTED', dispatch = jest.fn()) {
    const messageLog = {
      create: jest.fn().mockResolvedValue({ id: 'log-1' }),
    };
    const prisma = {
      template: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'template-1',
          type: 'TEXT',
          workspaceId: 'workspace-1',
          status: 'APPROVED',
          oaConnectionId: 'oa-1',
          content: 'content',
          providerTemplateId: 'provider-1',
          unitPricePerMessage: 400,
          ctaButtons: [],
        }),
      },
      workspaceOaConnection: {
        findUnique: jest.fn().mockResolvedValue({ status: oaStatus }),
      },
      workspace: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'workspace-1',
          status: 'ACTIVE',
          ownerUserId: 'owner-1',
        }),
      },
      walletAccount: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ ownerUserId: 'owner-1', balance: 1_000 }),
      },
      messageLog,
    };
    const service = new PublicApiService(
      prisma as never,
      { dispatchZnsTemplate: dispatch } as never,
      {} as never,
      { resolveTemplateUnitPrice: jest.fn().mockResolvedValue(400) } as never,
      { assertCanSend: jest.fn() } as never,
    );
    return { service, prisma };
  }

  const request = {
    templateId: 'template-1',
    phoneNumber: '0900000000',
    data: {},
  };

  it('logs a FAILED MessageLog with reason and time when the OA is not connected', async () => {
    const { service, prisma } = build('NOT_CONNECTED');

    await expect(
      service.sendSingle({ workspaceId: 'workspace-1' }, request),
    ).rejects.toMatchObject({
      response: {
        message: 'OA is not connected',
        code: 'OA_NOT_CONNECTED',
        messageLogId: 'log-1',
      },
    });

    expect(prisma.messageLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'FAILED',
        sendType: 'SINGLE',
        errorCode: expect.stringMatching(/^OA_NOT_CONNECTED: /),
        sentAt: expect.any(Date),
        operatorUserId: null,
      }),
    });
  });

  it('logs dispatch failures with the reason and time', async () => {
    const { service, prisma } = build(
      'CONNECTED',
      jest.fn().mockRejectedValue(new Error('socket hang up')),
    );

    await expect(
      service.sendSingle({ workspaceId: 'workspace-1' }, request),
    ).rejects.toMatchObject({
      response: { message: 'socket hang up', messageLogId: 'log-1' },
    });

    expect(prisma.messageLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        errorCode: 'SEND_FAILED: socket hang up',
        sentAt: expect.any(Date),
      }),
    });
  });
});

describe('PublicApiService workspace status', () => {
  it('does not expose templates from a disabled workspace', async () => {
    const prisma = {
      workspace: {
        findUnique: jest.fn().mockResolvedValue({ status: 'DISABLED' }),
      },
      template: { findMany: jest.fn() },
    };
    const service = new PublicApiService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.listApprovedTemplates({ workspaceId: 'workspace-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.template.findMany).not.toHaveBeenCalled();
  });
});

describe('PublicApiService template read APIs', () => {
  const activeWorkspace = {
    workspace: {
      findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE' }),
    },
  };

  it('lists only APPROVED templates of the key workspace', async () => {
    const prisma = {
      ...activeWorkspace,
      template: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new PublicApiService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.listApprovedTemplates({ workspaceId: 'workspace-1' });

    expect(prisma.template.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: 'workspace-1', status: 'APPROVED' },
      }),
    );
  });

  it('scopes detail lookup by id or code, workspace and APPROVED', async () => {
    const prisma = {
      ...activeWorkspace,
      template: {
        findFirst: jest.fn().mockResolvedValue({ id: 'template-1' }),
      },
    };
    const service = new PublicApiService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.getApprovedTemplate(
      { workspaceId: 'workspace-1' },
      '123456',
    );

    expect(prisma.template.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [{ id: '123456' }, { code: '123456' }],
          workspaceId: 'workspace-1',
          status: 'APPROVED',
        },
      }),
    );
  });

  it('rejects detail of a missing or non-approved template', async () => {
    const prisma = {
      ...activeWorkspace,
      template: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new PublicApiService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.getApprovedTemplate({ workspaceId: 'workspace-1' }, 'nope'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('PublicApiService.sendSingle subscription gate', () => {
  it('rejects before touching the wallet when the subscription is not valid', async () => {
    const prisma = {
      template: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'template-1',
          type: 'TEXT',
          workspaceId: 'workspace-1',
          status: 'APPROVED',
          oaConnectionId: 'oa-1',
          content: 'content',
          providerTemplateId: 'provider-1',
          unitPricePerMessage: 400,
          ctaButtons: [],
        }),
      },
      workspaceOaConnection: {
        findUnique: jest.fn().mockResolvedValue({ status: 'CONNECTED' }),
      },
      workspace: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'workspace-1',
          status: 'ACTIVE',
          ownerUserId: 'owner-1',
        }),
      },
      walletAccount: { findUnique: jest.fn() },
    };
    const gate = new BadRequestException({ code: 'SUBSCRIPTION_EXPIRED' });
    const service = new PublicApiService(
      prisma as never,
      { dispatchZnsTemplate: jest.fn() } as never,
      {} as never,
      { resolveTemplateUnitPrice: jest.fn().mockResolvedValue(400) } as never,
      { assertCanSend: jest.fn().mockRejectedValue(gate) } as never,
    );

    await expect(
      service.sendSingle(
        { workspaceId: 'workspace-1' },
        { templateId: 'template-1', phoneNumber: '0900000000', data: {} },
      ),
    ).rejects.toBe(gate);
    expect(prisma.walletAccount.findUnique).not.toHaveBeenCalled();
  });
});
