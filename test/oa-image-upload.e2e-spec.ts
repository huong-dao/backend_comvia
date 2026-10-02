import { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { OaConnectionStatus } from '@prisma/client';
import { rm } from 'fs/promises';
import { join } from 'path';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuditLogService } from './../src/audit-log/audit-log.service';
import { WorkspaceContextGuard } from './../src/common/guards/workspace-context.guard';
import { WorkspaceRolesGuard } from './../src/common/guards/workspace-roles.guard';
import { FileStorageService } from './../src/common/storage/file-storage.service';
import { OaProfileController } from './../src/oa/oa-profile.controller';
import { OaProfileService } from './../src/oa/oa-profile.service';
import { PrismaService } from './../src/prisma/prisma.service';

const WORKSPACE_ID = 'ws-e2e-oa';

/** Minimal valid PNG (header only) with the given dimensions; image-size reads IHDR. */
function makePng(width: number, height: number): Buffer {
  const signature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0);
  ihdr.write('IHDR', 4);
  ihdr.writeUInt32BE(width, 8);
  ihdr.writeUInt32BE(height, 12);
  ihdr[16] = 8;
  ihdr[17] = 6;
  return Buffer.concat([signature, ihdr]);
}

const profileRow = {
  id: 'oa-1',
  workspaceId: WORKSPACE_ID,
  name: 'My OA',
  code: 'INTERNAL-1',
  description: null,
  avatarUrl: null,
  logoLightUrl: null,
  logoDarkUrl: null,
  createdByUserId: 'user-1',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  connection: {
    status: OaConnectionStatus.NOT_CONNECTED,
    connectedAt: null,
    oaId: 'pending',
  },
};

const tx = {
  workspaceOa: {
    update: jest.fn((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...profileRow, ...args.data }),
    ),
  },
};

const prismaMock = {
  workspaceOa: {
    findUnique: jest.fn().mockResolvedValue({ id: 'oa-1' }),
  },
  $transaction: jest.fn((cb: (c: typeof tx) => unknown) => cb(tx)),
};

const auditMock = {
  write: jest.fn().mockResolvedValue({ id: 'audit-1' }),
};

describe('OA image upload (e2e, TICKET-011)', () => {
  let app: INestApplication<App>;
  const base = `/workspaces/${WORKSPACE_ID}/oa`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [OaProfileController],
      providers: [
        OaProfileService,
        FileStorageService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditLogService, useValue: auditMock },
      ],
    })
      .overrideGuard(WorkspaceContextGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          ctx.switchToHttp().getRequest<{ user?: unknown }>().user = {
            id: 'user-1',
          };
          return true;
        },
      })
      .overrideGuard(WorkspaceRolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(() => {
    prismaMock.workspaceOa.findUnique.mockResolvedValue({ id: 'oa-1' });
    tx.workspaceOa.update.mockClear();
  });

  afterAll(async () => {
    await app.close();
    await rm(join(process.cwd(), 'public', 'oa', WORKSPACE_ID), {
      recursive: true,
      force: true,
    });
  });

  it('uploads a 400x96 logo-light and stores a /public/oa URL', async () => {
    const res = await request(app.getHttpServer())
      .post(`${base}/logo-light`)
      .attach('file', makePng(400, 96), {
        filename: 'logo.png',
        contentType: 'image/png',
      })
      .expect(201);

    const body = res.body as { logoLightUrl: string };
    expect(body.logoLightUrl).toMatch(
      new RegExp(`^/public/oa/${WORKSPACE_ID}/\\d+_[0-9a-f]+\\.png$`),
    );
  });

  it('rejects a logo-light with wrong dimensions (400)', async () => {
    await request(app.getHttpServer())
      .post(`${base}/logo-light`)
      .attach('file', makePng(200, 50), {
        filename: 'bad.png',
        contentType: 'image/png',
      })
      .expect(400);
  });

  it('uploads an avatar of any size without 400x96 enforcement', async () => {
    const res = await request(app.getHttpServer())
      .post(`${base}/avatar`)
      .attach('file', makePng(123, 45), {
        filename: 'avatar.png',
        contentType: 'image/png',
      })
      .expect(201);

    const body = res.body as { avatarUrl: string };
    expect(body.avatarUrl).toMatch(new RegExp(`^/public/oa/${WORKSPACE_ID}/`));
  });

  it('rejects a disallowed mimetype (400)', async () => {
    await request(app.getHttpServer())
      .post(`${base}/avatar`)
      .attach('file', Buffer.from([0x47, 0x49, 0x46]), {
        filename: 'x.gif',
        contentType: 'image/gif',
      })
      .expect(400);
  });

  it('rejects upload when the OA profile does not exist (400)', async () => {
    prismaMock.workspaceOa.findUnique.mockResolvedValueOnce(null);

    await request(app.getHttpServer())
      .post(`${base}/logo-dark`)
      .attach('file', makePng(400, 96), {
        filename: 'logo.png',
        contentType: 'image/png',
      })
      .expect(400);
  });
});
