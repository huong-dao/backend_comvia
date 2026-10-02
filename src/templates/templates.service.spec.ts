import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { Prisma, TemplateType } from '@prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
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
      ],
    }).compile();

    service = module.get(TemplatesService);
  });

  it('throws when the OA profile exists but Zalo connection is not CONNECTED', async () => {
    workspaceOa.findUnique.mockResolvedValue({
      id: 'oa-1',
      connection: { status: 'NOT_CONNECTED' },
    });

    await expect(service.create('ws-1', 'user-1', dto)).rejects.toThrow(
      BadRequestException,
    );
    expect(template.create).not.toHaveBeenCalled();
  });

  it('throws when no OA profile exists', async () => {
    workspaceOa.findUnique.mockResolvedValue(null);

    await expect(service.create('ws-1', 'user-1', dto)).rejects.toThrow(
      BadRequestException,
    );
    expect(template.create).not.toHaveBeenCalled();
  });

  it('creates the template with oaConnectionId set to WorkspaceOa.id when CONNECTED', async () => {
    workspaceOa.findUnique.mockResolvedValue({
      id: 'oa-1',
      connection: { status: 'CONNECTED' },
    });
    template.create.mockResolvedValue({ id: 'tpl-1', oaConnectionId: 'oa-1' });

    await service.create('ws-1', 'user-1', dto);

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

    await expect(service.create('ws-1', 'user-1', dto)).rejects.toThrow(
      BadRequestException,
    );
    expect(template.create).not.toHaveBeenCalled();
  });

  it('rejects TEXT without placeholdersJson', async () => {
    const dto: CreateTemplateDto = {
      name: 'No placeholders',
      type: TemplateType.TEXT,
      content: 'Hello',
    };

    await expect(service.create('ws-1', 'user-1', dto)).rejects.toThrow(
      BadRequestException,
    );
    expect(template.create).not.toHaveBeenCalled();
  });

  it('creates an OTP template with null content/placeholders and keeps otpExpiryMinutes', async () => {
    const dto: CreateTemplateDto = {
      name: 'OTP verify',
      type: TemplateType.OTP,
      otpExpiryMinutes: 5,
    };

    await service.create('ws-1', 'user-1', dto);

    expect(template.create).toHaveBeenCalledTimes(1);
    const data = template.create.mock.calls[0][0].data;
    expect(data.type).toBe(TemplateType.OTP);
    expect(data.content).toBeNull();
    expect(data.placeholdersJson).toBe(Prisma.DbNull);
    expect(data.otpExpiryMinutes).toBe(5);
    expect(data.secondaryContent).toBeNull();
  });

  it('rejects OTP without otpExpiryMinutes', async () => {
    const dto: CreateTemplateDto = {
      name: 'OTP missing expiry',
      type: TemplateType.OTP,
    };

    await expect(service.create('ws-1', 'user-1', dto)).rejects.toThrow(
      BadRequestException,
    );
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

    await service.create('ws-1', 'user-1', dto);

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

    await service.create('ws-1', 'user-1', dto);

    expect(template.create).toHaveBeenCalledTimes(1);
    expect(template.create.mock.calls[0][0].data.type).toBe(TemplateType.TEXT);
  });
});
