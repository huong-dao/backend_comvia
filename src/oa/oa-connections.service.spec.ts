import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { AuditLogService } from '../audit-log/audit-log.service';
import { ZaloOAuthClient } from '../integrations/zalo/zalo-oauth.client';
import { PrismaService } from '../prisma/prisma.service';
import { OaConnectionsService } from './oa-connections.service';

describe('OaConnectionsService (OaOAuthAttempt refactor)', () => {
  let service: OaConnectionsService;

  const workspaceOa = {
    findUnique: jest.fn(),
    update: jest.fn(),
  };
  const workspaceOaConnection = {
    findUnique: jest.fn(),
    update: jest.fn(),
  };
  const oaOAuthAttempt = {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  };
  const tx = {
    workspaceOaConnection: { update: jest.fn() },
    oaOAuthAttempt: { updateMany: jest.fn() },
  };
  const prisma = {
    workspaceOa,
    workspaceOaConnection,
    oaOAuthAttempt,
    $transaction: jest.fn((arg: unknown) => {
      if (typeof arg === 'function') {
        return (arg as (t: typeof tx) => unknown)(tx);
      }
      // array form: this.prismaService.$transaction([update, update])
      return Promise.all(arg as Promise<unknown>[]);
    }),
  };

  const auditLogService = { write: jest.fn() };
  const zaloOAuthClient = {
    buildPermissionUrl: jest.fn().mockReturnValue('https://zalo/auth'),
    exchangeAuthorizationCode: jest.fn(),
    getOaInfo: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OaConnectionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogService, useValue: auditLogService },
        { provide: ZaloOAuthClient, useValue: zaloOAuthClient },
      ],
    }).compile();

    service = module.get(OaConnectionsService);
  });

  describe('getStatus', () => {
    it('returns NOT_CONNECTED when no OA profile/connection exists', async () => {
      workspaceOa.findUnique.mockResolvedValue(null);

      const result = await service.getStatus('ws-1');

      expect(result).toEqual({ workspaceId: 'ws-1', status: 'NOT_CONNECTED' });
    });

    it('strips tokens and exposes only boolean flags when connected', async () => {
      workspaceOa.findUnique.mockResolvedValue({
        id: 'oa-1',
        connection: {
          id: 'conn-1',
          workspaceOaId: 'oa-1',
          oaId: 'OA123',
          oaName: 'Shop',
          status: 'CONNECTED',
          accessToken: 'secret-access',
          refreshToken: 'secret-refresh',
          connectedAt: new Date('2026-01-01'),
        },
      });

      const result = (await service.getStatus('ws-1')) as Record<
        string,
        unknown
      >;

      expect(result.accessToken).toBeUndefined();
      expect(result.refreshToken).toBeUndefined();
      expect(result.hasAccessToken).toBe(true);
      expect(result.hasRefreshToken).toBe(true);
      expect(result.workspaceId).toBe('ws-1');
      expect(result.status).toBe('CONNECTED');
    });
  });

  describe('startConnect', () => {
    it('throws when OA profile has not been created yet', async () => {
      workspaceOa.findUnique.mockResolvedValue(null);

      await expect(service.startConnect('ws-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(oaOAuthAttempt.create).not.toHaveBeenCalled();
    });

    it('creates a new OAuth attempt row instead of overwriting the connection', async () => {
      workspaceOa.findUnique.mockResolvedValue({
        id: 'oa-1',
        connection: { id: 'conn-1' },
      });
      oaOAuthAttempt.create.mockResolvedValue({ id: 'attempt-1' });

      const result = await service.startConnect('ws-1', 'user-1');

      expect(oaOAuthAttempt.create).toHaveBeenCalledTimes(1);
      const arg = oaOAuthAttempt.create.mock.calls[0][0];
      expect(arg.data.workspaceOaId).toBe('oa-1');
      expect(typeof arg.data.state).toBe('string');
      expect(typeof arg.data.codeVerifier).toBe('string');
      expect(arg.data.expiresAt).toBeInstanceOf(Date);
      // Connection row itself is never touched by startConnect anymore.
      expect(workspaceOaConnection.update).not.toHaveBeenCalled();
      expect(result.authorizationUrl).toBe('https://zalo/auth');
      expect(result.connectionId).toBe('conn-1');
    });
  });

  describe('resolveWorkspaceIdByOAuthState', () => {
    it('returns null when state is missing', async () => {
      expect(
        await service.resolveWorkspaceIdByOAuthState(undefined),
      ).toBeNull();
    });

    it('resolves workspaceId via the attempt -> workspaceOa join', async () => {
      oaOAuthAttempt.findFirst.mockResolvedValue({
        workspaceOa: { workspaceId: 'ws-9' },
      });

      expect(await service.resolveWorkspaceIdByOAuthState('st')).toBe('ws-9');
    });
  });

  describe('handleOAuthCallback', () => {
    beforeEach(() => {
      oaOAuthAttempt.findFirst.mockResolvedValue({
        id: 'attempt-1',
        codeVerifier: 'verifier',
        workspaceOaId: 'oa-1',
        workspaceOa: { workspaceId: 'ws-1' },
      });
      workspaceOaConnection.findUnique.mockResolvedValue({
        id: 'conn-1',
        oaId: 'pending',
        oaName: null,
      });
      zaloOAuthClient.exchangeAuthorizationCode.mockResolvedValue({
        access_token: 'at',
        refresh_token: 'rt',
        expires_in: 3600,
      });
      zaloOAuthClient.getOaInfo.mockResolvedValue({
        data: { oa_id: 'OA_REAL', name: 'Zalo Shop' },
      });
      workspaceOaConnection.update.mockResolvedValue({
        id: 'conn-1',
        workspaceOa: { workspaceId: 'ws-1' },
      });
      oaOAuthAttempt.update.mockResolvedValue({ id: 'attempt-1' });
    });

    it('updates only the connection row and never the OA profile', async () => {
      await service.handleOAuthCallback({
        code: 'code',
        state: 'state',
      });

      expect(workspaceOaConnection.update).toHaveBeenCalledTimes(1);
      const arg = workspaceOaConnection.update.mock.calls[0][0];
      expect(arg.where).toEqual({ id: 'conn-1' });
      expect(arg.data.status).toBe('CONNECTED');
      expect(arg.data.accessToken).toBe('at');
      // Zalo-provided name stays on the connection, not the profile.
      expect(arg.data.oaName).toBe('Zalo Shop');
      // The manually managed WorkspaceOa profile must never be written here.
      expect(workspaceOa.update).not.toHaveBeenCalled();
      // The consumed attempt is marked, not deleted.
      expect(oaOAuthAttempt.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'attempt-1' } }),
      );
    });

    it('writes audit with the workspaceId resolved from the profile', async () => {
      await service.handleOAuthCallback({ code: 'code', state: 'state' });

      expect(auditLogService.write).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: 'ws-1' }),
      );
    });

    it('throws when the OAuth state is invalid/expired', async () => {
      oaOAuthAttempt.findFirst.mockResolvedValue(null);

      await expect(
        service.handleOAuthCallback({ code: 'c', state: 's' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws when the attempt is valid but its connection row is gone', async () => {
      workspaceOaConnection.findUnique.mockResolvedValue(null);

      await expect(
        service.handleOAuthCallback({ code: 'c', state: 's' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('handleTokenWebhook', () => {
    beforeEach(() => {
      oaOAuthAttempt.findFirst.mockResolvedValue({
        id: 'attempt-1',
        codeVerifier: 'verifier',
        workspaceOaId: 'oa-1',
        workspaceOa: { workspaceId: 'ws-1' },
      });
      workspaceOaConnection.findUnique.mockResolvedValue({
        id: 'conn-1',
        oaId: 'pending',
        oaName: null,
      });
      zaloOAuthClient.getOaInfo.mockResolvedValue({
        data: { oa_id: 'OA_REAL', name: 'Zalo Shop' },
      });
      workspaceOaConnection.update.mockResolvedValue({
        id: 'conn-1',
        oaId: 'OA_REAL',
        workspaceOa: { workspaceId: 'ws-1' },
      });
      oaOAuthAttempt.update.mockResolvedValue({ id: 'attempt-1' });
    });

    it('maps the relay payload by state and marks the attempt consumed', async () => {
      await service.handleTokenWebhook({
        access_token: 'at',
        refresh_token: 'rt',
        state: 'state',
        expires_in: 3600,
      });

      const findArg = oaOAuthAttempt.findFirst.mock.calls[0][0];
      expect(findArg.where.state).toBe('state');
      expect(findArg.where.consumedAt).toBeNull();
      expect(findArg.where.expiresAt.gt).toBeInstanceOf(Date);

      const updateArg = workspaceOaConnection.update.mock.calls[0][0];
      expect(updateArg.data).toMatchObject({
        accessToken: 'at',
        refreshToken: 'rt',
        status: 'CONNECTED',
      });
      const attemptUpdateArg = oaOAuthAttempt.update.mock.calls[0][0];
      expect(attemptUpdateArg.where).toEqual({ id: 'attempt-1' });
      expect(attemptUpdateArg.data.consumedAt).toBeInstanceOf(Date);

      expect(workspaceOa.update).not.toHaveBeenCalled();
      expect(auditLogService.write).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: 'ws-1' }),
      );
    });

    it('rejects a state that is missing, expired, or already consumed', async () => {
      oaOAuthAttempt.findFirst.mockResolvedValue(null);

      await expect(
        service.handleTokenWebhook({
          access_token: 'at',
          refresh_token: 'rt',
          state: 'bad-state',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(workspaceOaConnection.update).not.toHaveBeenCalled();
    });
  });

  describe('disconnect', () => {
    it('is a no-op when no connection exists', async () => {
      workspaceOa.findUnique.mockResolvedValue(null);

      expect(await service.disconnect('ws-1', 'user-1')).toEqual({ ok: true });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('clears tokens, sets DISCONNECTED, and invalidates pending attempts', async () => {
      workspaceOa.findUnique.mockResolvedValue({
        id: 'oa-1',
        connection: {
          id: 'conn-1',
          status: 'CONNECTED',
          oaId: 'OA123',
          oaName: 'Shop',
        },
      });

      await service.disconnect('ws-1', 'user-1');

      expect(tx.workspaceOaConnection.update).toHaveBeenCalledTimes(1);
      const arg = tx.workspaceOaConnection.update.mock.calls[0][0];
      expect(arg.where).toEqual({ workspaceOaId: 'oa-1' });
      expect(arg.data.status).toBe('DISCONNECTED');
      expect(arg.data.accessToken).toBeNull();
      expect(workspaceOa.update).not.toHaveBeenCalled();

      expect(tx.oaOAuthAttempt.updateMany).toHaveBeenCalledWith({
        where: { workspaceOaId: 'oa-1', consumedAt: null },
        data: { consumedAt: expect.any(Date) },
      });
    });
  });
});
