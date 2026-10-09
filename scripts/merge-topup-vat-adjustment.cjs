/**
 * Gộp cặp (TOPUP_CREDIT gốc bị cộng dư VAT) + (MANUAL_ADJUSTMENT trừ lại VAT,
 * tạo bởi scripts/fix-topup-vat-overcredit.cjs) thành lại ĐÚNG 1 dòng duy
 * nhất trong lịch sử giao dịch — sửa amount của dòng gốc về đúng
 * amountExclVat rồi xóa dòng điều chỉnh, để khách chỉ thấy "Nạp tiền
 * 500.000" thay vì 2 dòng (550.000 rồi -50.000).
 *
 * CHỈ DÙNG CHO DỮ LIỆU TEST. Với dữ liệu thật/production, KHÔNG nên sửa đè
 * lịch sử ledger đã phát sinh — giữ 2 dòng minh bạch (có audit trail) là
 * cách làm đúng cho tiền thật. Script này xóa vĩnh viễn bản ghi điều chỉnh.
 *
 * An toàn: chỉ gộp khi chắc chắn giữa 2 bản ghi không có giao dịch nào khác
 * chen vào (kiểm tra bằng cách đối chiếu balanceBefore/balanceAfter liền
 * kề) — nếu có phát sinh gì ở giữa (vd trừ tiền gửi tin nhắn), script bỏ
 * qua case đó và in ra để bạn tự xử lý tay, không đoán mò.
 *
 * Mặc định chạy DRY-RUN. Chạy với APPLY=true để áp dụng thật.
 *
 * Usage (PowerShell):
 *   node scripts/merge-topup-vat-adjustment.cjs                # dry-run
 *   $env:APPLY="true"; node scripts/merge-topup-vat-adjustment.cjs   # áp dụng thật
 */
require('dotenv/config');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('Missing DATABASE_URL');
    process.exit(1);
  }

  const apply = process.env.APPLY === 'true';
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    const adjustments = await prisma.walletTransaction.findMany({
      where: { type: 'MANUAL_ADJUSTMENT', sourceType: 'TOPUP_REQUEST' },
      orderBy: { createdAt: 'asc' },
    });

    console.log(
      `Tìm thấy ${adjustments.length} bản ghi điều chỉnh VAT. Đang đối chiếu...\n`,
    );

    const toMerge = [];
    const skipped = [];

    for (const adj of adjustments) {
      const original = await prisma.walletTransaction.findFirst({
        where: {
          type: 'TOPUP_CREDIT',
          sourceType: 'TOPUP_REQUEST',
          sourceId: adj.sourceId,
          ownerUserId: adj.ownerUserId,
        },
      });

      if (!original) {
        skipped.push({ adj, reason: 'Không tìm thấy dòng TOPUP_CREDIT gốc' });
        continue;
      }

      const topup = await prisma.topupRequest.findUnique({
        where: { id: adj.sourceId },
      });
      if (!topup) {
        skipped.push({ adj, reason: 'Không tìm thấy TopupRequest' });
        continue;
      }

      // Đảm bảo không có giao dịch nào khác chen giữa 2 dòng này cho cùng
      // 1 người dùng: balanceAfter của dòng gốc phải đúng bằng balanceBefore
      // của dòng điều chỉnh.
      if (!original.balanceAfter.equals(adj.balanceBefore)) {
        skipped.push({
          adj,
          original,
          reason:
            `Có giao dịch khác chen giữa (balanceAfter gốc=${original.balanceAfter.toString()} ` +
            `!= balanceBefore điều chỉnh=${adj.balanceBefore.toString()}) — cần xem tay`,
        });
        continue;
      }

      toMerge.push({ adj, original, topup });
    }

    console.log(`Có thể gộp an toàn: ${toMerge.length}`);
    console.log(`Bỏ qua, cần xem tay: ${skipped.length}\n`);

    if (skipped.length > 0) {
      console.log('--- DANH SÁCH BỎ QUA ---');
      for (const item of skipped) {
        console.log(
          `  adjustmentId=${item.adj.id} transactionCode=${item.adj.transactionCode} lý do: ${item.reason}`,
        );
      }
      console.log('');
    }

    if (toMerge.length === 0) {
      console.log('Không có gì để gộp. Dừng.');
      return;
    }

    console.log('--- DANH SÁCH SẼ GỘP ---');
    for (const { original, topup } of toMerge) {
      console.log(
        `  topupCode=${topup.topupCode} ownerUserId=${topup.ownerUserId} ` +
          `${original.amount.toString()} -> ${topup.amountExclVat.toString()} (xóa dòng điều chỉnh)`,
      );
    }
    console.log('');

    if (!apply) {
      console.log(
        'ĐANG Ở CHẾ ĐỘ DRY-RUN — chưa ghi gì vào DB. Kiểm tra lại danh sách trên,\n' +
          'nếu đúng thì chạy lại với biến môi trường APPLY=true để áp dụng thật.',
      );
      return;
    }

    console.log('APPLY=true — bắt đầu gộp thật...\n');

    for (const { adj, original, topup } of toMerge) {
      await prisma.$transaction(async (tx) => {
        await tx.walletTransaction.update({
          where: { id: original.id },
          data: {
            amount: topup.amountExclVat,
            balanceAfter: adj.balanceAfter, // số dư cuối cùng đã đúng, giữ nguyên
            note: `Nạp tiền từ Pay2S: ${topup.topupCode}`,
          },
        });

        await tx.walletTransaction.delete({ where: { id: adj.id } });

        await tx.auditLog.create({
          data: {
            actorUserId: topup.ownerUserId,
            workspaceId: topup.workspaceId,
            action: 'topup.vat_overcredit_merged',
            resourceType: 'TopupRequest',
            resourceId: topup.id,
            metadataJson: {
              topupCode: topup.topupCode,
              mergedAdjustmentTransactionId: adj.id,
              originalTransactionId: original.id,
              finalAmount: topup.amountExclVat.toNumber(),
            },
          },
        });
      });

      console.log(`  Đã gộp xong: ${topup.topupCode}`);
    }

    console.log('\nHoàn tất.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
