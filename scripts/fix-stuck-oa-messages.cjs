/**
 * Dọn các tin campaign bị kẹt "Đang xử lý" vì OA mất kết nối (tin chưa hề gửi
 * sang Zalo).
 *
 * Trước đây lỗi OA (chưa kết nối / thiếu token / token hết hạn) bị coi là "không
 * rõ kết quả" nên:  MessageLog = PENDING,  CampaignRow = RECONCILIATION_REQUIRED,
 * Campaign + CampaignRun = PAUSED, và không có gì chuyển chúng đi tiếp.
 *
 * Script này đưa về trạng thái đúng với luồng mới (cách A):
 *   - MessageLog PENDING (lỗi OA)      -> FAILED (giữ lại làm lịch sử, giữ errorCode)
 *   - CampaignRow RECONCILIATION_REQUIRED (lỗi OA) -> PENDING, vẫn thuộc run cũ
 *   - Campaign                         -> PAUSED + pauseReason = OA_DISCONNECTED
 *   - Counters của campaign được tính lại
 * Ví KHÔNG bị đụng: tiền đã hold ở run cũ được giữ nguyên, khi resume sẽ dùng lại.
 * Sau khi chạy, user kết nối lại OA rồi gọi POST /campaigns/:id/resume.
 *
 * Usage:
 *   node scripts/fix-stuck-oa-messages.cjs            # dry-run, chỉ in báo cáo
 *   node scripts/fix-stuck-oa-messages.cjs --apply    # ghi thật
 *   node scripts/fix-stuck-oa-messages.cjs --apply --campaign <campaignId>
 *
 * Yêu cầu: DATABASE_URL trong .env. NÊN backup DB và chạy dry-run trước.
 * An toàn chạy lại nhiều lần (idempotent): chỉ xử lý row còn kẹt.
 */
require('dotenv/config');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

// Giữ đồng bộ với SEND_ERROR_MESSAGES (src/messaging/send-error-messages.ts):
// MessageLog.errorCode lưu error.message = message tiếng Việt của mã lỗi OA.
const OA_ERROR_MESSAGES = [
  'Official Account chưa kết nối với Zalo. Vui lòng kết nối OA trong phần Cài đặt.', // OA_NOT_CONNECTED
  'Thiếu thông tin xác thực của Zalo OA. Vui lòng kết nối lại OA.', // OA_TOKEN_MISSING
  'OA token đã hết hạn. Vui lòng kết nối lại Zalo OA.', // OA_TOKEN_EXPIRED
];
const PAUSE_REASON_OA_DISCONNECTED = 'OA_DISCONNECTED';
const ROW_FAILURE_PREFIX = 'Dispatch outcome requires reconciliation: ';

function parseArgs(argv) {
  const args = { apply: false, campaignId: undefined };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--apply') args.apply = true;
    else if (argv[i] === '--campaign') args.campaignId = argv[++i];
  }
  return args;
}

async function recomputeCounters(tx, campaignId) {
  const grouped = await tx.campaignRow.groupBy({
    by: ['status'],
    where: { campaignId },
    _count: { _all: true },
  });
  const count = new Map(grouped.map((g) => [g.status, g._count._all]));
  const totalData = [...count.values()].reduce((a, b) => a + b, 0);
  const unfinished =
    (count.get('PENDING') ?? 0) +
    (count.get('PROCESSING') ?? 0) +
    (count.get('RECONCILIATION_REQUIRED') ?? 0);
  const campaign = await tx.campaign.findUnique({
    where: { id: campaignId },
    select: { unitPriceAtCreate: true },
  });
  await tx.campaign.update({
    where: { id: campaignId },
    data: {
      totalData,
      totalValid: totalData,
      totalInvalid: 0,
      totalPending: unfinished,
      totalSuccess: count.get('SUCCESS') ?? 0,
      totalFailed: count.get('FAILED') ?? 0,
      estimatedTotalAmount: Number(campaign?.unitPriceAtCreate ?? 0) * unfinished,
    },
  });
}

async function main() {
  const { apply, campaignId } = parseArgs(process.argv.slice(2));
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('Missing DATABASE_URL');
    process.exit(1);
  }
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    console.log(apply ? '== APPLY MODE ==' : '== DRY-RUN (không ghi gì) ==');

    // Row kẹt: RECONCILIATION_REQUIRED + MessageLog PENDING mang lỗi OA.
    const stuckRows = await prisma.campaignRow.findMany({
      where: {
        status: 'RECONCILIATION_REQUIRED',
        ...(campaignId ? { campaignId } : {}),
        messageLog: {
          is: {
            status: 'PENDING',
            errorCode: { in: OA_ERROR_MESSAGES },
          },
        },
      },
      select: {
        id: true,
        campaignId: true,
        campaignRunId: true,
        messageLogId: true,
        failureReason: true,
        campaignRun: { select: { id: true, status: true } },
      },
    });

    // Chỉ xử lý row thuộc run đang PAUSED (tiền còn hold ở run đó). Run khác
    // trạng thái -> bỏ qua và báo, để người vận hành xem tay.
    const fixable = [];
    const skipped = [];
    for (const row of stuckRows) {
      const reasonOk = (row.failureReason ?? '').startsWith(ROW_FAILURE_PREFIX);
      if (row.campaignRun?.status === 'PAUSED' && reasonOk) fixable.push(row);
      else skipped.push(row);
    }

    const byCampaign = new Map();
    for (const row of fixable) {
      if (!byCampaign.has(row.campaignId)) byCampaign.set(row.campaignId, []);
      byCampaign.get(row.campaignId).push(row);
    }

    console.log(`Row kẹt do OA tìm thấy: ${stuckRows.length}`);
    console.log(`  - sẽ xử lý: ${fixable.length} (ở ${byCampaign.size} campaign)`);
    console.log(`  - bỏ qua (run không PAUSED / lý do lạ): ${skipped.length}`);
    for (const row of skipped) {
      console.log(
        `    skip row ${row.id} campaign ${row.campaignId} run ${row.campaignRunId} (${row.campaignRun?.status ?? 'no run'})`,
      );
    }
    for (const [id, rows] of byCampaign) {
      console.log(`  campaign ${id}: ${rows.length} row -> PENDING`);
    }

    // Thông tin thêm: PENDING log KHÔNG phải lỗi OA (timeout mạng thật...) —
    // script không đụng vào, dùng luồng reconcile CSV.
    const otherPending = await prisma.messageLog.count({
      where: {
        status: 'PENDING',
        errorCode: { notIn: OA_ERROR_MESSAGES },
        ...(campaignId
          ? { campaignRows: { some: { campaignId } } }
          : {}),
      },
    });
    console.log(
      `MessageLog PENDING không phải lỗi OA (không đụng tới): ${otherPending}`,
    );

    if (!apply) {
      console.log('\nDry-run xong. Chạy lại với --apply để ghi.');
      return;
    }

    for (const [id, rows] of byCampaign) {
      await prisma.$transaction(async (tx) => {
        const rowIds = rows.map((r) => r.id);
        const logIds = rows.map((r) => r.messageLogId).filter(Boolean);

        // Guard điều kiện status trong where để chạy lại / chạy song song với
        // worker không ghi đè dữ liệu đã đổi.
        const fixedRows = await tx.campaignRow.updateMany({
          where: { id: { in: rowIds }, status: 'RECONCILIATION_REQUIRED' },
          data: {
            status: 'PENDING',
            failureReason: null,
            messageLogId: null,
            dispatchStartedAt: null,
          },
        });
        const fixedLogs = await tx.messageLog.updateMany({
          where: { id: { in: logIds }, status: 'PENDING' },
          data: { status: 'FAILED' },
        });
        await tx.campaign.update({
          where: { id },
          data: { status: 'PAUSED', pauseReason: PAUSE_REASON_OA_DISCONNECTED },
        });
        await recomputeCounters(tx, id);
        console.log(
          `campaign ${id}: ${fixedRows.count} row -> PENDING, ${fixedLogs.count} log -> FAILED`,
        );
      });
    }
    console.log(
      '\nXong. User kết nối lại OA rồi gọi POST /workspaces/:ws/campaigns/:id/resume.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
