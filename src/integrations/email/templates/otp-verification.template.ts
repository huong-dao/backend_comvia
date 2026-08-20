import { existsSync } from 'fs';
import { join } from 'path';

export type OtpVerificationTemplateInput = {
  otpCode: string;
  expiresInMinutes: number;
};

export type OtpVerificationTemplateResult = {
  html: string;
  attachments: Array<{
    filename: string;
    path: string;
    cid: string;
  }>;
};

const LOGO_DIR = join(process.cwd(), 'assets', 'email', 'logos');

function resolveLogo(filename: string, cid: string) {
  const filePath = join(LOGO_DIR, filename);
  if (!existsSync(filePath)) {
    return null;
  }

  return { filename, path: filePath, cid };
}

function formatOtpDigits(otpCode: string): string {
  return otpCode
    .split('')
    .map((digit) => `<span style="display:inline-block;min-width:28px;text-align:center;">${digit}</span>`)
    .join('<span style="display:inline-block;width:12px;"></span>');
}

export function buildOtpVerificationTemplate(
  input: OtpVerificationTemplateInput,
): OtpVerificationTemplateResult {
  const comviaLogo = resolveLogo('comvia.png', 'comvia-logo');
  const softxLogo = resolveLogo('softx.png', 'softx-logo');

  const attachments = [comviaLogo, softxLogo].filter(
    (item): item is NonNullable<typeof item> => item !== null,
  );

  const headerLogos =
    comviaLogo && softxLogo
      ? `<tr>
          <td align="center" style="padding:24px 24px 16px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center" style="padding-right:16px;border-right:1px solid #E5E7EB;">
                  <img src="cid:comvia-logo" alt="COMVIA" height="36" style="display:block;height:36px;width:auto;border:0;" />
                </td>
                <td align="center" style="padding-left:16px;">
                  <img src="cid:softx-logo" alt="SoftX.asia" height="36" style="display:block;height:36px;width:auto;border:0;" />
                </td>
              </tr>
            </table>
          </td>
        </tr>`
      : `<tr>
          <td align="center" style="padding:24px 24px 16px;font-family:Arial,sans-serif;font-size:24px;font-weight:700;color:#2563EB;">
            COMVIA
          </td>
        </tr>`;

  const footerLogos =
    comviaLogo && softxLogo
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td align="center" style="padding-right:12px;border-right:1px solid #E5E7EB;">
              <img src="cid:comvia-logo" alt="COMVIA" height="24" style="display:block;height:24px;width:auto;border:0;" />
            </td>
            <td align="center" style="padding-left:12px;">
              <img src="cid:softx-logo" alt="SoftX.asia" height="24" style="display:block;height:24px;width:auto;border:0;" />
            </td>
          </tr>
        </table>`
      : `<span style="font-family:Arial,sans-serif;font-size:16px;font-weight:700;color:#2563EB;">COMVIA</span>`;

  const html = `<!DOCTYPE html>
<html lang="vi">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>COMVIA OTP</title>
  </head>
  <body style="margin:0;padding:0;background-color:#F3F4F6;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F3F4F6;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;background-color:#FFFFFF;border-radius:12px;overflow:hidden;">
            ${headerLogos}
            <tr>
              <td style="background:linear-gradient(135deg,#2563EB 0%,#1D4ED8 100%);padding:32px 28px;color:#FFFFFF;font-family:Arial,sans-serif;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="vertical-align:top;">
                      <div style="font-size:28px;line-height:1.2;font-weight:700;margin-bottom:12px;">Xác thực tài khoản</div>
                      <div style="font-size:15px;line-height:1.6;color:#DBEAFE;">
                        Cảm ơn bạn đã sử dụng COMVIA. Vui lòng sử dụng mã OTP bên dưới để xác thực tài khoản của bạn.
                      </div>
                    </td>
                    <td width="96" align="right" style="vertical-align:top;">
                      <div style="width:72px;height:72px;border-radius:999px;background:rgba(255,255,255,0.15);text-align:center;line-height:72px;font-size:34px;">🔒</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:32px 28px 12px;font-family:Arial,sans-serif;color:#111827;">
                <div style="font-size:16px;margin-bottom:16px;">Mã OTP của bạn là:</div>
                <div style="display:inline-block;background-color:#EFF6FF;border:1px solid #BFDBFE;border-radius:12px;padding:18px 28px;font-size:34px;line-height:1;font-weight:700;letter-spacing:2px;color:#2563EB;">
                  ${formatOtpDigits(input.otpCode)}
                </div>
                <div style="margin-top:16px;font-size:14px;line-height:1.6;color:#6B7280;">
                  Mã OTP này có hiệu lực trong ${input.expiresInMinutes} phút và chỉ sử dụng một lần.
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 28px 24px;font-family:Arial,sans-serif;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="padding:14px 0;border-bottom:1px solid #F3F4F6;">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td width="36" valign="top" style="font-size:18px;">🛡️</td>
                          <td valign="top">
                            <div style="font-size:15px;font-weight:700;color:#111827;">Bảo mật tuyệt đối</div>
                            <div style="font-size:14px;line-height:1.6;color:#6B7280;">Không chia sẻ mã OTP với bất kỳ ai.</div>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:14px 0;border-bottom:1px solid #F3F4F6;">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td width="36" valign="top" style="font-size:18px;">⏱️</td>
                          <td valign="top">
                            <div style="font-size:15px;font-weight:700;color:#111827;">Hiệu lực trong ${input.expiresInMinutes} phút</div>
                            <div style="font-size:14px;line-height:1.6;color:#6B7280;">Mã sẽ hết hạn sau ${input.expiresInMinutes} phút kể từ thời điểm bạn nhận được email này.</div>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:14px 0;">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td width="36" valign="top" style="font-size:18px;">❓</td>
                          <td valign="top">
                            <div style="font-size:15px;font-weight:700;color:#111827;">Không nhận được email?</div>
                            <div style="font-size:14px;line-height:1.6;color:#6B7280;">Vui lòng kiểm tra thư mục Spam hoặc thử gửi lại mã OTP sau ${input.expiresInMinutes} phút.</div>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 24px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;">
                  <tr>
                    <td style="padding:16px 18px;font-family:Arial,sans-serif;">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td width="28" valign="top" style="font-size:18px;">✉️</td>
                          <td valign="top">
                            <div style="font-size:15px;font-weight:700;color:#111827;">Bạn không yêu cầu mã này?</div>
                            <div style="font-size:14px;line-height:1.6;color:#6B7280;">Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email hoặc liên hệ với chúng tôi để được hỗ trợ.</div>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 28px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td align="left" style="vertical-align:middle;">
                      ${footerLogos}
                    </td>
                    <td align="right" style="vertical-align:middle;font-family:Arial,sans-serif;font-size:13px;line-height:1.8;color:#6B7280;">
                      <div>🌐 <a href="https://comvia.cloud" style="color:#2563EB;text-decoration:none;">https://comvia.cloud</a></div>
                      <div>🌐 <a href="https://softx.asia" style="color:#2563EB;text-decoration:none;">https://softx.asia</a></div>
                    </td>
                  </tr>
                </table>
                <div style="margin-top:20px;text-align:center;font-family:Arial,sans-serif;font-size:13px;color:#9CA3AF;">
                  COMVIA một sản phẩm công nghệ của <strong style="color:#111827;">SoftX.asia</strong>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { html, attachments };
}
