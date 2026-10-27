import { BadRequestException } from '@nestjs/common';
import { MembersService } from './members.service';

describe('MembersService invitation identity', () => {
  const invitation = {
    id: 'invite-1',
    workspaceId: 'workspace-1',
    status: 'PENDING',
    expiredAt: new Date(Date.now() + 60_000),
    role: 'MEMBER',
    inviteType: 'EMAIL',
    inviteValue: 'member@example.com',
  };

  function createService(email: string) {
    const tx = {
      workspaceInvitation: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      workspaceMember: { upsert: jest.fn() },
    };
    const prisma = {
      workspaceInvitation: {
        findUnique: jest.fn().mockResolvedValue(invitation),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ email }) },
      $transaction: jest.fn(
        (callback: (client: typeof tx) => unknown): unknown => callback(tx),
      ),
    };
    return {
      service: new MembersService(prisma as never, {} as never, {} as never),
      tx,
    };
  }

  it('accepts only the account whose email was invited', async () => {
    const { service, tx } = createService('MEMBER@example.com');

    await expect(
      service.acceptInvitation('workspace-1', 'user-1', {
        token: 'a-valid-invitation-token',
      }),
    ).resolves.toEqual({ ok: true, redirectPath: '/app/w/workspace-1' });
    expect(tx.workspaceInvitation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'invite-1', status: 'PENDING' } }),
    );
  });

  it('rejects a different signed-in email before creating membership', async () => {
    const { service, tx } = createService('other@example.com');

    await expect(
      service.acceptInvitation('workspace-1', 'user-1', {
        token: 'a-valid-invitation-token',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.workspaceMember.upsert).not.toHaveBeenCalled();
  });

  it('sends the email link but does not return its raw token', async () => {
    const expiresAt = new Date(Date.now() + 60_000);
    const createdInvitation = {
      id: 'invite-1',
      token: 'secret-invitation-token',
      expiredAt: expiresAt,
      status: 'PENDING',
      role: 'MEMBER',
      inviteType: 'EMAIL',
      inviteValue: 'member@example.com',
      workspace: { name: 'Workspace A' },
    };
    const prisma = {
      workspaceInvitation: {
        create: jest.fn().mockResolvedValue(createdInvitation),
        delete: jest.fn(),
      },
    };
    const auditLog = { write: jest.fn() };
    const email = { sendWorkspaceInvitationEmail: jest.fn() };
    const service = new MembersService(
      prisma as never,
      auditLog as never,
      email as never,
    );

    await expect(
      service.invite('workspace-1', 'owner-1', {
        inviteType: 'EMAIL',
        inviteValue: 'MEMBER@example.com',
        role: 'MEMBER',
      }),
    ).resolves.toEqual({ id: 'invite-1', expiredAt: expiresAt });

    expect(email.sendWorkspaceInvitationEmail).toHaveBeenCalledWith({
      to: 'member@example.com',
      workspaceId: 'workspace-1',
      workspaceName: 'Workspace A',
      token: 'secret-invitation-token',
      expiresAt,
    });
    expect(auditLog.write).toHaveBeenCalledTimes(1);
  });

  it('removes the invitation when email delivery fails', async () => {
    const deliveryError = new Error('SMTP unavailable');
    const prisma = {
      workspaceInvitation: {
        create: jest.fn().mockResolvedValue({
          id: 'invite-1',
          token: 'secret-invitation-token',
          expiredAt: new Date(Date.now() + 60_000),
          status: 'PENDING',
          role: 'MEMBER',
          inviteType: 'EMAIL',
          inviteValue: 'member@example.com',
          workspace: { name: 'Workspace A' },
        }),
        delete: jest.fn().mockResolvedValue(undefined),
      },
    };
    const auditLog = { write: jest.fn() };
    const email = {
      sendWorkspaceInvitationEmail: jest.fn().mockRejectedValue(deliveryError),
    };
    const service = new MembersService(
      prisma as never,
      auditLog as never,
      email as never,
    );

    await expect(
      service.invite('workspace-1', 'owner-1', {
        inviteType: 'EMAIL',
        inviteValue: 'member@example.com',
      }),
    ).rejects.toThrow(deliveryError);

    expect(prisma.workspaceInvitation.delete).toHaveBeenCalledWith({
      where: { id: 'invite-1' },
    });
    expect(auditLog.write).not.toHaveBeenCalled();
  });
});
