import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OaConnectionStatus } from '@prisma/client';
import { AUDIT_ACTIONS } from '../audit-log/audit-log.constants';
import { AuditLogService } from '../audit-log/audit-log.service';
import { FileStorageService } from '../common/storage/file-storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { OaProfileService } from './oa-profile.service';

type TxClient = {
  workspaceOa: { create: jest.Mock; update: jest.Mock };
};

type PrismaQueryArg = {
  where?: Record<string, unknown>;
  data?: Record<string, unknown> & {
    connection?: { create?: Record<string, unknown> };
  };
  select?: {
    connection?: { select?: Record<string, boolean> };
  } & Record<string, unknown>;
};

const firstArg = (mock: jest.Mock): PrismaQueryArg => {
  const calls = mock.mock.calls as unknown[][];
  return (calls[0]?.[0] ?? {}) as PrismaQueryArg;
};

describe('OaProfileService', () => {
  let service: OaProfileService;
  let prisma: {
    workspaceOa: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let tx: TxClient;
  let auditLog: { write: jest.Mock };
  let fileStorage: {
    assertMimeAllowed: jest.Mock;
    assertSizeWithinLimit: jest.Mock;
    assertImageDimensions: jest.Mock;
    saveImage: jest.Mock;
  };

  const WORKSPACE_ID = 'ws-1';
  const USER_ID = 'user-1';

  const profileRow = {
    id: 'oa-1',
    workspaceId: WORKSPACE_ID,
    name: 'My OA',
    code: 'INTERNAL-1',
    description: 'desc',
    avatarUrl: null,
    logoLightUrl: null,
    logoDarkUrl: null,
    createdByUserId: USER_ID,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    connection: {
      status: OaConnectionStatus.NOT_CONNECTED,
      connectedAt: null,
      oaId: 'pending',
    },
  };

  beforeEach(() => {
    tx = {
      workspaceOa: { create: jest.fn(), update: jest.fn() },
    };
    prisma = {
      workspaceOa: { findUnique: jest.fn() },
      $transaction: jest.fn((cb: (c: TxClient) => unknown) => cb(tx)),
    };
    auditLog = { write: jest.fn().mockResolvedValue({ id: 'audit-1' }) };
    fileStorage = {
      assertMimeAllowed: jest.fn(),
      assertSizeWithinLimit: jest.fn(),
      assertImageDimensions: jest.fn(),
      saveImage: jest.fn().mockResolvedValue('/public/oa/ws-1/123_abcd.png'),
    };

    service = new OaProfileService(
      prisma as unknown as PrismaService,
      auditLog as unknown as AuditLogService,
      fileStorage as unknown as FileStorageService,
    );
  });

  describe('createProfile', () => {
    it('creates WorkspaceOa + empty NOT_CONNECTED connection with createdByUserId and audits OA_CREATED', async () => {
      prisma.workspaceOa.findUnique.mockResolvedValue(null);
      tx.workspaceOa.create.mockResolvedValue(profileRow);

      const result = await service.createProfile(WORKSPACE_ID, USER_ID, {
        name: 'My OA',
        code: 'INTERNAL-1',
        description: 'desc',
      });

      const createArg = firstArg(tx.workspaceOa.create);
      expect(createArg.data).toMatchObject({
        workspaceId: WORKSPACE_ID,
        name: 'My OA',
        code: 'INTERNAL-1',
        description: 'desc',
        createdByUserId: USER_ID,
      });
      expect(createArg.data?.connection?.create).toEqual({
        oaId: 'pending',
        status: OaConnectionStatus.NOT_CONNECTED,
      });

      expect(auditLog.write).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AUDIT_ACTIONS.OA_CREATED,
          actorUserId: USER_ID,
          workspaceId: WORKSPACE_ID,
          resourceId: 'oa-1',
          tx,
        }),
      );

      expect(result.connection).toEqual({
        status: OaConnectionStatus.NOT_CONNECTED,
        connectedAt: null,
        oaId: 'pending',
      });
    });

    it('rejects a second OA for the same workspace (1-1 hard enforce)', async () => {
      prisma.workspaceOa.findUnique.mockResolvedValue({ id: 'oa-1' });

      await expect(
        service.createProfile(WORKSPACE_ID, USER_ID, {
          name: 'Another',
          code: 'X',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tx.workspaceOa.create).not.toHaveBeenCalled();
    });

    it('never selects token / oauth fields of the connection in the create query', async () => {
      prisma.workspaceOa.findUnique.mockResolvedValue(null);
      tx.workspaceOa.create.mockResolvedValue(profileRow);

      await service.createProfile(WORKSPACE_ID, USER_ID, {
        name: 'My OA',
        code: 'INTERNAL-1',
      });

      const connectionSelect =
        firstArg(tx.workspaceOa.create).select?.connection?.select ?? {};
      expect(connectionSelect).toEqual({
        status: true,
        connectedAt: true,
        oaId: true,
      });
      expect(connectionSelect.accessToken).toBeUndefined();
      expect(connectionSelect.refreshToken).toBeUndefined();
      expect(connectionSelect.oauthCodeVerifier).toBeUndefined();
    });
  });

  describe('updateProfile', () => {
    it('updates only provided fields, does not touch the connection, audits OA_UPDATED', async () => {
      prisma.workspaceOa.findUnique.mockResolvedValue({ id: 'oa-1' });
      tx.workspaceOa.update.mockResolvedValue({
        ...profileRow,
        name: 'Renamed',
      });

      await service.updateProfile(WORKSPACE_ID, USER_ID, { name: 'Renamed' });

      const updateArg = firstArg(tx.workspaceOa.update);
      expect(updateArg.where).toEqual({ workspaceId: WORKSPACE_ID });
      expect(updateArg.data).toEqual({ name: 'Renamed' });
      expect(updateArg.data).not.toHaveProperty('connection');

      expect(auditLog.write).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AUDIT_ACTIONS.OA_UPDATED,
          resourceId: 'oa-1',
          tx,
        }),
      );
    });

    it('throws NotFound when the workspace has no OA profile', async () => {
      prisma.workspaceOa.findUnique.mockResolvedValue(null);

      await expect(
        service.updateProfile(WORKSPACE_ID, USER_ID, { name: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('getProfile', () => {
    it('returns profile + connection status without token fields', async () => {
      prisma.workspaceOa.findUnique.mockResolvedValue(profileRow);

      const result = await service.getProfile(WORKSPACE_ID);

      const selectArg = firstArg(prisma.workspaceOa.findUnique).select ?? {};
      expect(selectArg).not.toHaveProperty('accessToken');
      expect(selectArg.connection?.select).toEqual({
        status: true,
        connectedAt: true,
        oaId: true,
      });

      expect(result).toMatchObject({
        id: 'oa-1',
        name: 'My OA',
        createdByUserId: USER_ID,
        connection: {
          status: OaConnectionStatus.NOT_CONNECTED,
          oaId: 'pending',
        },
      });
      expect(result).not.toHaveProperty('accessToken');
    });

    it('defaults connection to NOT_CONNECTED when the join is null', async () => {
      prisma.workspaceOa.findUnique.mockResolvedValue({
        ...profileRow,
        connection: null,
      });

      const result = await service.getProfile(WORKSPACE_ID);

      expect(result.connection).toEqual({
        status: OaConnectionStatus.NOT_CONNECTED,
        connectedAt: null,
        oaId: null,
      });
    });

    it('throws NotFound when there is no OA profile', async () => {
      prisma.workspaceOa.findUnique.mockResolvedValue(null);

      await expect(service.getProfile(WORKSPACE_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('image upload', () => {
    const pngFile = {
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      mimetype: 'image/png',
      size: 4,
    };

    it('uploadLogoLight enforces 400x96, saves, updates logoLightUrl and audits OA_UPDATED', async () => {
      prisma.workspaceOa.findUnique.mockResolvedValue({ id: 'oa-1' });
      fileStorage.saveImage.mockResolvedValue('/public/oa/ws-1/logo-light.png');
      tx.workspaceOa.update.mockResolvedValue({
        ...profileRow,
        logoLightUrl: '/public/oa/ws-1/logo-light.png',
      });

      const result = await service.uploadLogoLight(
        WORKSPACE_ID,
        USER_ID,
        pngFile,
      );

      expect(fileStorage.assertImageDimensions).toHaveBeenCalledWith(
        pngFile.buffer,
        { width: 400, height: 96 },
      );
      expect(fileStorage.saveImage).toHaveBeenCalledWith(
        'oa',
        WORKSPACE_ID,
        pngFile.buffer,
        'png',
      );

      const updateArg = firstArg(tx.workspaceOa.update);
      expect(updateArg.where).toEqual({ workspaceId: WORKSPACE_ID });
      expect(updateArg.data).toEqual({
        logoLightUrl: '/public/oa/ws-1/logo-light.png',
      });
      expect(auditLog.write).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AUDIT_ACTIONS.OA_UPDATED,
          resourceId: 'oa-1',
          metadataJson: { changedFields: ['logoLightUrl'] },
          tx,
        }),
      );
      expect(result.logoLightUrl).toBe('/public/oa/ws-1/logo-light.png');
    });

    it('does not write the file when logo dimensions are wrong', async () => {
      prisma.workspaceOa.findUnique.mockResolvedValue({ id: 'oa-1' });
      fileStorage.assertImageDimensions.mockImplementation(() => {
        throw new BadRequestException('bad dimensions');
      });

      await expect(
        service.uploadLogoDark(WORKSPACE_ID, USER_ID, pngFile),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(fileStorage.saveImage).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('uploadAvatar does not enforce 400x96 dimensions', async () => {
      prisma.workspaceOa.findUnique.mockResolvedValue({ id: 'oa-1' });
      fileStorage.saveImage.mockResolvedValue('/public/oa/ws-1/avatar.png');
      tx.workspaceOa.update.mockResolvedValue({
        ...profileRow,
        avatarUrl: '/public/oa/ws-1/avatar.png',
      });

      const result = await service.uploadAvatar(WORKSPACE_ID, USER_ID, pngFile);

      expect(fileStorage.assertImageDimensions).not.toHaveBeenCalled();
      expect(firstArg(tx.workspaceOa.update).data).toEqual({
        avatarUrl: '/public/oa/ws-1/avatar.png',
      });
      expect(result.avatarUrl).toBe('/public/oa/ws-1/avatar.png');
    });

    it('rejects a disallowed mimetype before saving', async () => {
      prisma.workspaceOa.findUnique.mockResolvedValue({ id: 'oa-1' });
      fileStorage.assertMimeAllowed.mockImplementation(() => {
        throw new BadRequestException('bad mime');
      });

      await expect(
        service.uploadAvatar(WORKSPACE_ID, USER_ID, {
          buffer: Buffer.from([0x01]),
          mimetype: 'image/gif',
          size: 1,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(fileStorage.saveImage).not.toHaveBeenCalled();
    });

    it('rejects upload when the OA profile does not exist yet', async () => {
      prisma.workspaceOa.findUnique.mockResolvedValue(null);

      await expect(
        service.uploadAvatar(WORKSPACE_ID, USER_ID, pngFile),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(fileStorage.assertMimeAllowed).not.toHaveBeenCalled();
      expect(fileStorage.saveImage).not.toHaveBeenCalled();
    });

    it('rejects when no file is provided', async () => {
      await expect(
        service.uploadAvatar(WORKSPACE_ID, USER_ID, {
          buffer: Buffer.alloc(0),
          mimetype: 'image/png',
          size: 0,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.workspaceOa.findUnique).not.toHaveBeenCalled();
    });
  });
});
