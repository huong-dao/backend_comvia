const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const formatDate = (date: Date) =>
  date.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

const formatMoney = (amount: number) =>
  `${Math.round(amount).toLocaleString('vi-VN')}đ`;

function layout(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="vi">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title></head>
  <body style="margin:0;padding:24px;background:#f3f4f6;font-family:Arial,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden;">
        <tr><td style="padding:28px;background:#1d4ed8;color:#fff;"><h1 style="margin:0;font-size:22px;">${escapeHtml(title)}</h1></td></tr>
        <tr><td style="padding:28px;font-size:16px;line-height:1.6;">${bodyHtml}</td></tr>
      </table>
    </td></tr></table>
  </body>
</html>`;
}

export type SubscriptionExpiryTemplateInput = {
  workspaceName: string;
  planName: string;
  endsAt: Date;
  daysRemaining: number;
  renewUrl: string;
};

export function buildSubscriptionExpiryTemplate(
  input: SubscriptionExpiryTemplateInput,
): string {
  const renewUrl = escapeHtml(input.renewUrl);
  return layout(
    'Gói subscription sắp hết hạn',
    `<p>Gói <strong>${escapeHtml(input.planName)}</strong> của workspace <strong>${escapeHtml(input.workspaceName)}</strong> sẽ hết hạn vào <strong>${escapeHtml(formatDate(input.endsAt))}</strong> (còn ${input.daysRemaining} ngày).</p>
<p>Sau thời điểm này workspace sẽ không thể gửi tin (gửi đơn lẻ, campaign, public API). Vui lòng gia hạn để không bị gián đoạn.</p>
<p><a href="${renewUrl}" style="display:inline-block;padding:12px 18px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;">Gia hạn subscription</a></p>`,
  );
}

export type WalletLowBalanceTemplateInput = {
  balance: number;
  threshold: number;
  topupUrl: string;
};

export function buildWalletLowBalanceTemplate(
  input: WalletLowBalanceTemplateInput,
): string {
  const topupUrl = escapeHtml(input.topupUrl);
  return layout(
    'Số dư ví sắp hết',
    `<p>Số dư ví hiện tại của bạn là <strong>${escapeHtml(formatMoney(input.balance))}</strong>, đã chạm ngưỡng nhắc <strong>${escapeHtml(formatMoney(input.threshold))}</strong>.</p>
<p>Vui lòng nạp thêm tiền để việc gửi tin không bị gián đoạn.</p>
<p><a href="${topupUrl}" style="display:inline-block;padding:12px 18px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;">Nạp tiền vào ví</a></p>`,
  );
}
