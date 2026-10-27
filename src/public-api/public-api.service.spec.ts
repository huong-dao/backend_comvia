import { PublicApiService } from './public-api.service';

describe('PublicApiService.sendSingle pricing', () => {
  it('uses template price plus CTA prices instead of a fixed public-send price', async () => {
    const tx = { messageLog: { create: jest.fn().mockResolvedValue({ id: 'log-1' }) } };
    const prisma = {
      template: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'template-1', type: 'TEXT', workspaceId: 'workspace-1', status: 'APPROVED',
          oaConnectionId: 'oa-1', content: 'content', providerTemplateId: 'provider-1',
          unitPricePerMessage: 400, ctaButtons: [{ unitPrice: 100, defaultUnitPrice: 0 }, { unitPrice: null, defaultUnitPrice: 50 }],
        }),
      },
      workspaceOaConnection: { findUnique: jest.fn().mockResolvedValue({ status: 'CONNECTED' }) },
      workspace: { findUnique: jest.fn().mockResolvedValue({ id: 'workspace-1', status: 'ACTIVE', ownerUserId: 'owner-1' }) },
      walletAccount: { findUnique: jest.fn().mockResolvedValue({ ownerUserId: 'owner-1', balance: 1_000 }) },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const ledger = { debit: jest.fn().mockResolvedValue('wallet-tx-1') };
    const service = new PublicApiService(
      prisma as never,
      { dispatchZnsTemplate: jest.fn().mockResolvedValue({ providerMessageId: 'provider-msg-1' }) } as never,
      ledger as never,
      { resolveTemplateUnitPrice: jest.fn().mockResolvedValue(400) } as never,
    );

    await service.sendSingle({ workspaceId: 'workspace-1' }, { templateId: 'template-1', phoneNumber: '0900000000', data: {} });

    expect(ledger.debit).toHaveBeenCalledWith(tx, expect.objectContaining({ amount: 550 }));
    expect(tx.messageLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ costAtTime: 550 }) }));
  });
});
