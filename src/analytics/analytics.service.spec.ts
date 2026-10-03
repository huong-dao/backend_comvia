import { MessageStatus, TemplateStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService } from './analytics.service';
import { AnalyticsPeriod } from './dto/analytics-overview-query.dto';

type CountArgs = { where: Record<string, unknown> };

describe('AnalyticsService', () => {
  const messageLogCount = jest.fn<Promise<number>, [CountArgs]>();
  const templateCount = jest.fn<Promise<number>, [CountArgs]>();

  const prisma = {
    messageLog: { count: messageLogCount },
    template: { count: templateCount },
  } as unknown as PrismaService;

  const service = new AnalyticsService(prisma);

  beforeEach(() => {
    messageLogCount.mockReset();
    templateCount.mockReset();
  });

  describe('computePeriodRange (timezone Asia/Ho_Chi_Minh)', () => {
    // now = 2026-03-15T05:00:00Z = 2026-03-15 12:00 giờ VN
    const now = new Date('2026-03-15T05:00:00.000Z');

    it('7d: kỳ hiện tại 7 ngày, kỳ trước 7 ngày liền trước', () => {
      const range = service.computePeriodRange(AnalyticsPeriod.SEVEN_DAYS, now);

      expect(range.current.start.toISOString()).toBe(
        '2026-03-08T05:00:00.000Z',
      );
      expect(range.current.end.toISOString()).toBe('2026-03-15T05:00:00.000Z');
      expect(range.previous.start.toISOString()).toBe(
        '2026-03-01T05:00:00.000Z',
      );
      expect(range.previous.end.toISOString()).toBe('2026-03-08T05:00:00.000Z');
    });

    it('month: đầu tháng giờ VN tới now; kỳ trước = đoạn cùng độ dài đã trôi qua từ đầu tháng trước', () => {
      const range = service.computePeriodRange(AnalyticsPeriod.MONTH, now);

      // 2026-03-01 00:00 +07:00 = 2026-02-28T17:00:00Z
      expect(range.current.start.toISOString()).toBe(
        '2026-02-28T17:00:00.000Z',
      );
      expect(range.current.end.toISOString()).toBe('2026-03-15T05:00:00.000Z');
      // 2026-02-01 00:00 +07:00 = 2026-01-31T17:00:00Z
      expect(range.previous.start.toISOString()).toBe(
        '2026-01-31T17:00:00.000Z',
      );
      // Đã trôi qua từ đầu tháng 3: 2026-02-28T17:00Z -> 2026-03-15T05:00Z = 14d12h.
      // Kỳ trước = 2026-01-31T17:00Z + 14d12h = 2026-02-15T05:00:00Z (chưa chạm biên).
      expect(range.previous.end.toISOString()).toBe('2026-02-15T05:00:00.000Z');
    });

    it('month giữa tháng: kỳ trước chưa clamp, kết thúc cùng mốc giờ đã trôi', () => {
      // now = 2026-05-10 12:00 VN = 2026-05-10T05:00:00Z
      const midMay = new Date('2026-05-10T05:00:00.000Z');
      const range = service.computePeriodRange(AnalyticsPeriod.MONTH, midMay);

      // 2026-05-01 00:00 +07:00 = 2026-04-30T17:00:00Z
      expect(range.current.start.toISOString()).toBe(
        '2026-04-30T17:00:00.000Z',
      );
      // 2026-04-01 00:00 +07:00 = 2026-03-31T17:00:00Z
      expect(range.previous.start.toISOString()).toBe(
        '2026-03-31T17:00:00.000Z',
      );
      // Đã trôi 9d12h từ đầu tháng 5 -> kỳ trước = 2026-03-31T17:00Z + 9d12h = 2026-04-10T05:00:00Z.
      expect(range.previous.end.toISOString()).toBe('2026-04-10T05:00:00.000Z');
    });

    it('month 31/3: tháng 2 chỉ 28 ngày nên kỳ trước clamp hết tháng 2', () => {
      // now = 2026-03-31 12:00 VN = 2026-03-31T05:00:00Z
      const mar31 = new Date('2026-03-31T05:00:00.000Z');
      const range = service.computePeriodRange(AnalyticsPeriod.MONTH, mar31);

      // Kỳ trước bắt đầu đầu tháng 2 và clamp tại đầu tháng 3 (currentStart) = hết tháng 2.
      expect(range.previous.start.toISOString()).toBe(
        '2026-01-31T17:00:00.000Z',
      );
      expect(range.previous.end.toISOString()).toBe('2026-02-28T17:00:00.000Z');
      // Clamp nghĩa là kỳ trước đúng bằng currentStart.
      expect(range.previous.end.toISOString()).toBe(
        range.current.start.toISOString(),
      );
    });

    it('month ngày 1 giữa đêm: kỳ hiện tại và kỳ trước đều là cửa sổ ngắn', () => {
      // now = 2026-03-01 00:30 VN = 2026-02-28T17:30:00Z
      const firstOfMonth = new Date('2026-02-28T17:30:00.000Z');
      const range = service.computePeriodRange(
        AnalyticsPeriod.MONTH,
        firstOfMonth,
      );

      // Trôi qua 30 phút từ đầu tháng 3.
      expect(range.current.start.toISOString()).toBe(
        '2026-02-28T17:00:00.000Z',
      );
      expect(range.previous.start.toISOString()).toBe(
        '2026-01-31T17:00:00.000Z',
      );
      // Kỳ trước = đầu tháng 2 + 30 phút.
      expect(range.previous.end.toISOString()).toBe('2026-01-31T17:30:00.000Z');
    });

    it('month tháng 1: kỳ trước là tháng 12 năm liền trước', () => {
      // now = 2026-01-15 12:00 VN = 2026-01-15T05:00:00Z
      const midJan = new Date('2026-01-15T05:00:00.000Z');
      const range = service.computePeriodRange(AnalyticsPeriod.MONTH, midJan);

      // 2026-01-01 00:00 +07:00 = 2025-12-31T17:00:00Z
      expect(range.current.start.toISOString()).toBe(
        '2025-12-31T17:00:00.000Z',
      );
      // 2025-12-01 00:00 +07:00 = 2025-11-30T17:00:00Z
      expect(range.previous.start.toISOString()).toBe(
        '2025-11-30T17:00:00.000Z',
      );
      // Đã trôi 14d12h -> kỳ trước = 2025-11-30T17:00Z + 14d12h = 2025-12-15T05:00:00Z.
      expect(range.previous.end.toISOString()).toBe('2025-12-15T05:00:00.000Z');
    });

    it('month 29/2 năm nhuận: kỳ hiện tại tính tới 29/2, kỳ trước canh theo giờ đã trôi', () => {
      // 2028 là năm nhuận; now = 2028-02-29 12:00 VN = 2028-02-29T05:00:00Z
      const leapDay = new Date('2028-02-29T05:00:00.000Z');
      const range = service.computePeriodRange(AnalyticsPeriod.MONTH, leapDay);

      // 2028-02-01 00:00 +07:00 = 2028-01-31T17:00:00Z
      expect(range.current.start.toISOString()).toBe(
        '2028-01-31T17:00:00.000Z',
      );
      expect(range.current.end.toISOString()).toBe('2028-02-29T05:00:00.000Z');
      // 2028-01-01 00:00 +07:00 = 2027-12-31T17:00:00Z
      expect(range.previous.start.toISOString()).toBe(
        '2027-12-31T17:00:00.000Z',
      );
      // Đã trôi 28d12h -> kỳ trước = 2027-12-31T17:00Z + 28d12h = 2028-01-29T05:00:00Z (chưa clamp).
      expect(range.previous.end.toISOString()).toBe('2028-01-29T05:00:00.000Z');
    });

    it('year: đầu năm giờ VN tới now; kỳ trước = đoạn cùng độ dài đã trôi qua từ đầu năm trước', () => {
      const range = service.computePeriodRange(AnalyticsPeriod.YEAR, now);

      // 2026-01-01 00:00 +07:00 = 2025-12-31T17:00:00Z
      expect(range.current.start.toISOString()).toBe(
        '2025-12-31T17:00:00.000Z',
      );
      expect(range.current.end.toISOString()).toBe('2026-03-15T05:00:00.000Z');
      // 2025-01-01 00:00 +07:00 = 2024-12-31T17:00:00Z
      expect(range.previous.start.toISOString()).toBe(
        '2024-12-31T17:00:00.000Z',
      );
      // Khoảng đã trôi của 2026 (2025 thường, 365 ngày) đặt lên đầu năm 2025:
      // now - 365 ngày = 2025-03-15T05:00:00Z.
      expect(range.previous.end.toISOString()).toBe('2025-03-15T05:00:00.000Z');
    });
  });

  describe('getOverview', () => {
    const now = new Date('2026-03-15T05:00:00.000Z');
    const workspaceId = 'ws-1';

    it('trả 3 chỉ số với value + changePercent tính từ kỳ trước', async () => {
      // thứ tự Promise.all: sent cur, sent prev, SUCCESS cur, FAILED cur, SUCCESS prev, FAILED prev
      messageLogCount
        .mockResolvedValueOnce(50) // currentSent
        .mockResolvedValueOnce(40) // previousSent
        .mockResolvedValueOnce(30) // currentSuccess
        .mockResolvedValueOnce(10) // currentFailed
        .mockResolvedValueOnce(20) // previousSuccess
        .mockResolvedValueOnce(20); // previousFailed
      templateCount.mockResolvedValueOnce(12);

      const result = await service.getOverview(
        workspaceId,
        AnalyticsPeriod.SEVEN_DAYS,
        now,
      );

      expect(result.messagesSent.value).toBe(50);
      expect(result.messagesSent.changePercent).toBeCloseTo(25); // (50-40)/40*100

      expect(result.successRate.value).toBeCloseTo(75); // 30/40*100
      expect(result.successRate.changePercent).toBeCloseTo(50); // (75-50)/50*100

      expect(result.activeTemplates.value).toBe(12);
      expect(result.activeTemplates.changePercent).toBeNull();
    });

    it('đếm "tin đã gửi" chỉ lọc sentAt trong kỳ, không lọc status (PENDING sentAt=null tự loại)', async () => {
      messageLogCount.mockResolvedValue(0);
      templateCount.mockResolvedValue(0);

      await service.getOverview(workspaceId, AnalyticsPeriod.SEVEN_DAYS, now);

      const sentCall = messageLogCount.mock.calls[0][0];
      expect(sentCall.where).toHaveProperty('sentAt');
      expect(sentCall.where).not.toHaveProperty('status');
      expect(sentCall.where).toMatchObject({ workspaceId });
    });

    it('tỷ lệ thành công: mẫu số 0 → value=null; snapshot APPROVED dùng TemplateStatus.APPROVED', async () => {
      messageLogCount
        .mockResolvedValueOnce(0) // currentSent
        .mockResolvedValueOnce(0) // previousSent
        .mockResolvedValueOnce(0) // currentSuccess
        .mockResolvedValueOnce(0) // currentFailed
        .mockResolvedValueOnce(5) // previousSuccess
        .mockResolvedValueOnce(5); // previousFailed
      templateCount.mockResolvedValueOnce(3);

      const result = await service.getOverview(
        workspaceId,
        AnalyticsPeriod.MONTH,
        now,
      );

      expect(result.successRate.value).toBeNull(); // 0/(0+0)
      // current rate null → changePercent không tính được
      expect(result.successRate.changePercent).toBeNull();
      expect(result.activeTemplates.value).toBe(3);

      const templateCall = templateCount.mock.calls[0][0];
      expect(templateCall.where).toMatchObject({
        workspaceId,
        status: TemplateStatus.APPROVED,
      });
    });

    it('changePercent = null khi kỳ trước = 0 (không chia 0)', async () => {
      messageLogCount
        .mockResolvedValueOnce(10) // currentSent
        .mockResolvedValueOnce(0) // previousSent = 0
        .mockResolvedValueOnce(10) // currentSuccess
        .mockResolvedValueOnce(0) // currentFailed
        .mockResolvedValueOnce(0) // previousSuccess
        .mockResolvedValueOnce(0); // previousFailed
      templateCount.mockResolvedValueOnce(1);

      const result = await service.getOverview(
        workspaceId,
        AnalyticsPeriod.YEAR,
        now,
      );

      expect(result.messagesSent.value).toBe(10);
      expect(result.messagesSent.changePercent).toBeNull(); // prev=0
      // previous rate null (0/0) → changePercent null dù current rate = 100
      expect(result.successRate.value).toBeCloseTo(100);
      expect(result.successRate.changePercent).toBeNull();
    });

    it('status được lọc đúng SUCCESS / FAILED cho chỉ số tỷ lệ', async () => {
      messageLogCount.mockResolvedValue(1);
      templateCount.mockResolvedValue(0);

      await service.getOverview(workspaceId, AnalyticsPeriod.SEVEN_DAYS, now);

      expect(messageLogCount.mock.calls[2][0].where).toMatchObject({
        status: MessageStatus.SUCCESS,
      });
      expect(messageLogCount.mock.calls[3][0].where).toMatchObject({
        status: MessageStatus.FAILED,
      });
    });
  });
});
