/**
 * Dọn sạch lịch sử ví sau bug cộng dư VAT, cho đúng ý: mỗi lần nạp tiền chỉ
 * còn 1 dòng "Nạp tiền X" (X = amountExclVat), không còn dòng "Điều chỉnh
 * thủ công" nào — thay cho scripts/merge-topup-vat-adjustment.cjs (script
 * đó chỉ gộp được khi đúng 1 cặp liền kề nhau; nhưng fix-topup-vat-overcredit.cjs
 * chạy DỒN 1 lượt cho tất cả giao dịch ở cuối, nên dòng điều chỉnh không hề
 * nằm kề dòng gốc của chính nó -> không gộp đơn giản được).
 *
 * Cách làm: với mỗi user bị ảnh hưởng, lấy TOÀN BỘ lịch sử WalletTransaction
 * của user đó theo đúng thứ tự thời gian, xóa các dòng MANUAL_ADJUSTMENT do
 * fix-topup-vat-overcredit.cjs tạo ra, sửa amount của các dòng TOPUP_CREDIT
 * bị lỗi về đúng amountExclVat, rồi TÍNH LẠI balanceBefore/balanceAfter của
 * toàn bộ chuỗi giao dịch từ đầu — đảm bảo mọi dòng đều khớp nhau.
 *
 * An toàn: sau khi tính lại, số dư cuối cùng PHẢI bằng đúng số dư hiện tại
 * của ví (vì tổng tiền không đổi, chỉ đổi cách chia theo từng dòng) — nếu
 * lệch thì script dừng ngay, không ghi gì, để bạn tự kiểm tra. Nếu gặp loại
 * giao dịch (`type`) không nằm trong danh sách đã biết (TOPUP_CREDIT,
 * MESSAGE_DEBIT, CAMPAIGN_HOLD, CAMPAIGN_REFUND) thì cũng dừng luôn, không
 * đoán chiều cộng/trừ.
 *
 * CHỈ DÙNG CHO DỮ LIỆU TEST — script này viết lại cả balanceBefore/After
 * của MỌI giao dịch trong ví của user bị ảnh hưởng.
 *
 * Mặc định DRY-RUN. Chạy APPLY=true để áp dụng thật.
 *
 * Usage (PowerShell):
 *   node scripts/rebuild-wallet-ledger-after-vat-fix.cjs
 *   $env:APPLY="true"; node scripts/rebuild-wallet-ledger-after-vat-fix.cjs
 */
require('dotenv/config');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

const CREDIT_TYPES = new Set(['TOPUP_CREDIT', 'CAMPAIGN_REFUND']);
const DEBIT_TYPES = new Set(['MESSAGE_DEBIT', 'CAMPAIGN_HOLD']);

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
    });

    if (adjustments.length === 0) {
      console.log('Không có bản ghi MANUAL_ADJUSTMENT nào cần xử lý. Dừng.');
      return;
    }

    const ownerIds = [...new Set(adjustments.map((a) => a.ownerUserId))];
    console.log(
      `Tìm thấy ${adjustments.length} bản ghi điều chỉnh, thuộc ${ownerIds.length} user. Đang xử lý từng user...\n`,
    );

    for (const ownerUserId of ownerIds) {
      await processOwner(prisma, ownerUserId, apply);
    }

    if (!apply) {
      console.log(
        '\nĐANG Ở CHẾ ĐỘ DRY-RUN — chưa ghi gì vào DB. Xem lại log ở trên,\n' +
          'nếu đúng thì chạy lại với APPLY=true để áp dụng thật.',
      );
    } else {
      console.log('\nHoàn tất.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function processOwner(prisma, ownerUserId, apply) {
  console.log(`--- User ${ownerUserId} ---`);

  const adjustmentsForOwner = await prisma.walletTransaction.findMany({
    where: {
      ownerUserId,
      type: 'MANUAL_ADJUSTMENT',
      sourceType: 'TOPUP_REQUEST',
    },
  });
  const adjustmentIds = new Set(adjustmentsForOwner.map((a) => a.id));
  const affectedTopupIds = new Set(adjustmentsForOwner.map((a) => a.sourceId));

  const topups = await prisma.topupRequest.findMany({
    where: { id: { in: [...affectedTopupIds] } },
  });
  const topupById = new Map(topups.map((t) => [t.id, t]));

  const allTransactions = await prisma.walletTransaction.findMany({
    where: { ownerUserId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

  const surviving = allTransactions.filter((t) => !adjustmentIds.has(t.id));

  if (surviving.length === 0) {
    console.log('  Không còn giao dịch nào sau khi loại bỏ điều chỉnh, bỏ qua.');
    return;
  }

  const updates = [];
  let running = surviving[0].balanceBefore;

  for (const t of surviving) {
    let amount = t.amount;

    if (t.type === 'TOPUP_CREDIT' && topupById.has(t.sourceId)) {
      amount = topupById.get(t.sourceId).amountExclVat;
    }

    let signedDelta;
    if (CREDIT_TYPES.has(t.type)) {
      signedDelta = amount;
    } else if (DEBIT_TYPES.has(t.type)) {
      signedDelta = amount.negated();
    } else {
      console.error(
        `  DỪNG: gặp type lạ "${t.type}" (transactionId=${t.id}) chưa biết chiều cộng/trừ — không đoán, cần xử lý tay.`,
      );
      return;
    }

    const balanceBefore = running;
    const balanceAfter = balanceBefore.add(signedDelta);
    running = balanceAfter;

    updates.push({
      id: t.id,
      transactionCode: t.transactionCode,
      type: t.type,
      amountChanged: !amount.equals(t.amount),
      oldAmount: t.amount,
      newAmount: amount,
      balanceBefore,
      balanceAfter,
    });
  }

  const wallet = await prisma.walletAccount.findUnique({
    where: { ownerUserId },
  });
  if (!wallet) {
    console.error(`  Không tìm thấy walletAccount cho user ${ownerUserId}, bỏ qua.`);
    return;
  }

  // VND không có phần thập phân, nên chênh lệch nhỏ hơn 1đ chắc chắn chỉ là
  // nhiễu dấu phẩy động từ bug tính VAT cũ (đã sửa ở topups.service.ts),
  // không phải có giao dịch thật bị thiếu/thừa — cho phép dung sai đó.
  const diff = running.sub(wallet.balance).abs();
  const balanceChanged = !diff.isZero();
  if (diff.greaterThanOrEqualTo(1)) {
    console.error(
      `  DỪNG: số dư tính lại (${running.toString()}) khác số dư hiện tại (${wallet.balance.toString()}) ` +
        `quá 1đ (chênh ${diff.toString()}) — có khả năng có hoạt động khác xen vào lúc chạy script, cần xem tay, không ghi gì.`,
    );
    return;
  }
  if (balanceChanged) {
    console.log(
      `  Số dư hiện tại có nhiễu dấu phẩy động (${wallet.balance.toString()}) sẽ được làm sạch về ${running.toString()}.`,
    );
  }

  console.log(`  Sẽ xóa ${adjustmentsForOwner.length} dòng điều chỉnh.`);
  console.log(`  Sẽ viết lại balanceBefore/balanceAfter cho ${updates.length} dòng.`);
  for (const u of updates) {
    if (u.amountChanged) {
      console.log(
        `    ${u.transactionCode}: amount ${u.oldAmount.toString()} -> ${u.newAmount.toString()}`,
      );
    }
  }
  console.log(`  Số dư cuối cùng: ${running.toString()}`);

  if (!apply) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const adj of adjustmentsForOwner) {
      await tx.walletTransaction.delete({ where: { id: adj.id } });
    }

    for (const u of updates) {
      await tx.walletTransaction.update({
        where: { id: u.id },
        data: {
          amount: u.newAmount,
          balanceBefore: u.balanceBefore,
          balanceAfter: u.balanceAfter,
          ...(u.amountChanged
            ? { note: `Nạp tiền từ Pay2S: ${u.transactionCode.replace('TX_', '')}` }
            : {}),
        },
      });
    }

    if (balanceChanged) {
      await tx.walletAccount.update({
        where: { ownerUserId },
        data: { balance: running },
      });
    }

    const anyTopup = topups[0];
    await tx.auditLog.create({
      data: {
        actorUserId: ownerUserId,
        workspaceId: anyTopup?.workspaceId ?? null,
        action: 'topup.vat_overcredit_ledger_rebuilt',
        resourceType: 'WalletAccount',
        resourceId: wallet.id,
        metadataJson: {
          affectedTopupIds: [...affectedTopupIds],
          transactionsRewritten: updates.length,
          adjustmentsDeleted: adjustmentsForOwner.length,
        },
      },
    });
  });

  console.log('  Đã áp dụng xong.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
