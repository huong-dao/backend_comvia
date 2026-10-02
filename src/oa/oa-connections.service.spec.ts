import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { AuditLogService } from '../audit-log/audit-log.service';
import { ZaloOAuthClient } from '../integrations/zalo/zalo-oauth.client';
import { PrismaService } from '../prisma/prisma.service';
import { OaConnectionsService } from './oa-connections.service';

describe('OaConnectionsService (workspaceOaId refactor)', () => {
  let service: OaConnectionsService;

  type UpdateArg = {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  };

  const workspaceOa = {
    findUnique: jest.fn(),
    update: jest.fn(),
  };
  const workspaceOaConnection = {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn<unknown, [UpdateArg]>(),
  };
  const tx = {
    workspaceOaConnection: { update: jest.fn<unknown, [UpdateArg]>() },
  };
  const prisma = {
    workspaceOa,
    workspaceOaConnection,
    $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
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
          oauthCodeVerifier: 'secret-verifier',
          connectedAt: new Date('2026-01-01'),
        },
      });

      const result = (await service.getStatus('ws-1')) as Record<
        string,
        unknown
      >;

      expect(result.accessToken).toBeUndefined();
      expect(result.refreshToken).toBeUndefined();
      expect(result.oauthCodeVerifier).toBeUndefined();
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
      expect(workspaceOaConnection.update).not.toHaveBeenCalled();
    });

    it('arms OAuth state on the existing connection via workspaceOaId', async () => {
      workspaceOa.findUnique.mockResolvedValue({
        id: 'oa-1',
        connection: { id: 'conn-1' },
      });
      workspaceOaConnection.update.mockResolvedValue({ id: 'conn-1' });

      const result = await service.startConnect('ws-1', 'user-1');

      expect(workspaceOaConnection.update).toHaveBeenCalledTimes(1);
      const arg = workspaceOaConnection.update.mock.calls[0][0];
      expect(arg.where).toEqual({ workspaceOaId: 'oa-1' });
      expect(typeof arg.data.oauthState).toBe('string');
      expect(typeof arg.data.oauthCodeVerifier).toBe('string');
      expect(arg.data.status).toBe('NOT_CONNECTED');
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

    it('resolves workspaceId via the connection -> workspaceOa join', async () => {
      workspaceOaConnection.findFirst.mockResolvedValue({
        workspaceOa: { workspaceId: 'ws-9' },
      });

      expect(await service.resolveWorkspaceIdByOAuthState('st')).toBe('ws-9');
    });
  });

  describe('handleOAuthCallback', () => {
    beforeEach(() => {
      workspaceOaConnection.findFirst.mockResolvedValue({
        id: 'conn-1',
        oaId: 'pending',
        oaName: null,
        oauthCodeVerifier: 'verifier',
        workspaceOa: { workspaceId: 'ws-1' },
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
    });

    it('writes audit with the workspaceId resolved from the profile', async () => {
      await service.handleOAuthCallback({ code: 'code', state: 'state' });

      expect(auditLogService.write).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: 'ws-1' }),
      );
    });

    it('throws when the OAuth state is invalid/expired', async () => {
      workspaceOaConnection.findFirst.mockResolvedValue(null);

      await expect(
        service.handleOAuthCallback({ code: 'c', state: 's' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('disconnect', () => {
    it('is a no-op when no connection exists', async () => {
      workspaceOa.findUnique.mockResolvedValue(null);

      expect(await service.disconnect('ws-1', 'user-1')).toEqual({ ok: true });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('clears tokens and sets DISCONNECTED keyed by workspaceOaId', async () => {
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
    });
  });
});
