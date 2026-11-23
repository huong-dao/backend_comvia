import { MessagingService } from './messaging.service';

function build(opts: { oaStatus?: string; dispatch?: jest.Mock } = {}) {
  const messageLog = { create: jest.fn().mockResolvedValue({ id: 'log-1' }) };
  const prisma = {
    template: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'tpl-1',
        type: 'TEXT',
        placeholdersJson: [],
        oaConnectionId: 'oa-1',
        status: 'APPROVED',
        providerTemplateId: 'provider-1',
        unitPricePerMessage: 400,
        ctaButtons: [],
      }),
    },
    workspaceOaConnection: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ status: opts.oaStatus ?? 'CONNECTED' }),
    },
    workspace: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'ws-1',
        ownerUserId: 'owner-1',
        status: 'ACTIVE',
      }),
    },
    walletAccount: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ ownerUserId: 'owner-1', balance: 1_000 }),
    },
    messageLog,
  };
  const oaMessaging = { dispatchZnsTemplate: opts.dispatch ?? jest.fn() };
  const service = new MessagingService(
    prisma as never,
    oaMessaging as never,
    { resolveTemplateUnitPrice: jest.fn().mockResolvedValue(400) } as never,
    {} as never,
    { assertCanSend: jest.fn() } as never,
  );
  return { service, prisma, oaMessaging };
}

const dto = { templateId: 'tpl-1', phoneNumber: '0900000000', data: {} };

describe('MessagingService.sendSingle failure logging', () => {
  it('logs a FAILED MessageLog with reason and time when the OA is not connected', async () => {
    const { service, prisma, oaMessaging } = build({
      oaStatus: 'NOT_CONNECTED',
    });

    await expect(
      service.sendSingle('ws-1', 'user-1', dto),
    ).rejects.toMatchObject({
      response: { code: 'OA_NOT_CONNECTED', messageLogId: 'log-1' },
    });

    expect(oaMessaging.dispatchZnsTemplate).not.toHaveBeenCalled();
    expect(prisma.messageLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: 'ws-1',
        templateId: 'tpl-1',
        phoneNumber: '0900000000',
        status: 'FAILED',
        errorCode: expect.stringMatching(/^OA_NOT_CONNECTED: /),
        sentAt: expect.any(Date),
        operatorUserId: 'user-1',
      }),
    });
  });

  it('logs the template as not approved when it exists but is not approved', async () => {
    const { service, prisma } = build();
    prisma.template.findFirst.mockResolvedValue({
      id: 'tpl-1',
      type: 'TEXT',
      oaConnectionId: 'oa-1',
      status: 'PENDING',
      providerTemplateId: null,
      unitPricePerMessage: null,
      ctaButtons: [],
    });

    await expect(
      service.sendSingle('ws-1', 'user-1', dto),
    ).rejects.toBeDefined();

    expect(prisma.messageLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'FAILED',
        errorCode: expect.stringMatching(/^TEMPLATE_NOT_APPROVED: /),
      }),
    });
  });

  it('logs the insufficient-credit rejection', async () => {
    const { service, prisma } = build();
    prisma.walletAccount.findUnique.mockResolvedValue({
      ownerUserId: 'owner-1',
      balance: 10,
    });

    await expect(
      service.sendSingle('ws-1', 'user-1', dto),
    ).rejects.toBeDefined();

    expect(prisma.messageLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        errorCode: expect.stringMatching(/^INSUFFICIENT_CREDIT: /),
        sentAt: expect.any(Date),
      }),
    });
  });

  it('logs Zalo dispatch failures with the raw provider text and time', async () => {
    const dispatch = jest.fn().mockRejectedValue(new Error('socket hang up'));
    const { service, prisma } = build({ dispatch });

    await expect(
      service.sendSingle('ws-1', 'user-1', dto),
    ).rejects.toMatchObject({
      response: { code: 'SEND_FAILED', messageLogId: 'log-1' },
    });

    expect(prisma.messageLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'FAILED',
        errorCode: 'SEND_FAILED: socket hang up',
        sentAt: expect.any(Date),
      }),
    });
  });

  it('cannot log when the template does not exist (no FK target) but still rejects', async () => {
    const { service, prisma } = build();
    prisma.template.findFirst.mockResolvedValue(null);

    await expect(
      service.sendSingle('ws-1', 'user-1', dto),
    ).rejects.toMatchObject({
      response: { code: 'TEMPLATE_NOT_APPROVED' },
    });
    expect(prisma.messageLog.create).not.toHaveBeenCalled();
  });
});
