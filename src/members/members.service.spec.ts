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
      $transaction: jest.fn((callback) => callback(tx)),
    };
    return { service: new MembersService(prisma as never, {} as never), tx };
  }

  it('accepts only the account whose email was invited', async () => {
    const { service, tx } = createService('MEMBER@example.com');

    await expect(
      service.acceptInvitation('workspace-1', 'user-1', {
        token: 'a-valid-invitation-token',
      }),
    ).resolves.toEqual({ ok: true });
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
});
