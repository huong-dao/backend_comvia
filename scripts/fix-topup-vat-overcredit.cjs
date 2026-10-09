/**
 * Sửa lại các giao dịch TOPUP_CREDIT đã bị cộng dư phần VAT vào ví (bug cũ:
 * ví được cộng amountInclVat thay vì amountExclVat). Script chỉ xử lý các
 * bản ghi xác định chắc chắn là bị lỗi (walletTransaction.amount ===
 * topupRequest.amountInclVat); mọi trường hợp không khớp rõ ràng đều bị bỏ
 * qua và in ra để bạn tự kiểm tra tay, không đoán mò.
 *
 * Mặc định chạy DRY-RUN (chỉ in ra, không ghi DB). Khi đã xem kỹ danh sách
 * và thấy đúng, chạy lại với APPLY=true để áp dụng thật.
 *
 * Usage (PowerShell):
 *   node scripts/fix-topup-vat-overcredit.cjs                # dry-run
 *   $env:APPLY="true"; node scripts/fix-topup-vat-overcredit.cjs   # áp dụng thật
 *
 * Env:
 *   DATABASE_URL — bắt buộc
 *   APPLY        — "true" để ghi DB thật, mặc định là dry-run
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
    const creditTransactions = await prisma.walletTransaction.findMany({
      where: { type: 'TOPUP_CREDIT', sourceType: 'TOPUP_REQUEST' },
      orderBy: { createdAt: 'asc' },
    });

    console.log(
      `Tìm thấy ${creditTransactions.length} giao dịch TOPUP_CREDIT. Đang đối chiếu...\n`,
    );

    const toFix = [];
    const ambiguous = [];
    let alreadyCorrect = 0;

    for (const wt of creditTransactions) {
      const topup = await prisma.topupRequest.findUnique({
        where: { id: wt.sourceId },
      });

      if (!topup) {
        ambiguous.push({ wt, reason: 'Không tìm thấy TopupRequest tương ứng' });
        continue;
      }

      if (topup.vatAmount.isZero()) {
        alreadyCorrect++; // không có VAT thì không có gì để sửa
        continue;
      }

      if (wt.amount.equals(topup.amountExclVat)) {
        alreadyCorrect++; // đã đúng (cộng đúng phần trước thuế)
        continue;
      }

      if (wt.amount.equals(topup.amountInclVat)) {
        toFix.push({ wt, topup });
        continue;
      }

      ambiguous.push({
        wt,
        topup,
        reason: `amount (${wt.amount.toString()}) không khớp amountExclVat (${topup.amountExclVat.toString()}) lẫn amountInclVat (${topup.amountInclVat.toString()})`,
      });
    }

    console.log(`Đã đúng, không cần sửa: ${alreadyCorrect}`);
    console.log(`Cần điều chỉnh (đã cộng dư VAT): ${toFix.length}`);
    console.log(`Không xác định, cần xem tay: ${ambiguous.length}\n`);

    if (ambiguous.length > 0) {
      console.log('--- DANH SÁCH CẦN XEM TAY (không tự động đụng vào) ---');
      for (const item of ambiguous) {
        console.log(
          `  walletTransactionId=${item.wt.id} transactionCode=${item.wt.transactionCode} ownerUserId=${item.wt.ownerUserId} lý do: ${item.reason}`,
        );
      }
      console.log('');
    }

    if (toFix.length === 0) {
      console.log('Không có giao dịch nào cần điều chỉnh. Dừng.');
      return;
    }

    console.log('--- DANH SÁCH SẼ ĐIỀU CHỈNH ---');
    let totalCorrection = 0;
    for (const { wt, topup } of toFix) {
      const overcredited = Number(topup.vatAmount);
      totalCorrection += overcredited;
      console.log(
        `  topupCode=${topup.topupCode} ownerUserId=${topup.ownerUserId} ` +
          `đã cộng dư ${overcredited} (vatAmount) — walletTransactionId gốc=${wt.id}`,
      );
    }
    console.log(
      `\nTổng số tiền sẽ bị trừ lại khỏi ví (tổng cộng dư trước đó): ${totalCorrection}\n`,
    );

    if (!apply) {
      console.log(
        'ĐANG Ở CHẾ ĐỘ DRY-RUN — chưa ghi gì vào DB. Kiểm tra lại danh sách trên,\n' +
          'nếu đúng thì chạy lại với biến môi trường APPLY=true để áp dụng thật.',
      );
      return;
    }

    console.log('APPLY=true — bắt đầu áp dụng điều chỉnh thật...\n');

    for (const { wt, topup } of toFix) {
      const overcredited = topup.vatAmount;

      await prisma.$transaction(async (tx) => {
        const wallet = await tx.walletAccount.findUnique({
          where: { ownerUserId: topup.ownerUserId },
        });
        if (!wallet) {
          throw new Error(
            `Không tìm thấy ví của ownerUserId=${topup.ownerUserId}, bỏ qua topupCode=${topup.topupCode}`,
          );
        }

        const balanceBefore = wallet.balance;
        const balanceAfter = balanceBefore.sub(overcredited);

        if (balanceAfter.isNegative()) {
          throw new Error(
            `Số dư hiện tại (${balanceBefore.toString()}) không đủ để trừ ${overcredited.toString()} ` +
              `cho topupCode=${topup.topupCode} — bỏ qua, cần xem tay (có thể khách đã tiêu số tiền dư này rồi).`,
          );
        }

        await tx.walletTransaction.create({
          data: {
            transactionCode: `TX_ADJ_${topup.topupCode}`,
            ownerUserId: topup.ownerUserId,
            workspaceId: topup.workspaceId,
            type: 'MANUAL_ADJUSTMENT',
            amount: overcredited,
            balanceBefore,
            balanceAfter,
            sourceType: 'TOPUP_REQUEST',
            sourceId: topup.id,
            note: `Điều chỉnh: đã cộng dư ${overcredited.toString()} (VAT) vào ví lúc nạp tiền ${topup.topupCode}, nay trừ lại cho đúng`,
          },
        });

        await tx.walletAccount.update({
          where: { ownerUserId: topup.ownerUserId },
          data: {
            balance: balanceAfter,
            totalTopup: { decrement: overcredited },
          },
        });

        await tx.auditLog.create({
          data: {
            actorUserId: topup.ownerUserId,
            workspaceId: topup.workspaceId,
            action: 'topup.vat_overcredit_corrected',
            resourceType: 'TopupRequest',
            resourceId: topup.id,
            metadataJson: {
              topupCode: topup.topupCode,
              correctedAmount: overcredited.toNumber(),
              originalWalletTransactionId: wt.id,
            },
          },
        });
      });

      console.log(`  Đã sửa xong: ${topup.topupCode}`);
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
