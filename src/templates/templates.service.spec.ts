import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { TemplateCtaType, TemplateType, UserRole } from '@prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
import { SystemConfigService } from '../system-config/system-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { TemplatesService } from './templates.service';
import { CreateTemplateDto } from './dto/create-template.dto';

describe('TemplatesService.create OA-connection gate', () => {
  let service: TemplatesService;

  const workspaceOa = { findUnique: jest.fn() };
  const template = {
    create: jest.fn<unknown, [{ data: Record<string, unknown> }]>(),
  };
  const prisma = { workspaceOa, template };
  const auditLogService = { write: jest.fn() };

  const dto: CreateTemplateDto = {
    name: 'Welcome',
    content: 'Hello <name>',
    placeholdersJson: {},
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TemplatesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogService, useValue: auditLogService },
        {
          provide: SystemConfigService,
          useValue: {
            resolveCtaDefaultUnitPrice: jest.fn().mockResolvedValue(0),
          },
        },
      ],
    }).compile();

    service = module.get(TemplatesService);
  });

  it('throws when the OA profile exists but Zalo connection is not CONNECTED', async () => {
    workspaceOa.findUnique.mockResolvedValue({
      id: 'oa-1',
      connection: { status: 'NOT_CONNECTED' },
    });

    await expect(
      service.create('ws-1', 'user-1', UserRole.USER, dto),
    ).rejects.toThrow(BadRequestException);
    expect(template.create).not.toHaveBeenCalled();
  });

  it('throws when no OA profile exists', async () => {
    workspaceOa.findUnique.mockResolvedValue(null);

    await expect(
      service.create('ws-1', 'user-1', UserRole.USER, dto),
    ).rejects.toThrow(BadRequestException);
    expect(template.create).not.toHaveBeenCalled();
  });

  it('creates the template with oaConnectionId set to WorkspaceOa.id when CONNECTED', async () => {
    workspaceOa.findUnique.mockResolvedValue({
      id: 'oa-1',
      connection: { status: 'CONNECTED' },
    });
    template.create.mockResolvedValue({ id: 'tpl-1', oaConnectionId: 'oa-1' });

    await service.create('ws-1', 'user-1', UserRole.USER, dto);

    expect(template.create).toHaveBeenCalledTimes(1);
    expect(template.create.mock.calls[0][0].data.oaConnectionId).toBe('oa-1');
  });
});

describe('TemplatesService.create type-based validation (BR-TPL-01)', () => {
  let service: TemplatesService;

  const workspaceOa = { findUnique: jest.fn() };
  const template = {
    create: jest.fn<unknown, [{ data: Record<string, unknown> }]>(),
  };
  const prisma = { workspaceOa, template };
  const auditLogService = { write: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    workspaceOa.findUnique.mockResolvedValue({
      id: 'oa-1',
      connection: { status: 'CONNECTED' },
    });
    template.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: 'tpl-1', ...data }),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TemplatesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogService, useValue: auditLogService },
        {
          provide: SystemConfigService,
          useValue: {
            resolveCtaDefaultUnitPrice: jest.fn().mockResolvedValue(0),
          },
        },
      ],
    }).compile();

    service = module.get(TemplatesService);
  });

  it('rejects TEXT without content', async () => {
    const dto: CreateTemplateDto = {
      name: 'No content',
      type: TemplateType.TEXT,
      placeholdersJson: {},
    };

    await expect(
      service.create('ws-1', 'user-1', UserRole.USER, dto),
    ).rejects.toThrow(BadRequestException);
    expect(template.create).not.toHaveBeenCalled();
  });

  it('rejects TEXT without placeholdersJson', async () => {
    const dto: CreateTemplateDto = {
      name: 'No placeholders',
      type: TemplateType.TEXT,
      content: 'Hello',
    };

    await expect(
      service.create('ws-1', 'user-1', UserRole.USER, dto),
    ).rejects.toThrow(BadRequestException);
    expect(template.create).not.toHaveBeenCalled();
  });

  it('creates an OTP template with fixed placeholders and keeps otpExpiryMinutes', async () => {
    const dto: CreateTemplateDto = {
      name: 'OTP verify',
      type: TemplateType.OTP,
      otpExpiryMinutes: 5,
      placeholdersJson: { otp: 'string', phut: 'number' },
    };

    await service.create('ws-1', 'user-1', UserRole.USER, dto);

    expect(template.create).toHaveBeenCalledTimes(1);
    const data = template.create.mock.calls[0][0].data;
    expect(data.type).toBe(TemplateType.OTP);
    expect(data.content).toBeNull();
    expect(data.placeholdersJson).toEqual({ otp: 'string', phut: 'number' });
    expect(data.otpExpiryMinutes).toBe(5);
    expect(data.secondaryContent).toBeNull();
  });

  it('rejects OTP without otpExpiryMinutes', async () => {
    const dto: CreateTemplateDto = {
      name: 'OTP missing expiry',
      type: TemplateType.OTP,
    };

    await expect(
      service.create('ws-1', 'user-1', UserRole.USER, dto),
    ).rejects.toThrow(BadRequestException);
    expect(template.create).not.toHaveBeenCalled();
  });

  it('rejects OTP placeholders other than otp and phut', async () => {
    const dto: CreateTemplateDto = {
      name: 'OTP invalid placeholders',
      type: TemplateType.OTP,
      otpExpiryMinutes: 5,
      placeholdersJson: { otp: 'string', code: 'string' },
    };

    await expect(
      service.create('ws-1', 'user-1', UserRole.USER, dto),
    ).rejects.toThrow(BadRequestException);
    expect(template.create).not.toHaveBeenCalled();
  });

  it('creates a TABLE template storing secondaryContent', async () => {
    const dto: CreateTemplateDto = {
      name: 'Order table',
      type: TemplateType.TABLE,
      content: 'Order summary',
      secondaryContent: 'Extra rows',
      placeholdersJson: { orderId: 'string' },
    };

    await service.create('ws-1', 'user-1', UserRole.USER, dto);

    expect(template.create).toHaveBeenCalledTimes(1);
    const data = template.create.mock.calls[0][0].data;
    expect(data.type).toBe(TemplateType.TABLE);
    expect(data.secondaryContent).toBe('Extra rows');
    expect(data.content).toBe('Order summary');
  });

  it('defaults to TEXT when type is omitted', async () => {
    const dto: CreateTemplateDto = {
      name: 'Legacy create',
      content: 'Hi',
      placeholdersJson: {},
    };

    await service.create('ws-1', 'user-1', UserRole.USER, dto);

    expect(template.create).toHaveBeenCalledTimes(1);
    expect(template.create.mock.calls[0][0].data.type).toBe(TemplateType.TEXT);
  });
});

describe('TemplatesService CTA buttons', () => {
  let service: TemplatesService;
  const workspaceOa = { findUnique: jest.fn() };
  const template = { create: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    workspaceOa.findUnique.mockResolvedValue({
      id: 'oa-1',
      connection: { status: 'CONNECTED' },
    });
    template.create.mockImplementation(({ data }) => Promise.resolve(data));
    const module = await Test.createTestingModule({
      providers: [
        TemplatesService,
        { provide: PrismaService, useValue: { workspaceOa, template } },
        { provide: AuditLogService, useValue: { write: jest.fn() } },
        {
          provide: SystemConfigService,
          useValue: {
            resolveCtaDefaultUnitPrice: jest.fn().mockResolvedValue(0),
          },
        },
      ],
    }).compile();
    service = module.get(TemplatesService);
  });

  it('stores up to two CTA buttons in their declared positions', async () => {
    await service.create('ws-1', 'user-1', UserRole.USER, {
      name: 'CTA template',
      content: 'Hello',
      placeholdersJson: {},
      ctaButtons: [
        {
          type: TemplateCtaType.OA_PROFILE,
          position: 0,
        },
        {
          type: TemplateCtaType.BUSINESS_WEBSITE,
          target: 'https://example.com',
          position: 1,
        },
      ],
    });

    expect(template.create.mock.calls[0][0].data.ctaButtons.create).toEqual([
      expect.objectContaining({
        type: TemplateCtaType.OA_PROFILE,
        position: 0,
      }),
      expect.objectContaining({
        type: TemplateCtaType.BUSINESS_WEBSITE,
        target: 'https://example.com',
        position: 1,
      }),
    ]);
  });

  it('rejects a CTA unit price from a workspace user', async () => {
    await expect(
      service.create('ws-1', 'user-1', UserRole.USER, {
        name: 'Priced CTA',
        content: 'Hello',
        placeholdersJson: {},
        ctaButtons: [
          {
            type: TemplateCtaType.OA_PROFILE,
            position: 0,
            unitPrice: 100,
          },
        ],
      }),
    ).rejects.toThrow('Only platform admin can set CTA unit price');
  });
});

describe('TemplatesService.list', () => {
  let service: TemplatesService;
  const template = { findMany: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        TemplatesService,
        { provide: PrismaService, useValue: { template } },
        { provide: AuditLogService, useValue: { write: jest.fn() } },
        {
          provide: SystemConfigService,
          useValue: {
            resolveCtaDefaultUnitPrice: jest.fn().mockResolvedValue(0),
          },
        },
      ],
    }).compile();
    service = module.get(TemplatesService);
  });

  it('returns an empty list for a workspace without templates', async () => {
    template.findMany.mockResolvedValue([]);

    await expect(
      service.list('workspace-empty', UserRole.USER),
    ).resolves.toEqual([]);
    expect(template.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: 'workspace-empty' },
      }),
    );
  });

  it('selects template content in the list response', async () => {
    template.findMany.mockResolvedValue([]);

    await service.list('workspace-1', UserRole.USER);

    const [args] = template.findMany.mock.calls[0] as [
      { select: { content: boolean } },
    ];
    expect(args.select.content).toBe(true);
  });

  it('keeps the list available while the CTA-table migration is pending', async () => {
    template.findMany
      .mockRejectedValueOnce({
        code: 'P2021',
        meta: { table: 'public.TemplateCtaButton' },
      })
      .mockResolvedValueOnce([
        {
          id: 'template-1',
          name: 'Welcome',
          code: '100001',
          type: TemplateType.TEXT,
        },
      ]);

    await expect(service.list('workspace-1', UserRole.USER)).resolves.toEqual([
      {
        id: 'template-1',
        name: 'Welcome',
        code: '100001',
        type: TemplateType.TEXT,
        ctaButtons: [],
      },
    ]);
    expect(template.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { workspaceId: 'workspace-1' },
      }),
    );
  });
});

describe('TemplatesService.staffGetTemplate', () => {
  let service: TemplatesService;
  const template = { findUnique: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        TemplatesService,
        { provide: PrismaService, useValue: { template } },
        { provide: AuditLogService, useValue: { write: jest.fn() } },
        {
          provide: SystemConfigService,
          useValue: {
            resolveCtaDefaultUnitPrice: jest.fn().mockResolvedValue(0),
          },
        },
      ],
    }).compile();
    service = module.get(TemplatesService);
  });

  it('returns complete, position-ordered CTA buttons for internal review', async () => {
    template.findUnique.mockResolvedValue({
      id: 'template-1',
      oaConnection: {
        id: 'workspace-oa-1',
        connection: {
          oaId: 'oa-1',
          oaName: 'Shop OA',
          status: 'CONNECTED',
          connectedAt: new Date('2026-10-20T00:00:00.000Z'),
          tokenExpiredAt: null,
        },
      },
      ctaButtons: [
        {
          id: 'cta-1',
          type: TemplateCtaType.BUSINESS_WEBSITE,
          label: 'Xem chi tiết',
          target: 'https://example.com/order/123',
          position: 0,
          defaultUnitPrice: 100,
          unitPrice: null,
        },
      ],
    });

    await expect(service.staffGetTemplate('template-1')).resolves.toMatchObject(
      {
        id: 'template-1',
        ctaButtons: [
          {
            id: 'cta-1',
            type: TemplateCtaType.BUSINESS_WEBSITE,
            label: 'Xem chi tiết',
            target: 'https://example.com/order/123',
            position: 0,
          },
        ],
      },
    );
    expect(template.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'template-1' },
        select: expect.objectContaining({
          ctaButtons: {
            orderBy: { position: 'asc' },
            select: expect.objectContaining({
              id: true,
              type: true,
              label: true,
              target: true,
              position: true,
            }),
          },
        }),
      }),
    );
  });
});

describe('TemplatesService revision workflow', () => {
  let service: TemplatesService;
  const template = { findFirst: jest.fn(), findUnique: jest.fn() };
  const tx = {
    templateSubmissionLog: { create: jest.fn() },
    template: { update: jest.fn() },
  };
  const prisma = {
    template,
    $transaction: jest.fn((callback) => callback(tx)),
  };
  const auditLogService = { write: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        TemplatesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogService, useValue: auditLogService },
        {
          provide: SystemConfigService,
          useValue: { resolveCtaDefaultUnitPrice: jest.fn() },
        },
      ],
    }).compile();
    service = module.get(TemplatesService);
  });

  it('submits DRAFT to SUBMITTED and clears revision state', async () => {
    template.findFirst.mockResolvedValue({
      id: 'tpl-1',
      status: 'DRAFT',
      requiresOwnerRevision: false,
      name: 'Welcome',
      code: '100001',
    });
    tx.template.update.mockResolvedValue({ status: 'SUBMITTED' });

    await service.submit('ws-1', 'tpl-1', 'owner-1');

    expect(tx.template.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'SUBMITTED',
          requiresOwnerRevision: false,
          revisionReason: null,
          returnedForRevisionAt: null,
        }),
      }),
    );
  });

  it('rejects submit while SUBMITTED is being processed by staff', async () => {
    template.findFirst.mockResolvedValue({
      id: 'tpl-1',
      status: 'SUBMITTED',
      requiresOwnerRevision: false,
      name: 'Welcome',
      code: '100001',
    });

    await expect(service.submit('ws-1', 'tpl-1', 'owner-1')).rejects.toThrow(
      ConflictException,
    );
  });

  it('returns a pending template to owner revision and records an audit event', async () => {
    template.findUnique.mockResolvedValue({
      id: 'tpl-1',
      workspaceId: 'ws-1',
      oaConnectionId: 'oa-1',
      status: 'PENDING_ZALO_APPROVAL',
      requiresOwnerRevision: false,
    });
    tx.template.update.mockResolvedValue({
      id: 'tpl-1',
      status: 'SUBMITTED',
      requiresOwnerRevision: true,
    });

    await service.staffReturnToSubmitted('tpl-1', 'staff-1', {
      reason: 'Zalo requires a content correction',
    });

    expect(tx.template.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'SUBMITTED',
          requiresOwnerRevision: true,
          revisionReason: 'Zalo requires a content correction',
          returnedForRevisionAt: expect.any(Date),
        }),
      }),
    );
    expect(auditLogService.write).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'template.returned_for_revision' }),
    );
  });
});
