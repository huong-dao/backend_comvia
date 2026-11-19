import { BadRequestException } from '@nestjs/common';
import { OaUnavailableException } from '../oa/oa-unavailable.exception';
import {
  sendErrorBody,
  SEND_ERROR_CODES,
} from '../messaging/send-error-messages';
import { CampaignsService } from './campaigns.service';

const RUN = {
  id: 'run-1',
  campaignId: 'camp-1',
  status: 'RUNNING',
  unitPrice: 300,
  operatorUserId: 'user-1',
};
const ROW = {
  id: 'row-1',
  phoneNumber: '0900000000',
  payloadData: {},
  retryCount: 0,
};
const CAMPAIGN = {
  id: 'camp-1',
  workspaceId: 'ws-1',
  oaConnectionId: 'oa-1',
  templateId: 'tpl-1',
  status: 'RUNNING',
  pauseReason: null,
  template: { providerTemplateId: 'zns-1' },
  workspace: { ownerUserId: 'owner-1', status: 'ACTIVE' },
};

function build(opts: {
  oaStatus?: string;
  dispatch?: jest.Mock;
  campaign?: Record<string, unknown>;
  pendingRunId?: string | null;
}) {
  const campaignRow = {
    findFirst: jest
      .fn()
      .mockResolvedValue(
        opts.pendingRunId === undefined
          ? ROW
          : opts.pendingRunId
            ? { campaignRunId: opts.pendingRunId }
            : null,
      ),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    update: jest.fn().mockResolvedValue({}),
    groupBy: jest.fn().mockResolvedValue([]),
  };
  const campaignRun = {
    findUnique: jest.fn().mockResolvedValue(RUN),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  };
  const campaign = {
    findUnique: jest.fn().mockResolvedValue({
      ...CAMPAIGN,
      unitPriceAtCreate: 300,
      ...opts.campaign,
    }),
    findFirst: jest.fn().mockResolvedValue({ ...CAMPAIGN, ...opts.campaign }),
    update: jest.fn().mockResolvedValue({}),
  };
  const messageLog = { create: jest.fn() };
  const tx = { campaignRun, campaign };
  const prisma = {
    campaignRow,
    campaignRun,
    campaign,
    messageLog,
    workspaceOaConnection: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ status: opts.oaStatus ?? 'CONNECTED' }),
    },
    $transaction: jest.fn(async (arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (t: unknown) => unknown)(tx)
        : Promise.all(arg as Promise<unknown>[]),
    ),
  };
  const oaMessaging = { dispatchZnsTemplate: opts.dispatch ?? jest.fn() };
  const service = new CampaignsService(
    prisma as never,
    {} as never,
    oaMessaging as never,
    {} as never,
  );
  return { service, prisma, oaMessaging };
}

describe('CampaignsService OA-unavailable handling', () => {
  it('pauses before claiming any row when the OA is not connected', async () => {
    const { service, prisma, oaMessaging } = build({
      oaStatus: 'TOKEN_EXPIRED',
    });

    await (service as any).processCampaignRun('run-1');

    expect(prisma.campaignRow.updateMany).not.toHaveBeenCalled();
    expect(oaMessaging.dispatchZnsTemplate).not.toHaveBeenCalled();
    expect(prisma.messageLog.create).not.toHaveBeenCalled();
    expect(prisma.campaignRun.updateMany).toHaveBeenCalledWith({
      where: { id: 'run-1', status: 'RUNNING' },
      data: { status: 'PAUSED' },
    });
    expect(prisma.campaign.update).toHaveBeenCalledWith({
      where: { id: 'camp-1' },
      data: { status: 'PAUSED', pauseReason: 'OA_DISCONNECTED' },
    });
  });

  it('returns the row to PENDING without a MessageLog when the OA fails mid-send', async () => {
    const dispatch = jest
      .fn()
      .mockRejectedValue(
        new OaUnavailableException(
          sendErrorBody(SEND_ERROR_CODES.OA_TOKEN_EXPIRED),
        ),
      );
    const { service, prisma } = build({ dispatch });

    await (service as any).processCampaignRun('run-1');

    expect(prisma.messageLog.create).not.toHaveBeenCalled();
    expect(prisma.campaignRow.update).toHaveBeenCalledWith({
      where: { id: 'row-1' },
      data: { status: 'PENDING', dispatchStartedAt: null },
    });
    expect(prisma.campaign.update).toHaveBeenCalledWith({
      where: { id: 'camp-1' },
      data: { status: 'PAUSED', pauseReason: 'OA_DISCONNECTED' },
    });
  });

  it('still treats other dispatch errors as needing reconciliation', async () => {
    const dispatch = jest.fn().mockRejectedValue(new Error('socket hang up'));
    const { service, prisma } = build({ dispatch });
    prisma.messageLog.create.mockResolvedValue({ id: 'log-1' });

    await (service as any).processCampaignRun('run-1');

    expect(prisma.messageLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PENDING' }),
      }),
    );
    expect(prisma.campaignRow.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'RECONCILIATION_REQUIRED' }),
      }),
    );
  });

  describe('resume', () => {
    const paused = { status: 'PAUSED', pauseReason: 'OA_DISCONNECTED' };

    it('rejects a campaign that was not paused by the OA', async () => {
      const { service } = build({
        campaign: { status: 'PAUSED', pauseReason: null },
      });
      await expect(service.resume('ws-1', 'camp-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects while the OA is still disconnected', async () => {
      const { service, prisma } = build({
        campaign: paused,
        oaStatus: 'DISCONNECTED',
        pendingRunId: 'run-1',
      });
      await expect(service.resume('ws-1', 'camp-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.campaignRun.updateMany).not.toHaveBeenCalled();
    });

    it('resumes the original run without charging the wallet again', async () => {
      const { service, prisma } = build({
        campaign: paused,
        pendingRunId: 'run-1',
      });

      const result = await service.resume('ws-1', 'camp-1');

      expect(result).toEqual({
        campaignId: 'camp-1',
        status: 'RUNNING',
        runId: 'run-1',
      });
      expect(prisma.campaignRun.updateMany).toHaveBeenCalledWith({
        where: { id: 'run-1', status: 'PAUSED' },
        data: { status: 'RUNNING' },
      });
      expect(prisma.campaign.update).toHaveBeenCalledWith({
        where: { id: 'camp-1' },
        data: { status: 'RUNNING', pauseReason: null },
      });
    });

    it('execute() delegates to resume instead of creating a second hold', async () => {
      const { service, prisma } = build({
        campaign: paused,
        pendingRunId: 'run-1',
      });

      const result = await service.execute('ws-1', 'camp-1', 'user-1');

      expect(result).toMatchObject({ runId: 'run-1', status: 'RUNNING' });
      expect(prisma.campaignRun.updateMany).toHaveBeenCalledTimes(1);
    });

    it('retry() is refused while the campaign is OA-paused', async () => {
      const { service } = build({ campaign: paused });
      await expect(
        service.retry('ws-1', 'camp-1', 'user-1', { rowIds: ['row-1'] }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
