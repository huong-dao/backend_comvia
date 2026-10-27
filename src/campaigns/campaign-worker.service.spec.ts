import { CampaignWorkerService } from './campaign-worker.service';

describe('CampaignWorkerService', () => {
  afterEach(() => jest.useRealTimers());

  it('recovers uncertain dispatches before processing queued runs', async () => {
    jest.useFakeTimers();
    const campaigns = {
      recoverInFlightCampaignRows: jest.fn().mockResolvedValue(undefined),
      processQueuedCampaignRuns: jest.fn().mockResolvedValue(undefined),
    };
    const worker = new CampaignWorkerService(campaigns as never);

    await worker.onModuleInit();

    expect(campaigns.recoverInFlightCampaignRows).toHaveBeenCalledTimes(1);
    expect(campaigns.processQueuedCampaignRuns).toHaveBeenCalledTimes(1);
    worker.onModuleDestroy();
  });
});
