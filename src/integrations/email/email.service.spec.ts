import { EmailService } from './email.service';

type SentMail = {
  from: string;
  to: string;
  subject: string;
  html: string;
};

describe('EmailService workspace invitation', () => {
  it('sends an accept URL built from the configured frontend origin', async () => {
    const config = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          'email.fromName': 'COMVIA',
          'email.fromEmail': 'no-reply@example.com',
          'email.invitationSubject': 'Workspace invitation',
          'email.appBaseUrl': 'https://app.example.com',
        };
        return values[key];
      }),
    };
    const service = new EmailService(config as never);
    const sendMail = jest
      .fn<Promise<void>, [SentMail]>()
      .mockResolvedValue(undefined);
    (
      service as unknown as {
        transporter: { sendMail: typeof sendMail };
      }
    ).transporter = { sendMail };

    await service.sendWorkspaceInvitationEmail({
      to: 'member@example.com',
      workspaceId: 'workspace-1',
      workspaceName: 'Workspace A',
      token: 'token-1',
      expiresAt: new Date('2026-10-27T00:00:00.000Z'),
    });

    expect(sendMail).toHaveBeenCalledTimes(1);
    const [sentMail] = sendMail.mock.calls[0];
    expect(sentMail.to).toBe('member@example.com');
    expect(sentMail.html).toContain(
      'https://app.example.com/app/invitations/accept?workspaceId=workspace-1&amp;token=token-1',
    );
  });
});
