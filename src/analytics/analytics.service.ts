import { Injectable } from '@nestjs/common';
import { MessageStatus, TemplateStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsPeriod } from './dto/analytics-overview-query.dto';

/** Lệch cố định của Asia/Ho_Chi_Minh so với UTC (+07:00, không có DST). */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/** Khoảng thời gian nửa mở [start, end). */
export interface PeriodRange {
  start: Date;
  end: Date;
}

export interface PeriodRanges {
  current: PeriodRange;
  previous: PeriodRange;
}

/** Một chỉ số dashboard: giá trị kỳ hiện tại + % thay đổi so kỳ liền trước. */
export interface MetricValue {
  value: number | null;
  changePercent: number | null;
}

export interface AnalyticsOverview {
  period: AnalyticsPeriod;
  range: PeriodRanges;
  /** Tin nhắn đã gửi = số MessageLog có sentAt trong kỳ (PENDING sentAt=null tự loại). */
  messagesSent: MetricValue;
  /** Tỷ lệ gửi thành công (%) = SUCCESS/(SUCCESS+FAILED); mẫu số 0 → value=null. */
  successRate: MetricValue;
  /** Mẫu tin đang hoạt động = snapshot số Template APPROVED; changePercent luôn null. */
  activeTemplates: MetricValue;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Tính biên kỳ hiện tại và kỳ liền trước cùng độ dài theo timezone Asia/Ho_Chi_Minh.
   * - 7d: 7 ngày tính tới `now`; kỳ trước là 7 ngày liền trước.
   * - month: từ đầu tháng (giờ VN) tới `now`; kỳ trước là trọn tháng liền trước.
   * - year: từ đầu năm (giờ VN) tới `now`; kỳ trước là trọn năm liền trước.
   *
   * `now` được tách thành tham số để unit test khóa được biên kỳ.
   */
  computePeriodRange(
    period: AnalyticsPeriod,
    now: Date = new Date(),
  ): PeriodRanges {
    if (period === AnalyticsPeriod.SEVEN_DAYS) {
      const currentStart = new Date(now.getTime() - SEVEN_DAYS_MS);
      const previousStart = new Date(now.getTime() - 2 * SEVEN_DAYS_MS);
      return {
        current: { start: currentStart, end: now },
        previous: { start: previousStart, end: currentStart },
      };
    }

    // Đọc wall-clock giờ VN bằng cách dịch instant UTC lên +7h rồi đọc theo UTC.
    const vnNow = new Date(now.getTime() + VN_OFFSET_MS);
    const vnYear = vnNow.getUTCFullYear();
    const vnMonth = vnNow.getUTCMonth();

    const utcInstantFromVnWall = (year: number, month: number): Date =>
      new Date(Date.UTC(year, month, 1) - VN_OFFSET_MS);

    if (period === AnalyticsPeriod.MONTH) {
      const currentStart = utcInstantFromVnWall(vnYear, vnMonth);
      const previousStart = utcInstantFromVnWall(vnYear, vnMonth - 1);
      return {
        current: { start: currentStart, end: now },
        previous: { start: previousStart, end: currentStart },
      };
    }

    // AnalyticsPeriod.YEAR
    const currentStart = utcInstantFromVnWall(vnYear, 0);
    const previousStart = utcInstantFromVnWall(vnYear - 1, 0);
    return {
      current: { start: currentStart, end: now },
      previous: { start: previousStart, end: currentStart },
    };
  }

  async getOverview(
    workspaceId: string,
    period: AnalyticsPeriod,
    now: Date = new Date(),
  ): Promise<AnalyticsOverview> {
    const range = this.computePeriodRange(period, now);

    const [
      currentSent,
      previousSent,
      currentSuccess,
      currentFailed,
      previousSuccess,
      previousFailed,
      activeTemplateCount,
    ] = await Promise.all([
      this.countSent(workspaceId, range.current),
      this.countSent(workspaceId, range.previous),
      this.countByStatus(workspaceId, range.current, MessageStatus.SUCCESS),
      this.countByStatus(workspaceId, range.current, MessageStatus.FAILED),
      this.countByStatus(workspaceId, range.previous, MessageStatus.SUCCESS),
      this.countByStatus(workspaceId, range.previous, MessageStatus.FAILED),
      this.prismaService.template.count({
        where: { workspaceId, status: TemplateStatus.APPROVED },
      }),
    ]);

    const currentRate = this.successRate(currentSuccess, currentFailed);
    const previousRate = this.successRate(previousSuccess, previousFailed);

    return {
      period,
      range,
      messagesSent: {
        value: currentSent,
        changePercent: this.changePercent(currentSent, previousSent),
      },
      successRate: {
        value: currentRate,
        changePercent: this.changePercent(currentRate, previousRate),
      },
      activeTemplates: {
        value: activeTemplateCount,
        changePercent: null,
      },
    };
  }

  /** Đếm MessageLog có sentAt trong [start, end) — null tự loại vì so sánh gte/lt. */
  private countSent(workspaceId: string, range: PeriodRange): Promise<number> {
    return this.prismaService.messageLog.count({
      where: {
        workspaceId,
        sentAt: { gte: range.start, lt: range.end },
      },
    });
  }

  private countByStatus(
    workspaceId: string,
    range: PeriodRange,
    status: MessageStatus,
  ): Promise<number> {
    return this.prismaService.messageLog.count({
      where: {
        workspaceId,
        status,
        sentAt: { gte: range.start, lt: range.end },
      },
    });
  }

  /** SUCCESS/(SUCCESS+FAILED)*100; mẫu số 0 → null. */
  private successRate(success: number, failed: number): number | null {
    const denominator = success + failed;
    if (denominator === 0) {
      return null;
    }
    return (success / denominator) * 100;
  }

  /** (cur - prev)/prev*100; null khi thiếu dữ liệu hoặc prev=0 (không chia 0). */
  private changePercent(
    current: number | null,
    previous: number | null,
  ): number | null {
    if (current === null || previous === null || previous === 0) {
      return null;
    }
    return ((current - previous) / previous) * 100;
  }
}
