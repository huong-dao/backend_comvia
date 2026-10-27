const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

export type WorkspaceInvitationTemplateInput = {
  workspaceName: string;
  acceptUrl: string;
  expiresAt: Date;
};

export function buildWorkspaceInvitationTemplate(
  input: WorkspaceInvitationTemplateInput,
): string {
  const workspaceName = escapeHtml(input.workspaceName);
  const acceptUrl = escapeHtml(input.acceptUrl);
  const expiresAt = escapeHtml(
    input.expiresAt.toLocaleString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
    }),
  );

  return `<!doctype html>
<html lang="vi">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>COMVIA workspace invitation</title></head>
  <body style="margin:0;padding:24px;background:#f3f4f6;font-family:Arial,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden;">
        <tr><td style="padding:28px;background:#1d4ed8;color:#fff;"><h1 style="margin:0;font-size:24px;">Bạn được mời vào workspace</h1></td></tr>
        <tr><td style="padding:28px;font-size:16px;line-height:1.6;">
          <p>Bạn được mời tham gia workspace <strong>${workspaceName}</strong> trên COMVIA.</p>
          <p><a href="${acceptUrl}" style="display:inline-block;padding:12px 18px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;">Chấp nhận lời mời</a></p>
          <p style="font-size:14px;color:#4b5563;">Liên kết hết hạn vào ${expiresAt}. Bạn cần đăng nhập bằng đúng email nhận lời mời.</p>
          <p style="font-size:14px;color:#4b5563;word-break:break-all;">Nếu nút không hoạt động, mở liên kết này: <a href="${acceptUrl}">${acceptUrl}</a></p>
        </td></tr>
      </table>
    </td></tr></table>
  </body>
</html>`;
}
