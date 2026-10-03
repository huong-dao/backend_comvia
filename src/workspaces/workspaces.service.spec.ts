import { BadRequestException } from '@nestjs/common';
import { BillingType, WorkspaceStatus } from '@prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { WorkspaceBillingFieldsDto } from './dto/workspace-billing-fields.dto';
import { WorkspacesService } from './workspaces.service';

/**
 * Covers TICKET-001 / ISSUE-001 / BR-WS-02 / BR-CORE-02:
 * INDIVIDUAL billing no longer requires taxCode; ORGANIZATION still does.
 * Validation lives in the (private) validateBillingOrThrow, exercised here
 * through its real callers create() and updateOwner() with Prisma mocked.
 */
describe('WorkspacesService billing validation', () => {
  const ownerUserId = 'user-1';
  const workspaceId = 'ws-1';

  let prisma: {
    workspace: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };
  let auditLog: { write: jest.Mock };
  let service: WorkspacesService;

  const individualBilling = (
    overrides: Partial<WorkspaceBillingFieldsDto> = {},
  ): WorkspaceBillingFieldsDto => ({
    billingType: BillingType.INDIVIDUAL,
    fullName: 'Nguyen Van A',
    citizenId: '012345678901',
    address: '123 Street, City',
    invoiceEmail: 'a@example.com',
    phone: '0900000000',
    ...overrides,
  });

  const organizationBilling = (
    overrides: Partial<WorkspaceBillingFieldsDto> = {},
  ): WorkspaceBillingFieldsDto => ({
    billingType: BillingType.ORGANIZATION,
    companyName: 'Acme Co',
    taxCode: '0101010101',
    address: '456 Avenue, City',
    invoiceEmail: 'billing@acme.example',
    ...overrides,
  });

  beforeEach(() => {
    prisma = {
      workspace: {
        create: jest.fn().mockResolvedValue({
          id: workspaceId,
          name: 'WS',
          slug: 'ws',
          billingProfile: { id: 'bp-1', billingType: BillingType.INDIVIDUAL },
          members: [],
        }),
        findUnique: jest.fn().mockResolvedValue({ ownerUserId }),
        update: jest.fn().mockResolvedValue({
          id: workspaceId,
          name: 'WS',
          slug: 'ws',
          billingProfile: { id: 'bp-1', billingType: BillingType.INDIVIDUAL },
        }),
      },
    };
    auditLog = { write: jest.fn().mockResolvedValue(undefined) };

    service = new WorkspacesService(
      prisma as unknown as PrismaService,
      auditLog as unknown as AuditLogService,
    );
  });

  it('creates INDIVIDUAL workspace without taxCode (201 path)', async () => {
    const dto: CreateWorkspaceDto = {
      name: 'My Workspace',
      billing: individualBilling(),
    };

    await expect(service.create(ownerUserId, dto)).resolves.toBeDefined();
    expect(prisma.workspace.create).toHaveBeenCalledTimes(1);
  });

  it('persists taxCode when an INDIVIDUAL provides it', async () => {
    const dto: CreateWorkspaceDto = {
      name: 'My Workspace',
      billing: individualBilling({ taxCode: '0101010101' }),
    };

    await service.create(ownerUserId, dto);

    const calls = prisma.workspace.create.mock.calls as Array<
      [{ data: { billingProfile: { create: { taxCode?: string } } } }]
    >;
    expect(calls[0][0].data.billingProfile.create.taxCode).toBe('0101010101');
  });

  it('updates INDIVIDUAL billing without taxCode', async () => {
    const dto: UpdateWorkspaceDto = {
      billing: individualBilling(),
    };

    await expect(
      service.updateOwner(ownerUserId, workspaceId, dto),
    ).resolves.toBeDefined();
    expect(prisma.workspace.update).toHaveBeenCalledTimes(1);
  });

  it('rejects ORGANIZATION billing missing taxCode', async () => {
    const dto: CreateWorkspaceDto = {
      name: 'Org Workspace',
      billing: organizationBilling({ taxCode: undefined }),
    };

    await expect(service.create(ownerUserId, dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.workspace.create).not.toHaveBeenCalled();
  });

  it.each([
    'fullName',
    'citizenId',
    'address',
    'invoiceEmail',
    'phone',
  ] as const)(
    'rejects INDIVIDUAL billing missing required field %s',
    async (field) => {
      const dto: CreateWorkspaceDto = {
        name: 'My Workspace',
        billing: individualBilling({ [field]: undefined }),
      };

      await expect(service.create(ownerUserId, dto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.workspace.create).not.toHaveBeenCalled();
    },
  );
});

/**
 * Covers TICKET-002 / ISSUE-007 / BR-WS-04 / BR-WS-05 (PO decision update):
 * Owner PATCH stays allowed while the workspace is ACTIVE, DISABLED or
 * SUSPENDED, and is rejected once it is DELETED with a clear message. The gate
 * lives in updateOwner itself (service layer), exercised here with Prisma
 * mocked — no database needed.
 */
describe('WorkspacesService updateOwner status gate (TICKET-002)', () => {
  const ownerUserId = 'user-1';
  const workspaceId = 'ws-1';

  let prisma: {
    workspace: { findUnique: jest.Mock; update: jest.Mock };
  };
  let service: WorkspacesService;

  beforeEach(() => {
    prisma = {
      workspace: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({
          id: workspaceId,
          name: 'WS',
          slug: 'ws',
          billingProfile: null,
        }),
      },
    };
    service = new WorkspacesService(
      prisma as unknown as PrismaService,
      {
        write: jest.fn().mockResolvedValue(undefined),
      } as unknown as AuditLogService,
    );
  });

  it.each([
    WorkspaceStatus.ACTIVE,
    WorkspaceStatus.DISABLED,
    WorkspaceStatus.SUSPENDED,
  ])('allows owner PATCH when status is %s', async (status) => {
    prisma.workspace.findUnique.mockResolvedValue({ ownerUserId, status });

    const dto: UpdateWorkspaceDto = { name: 'Renamed' };

    await expect(
      service.updateOwner(ownerUserId, workspaceId, dto),
    ).resolves.toBeDefined();
    expect(prisma.workspace.update).toHaveBeenCalledTimes(1);
  });

  it('rejects owner PATCH when the workspace is DELETED', async () => {
    prisma.workspace.findUnique.mockResolvedValue({
      ownerUserId,
      status: WorkspaceStatus.DELETED,
    });

    const dto: UpdateWorkspaceDto = { name: 'Renamed' };

    await expect(
      service.updateOwner(ownerUserId, workspaceId, dto),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.workspace.update).not.toHaveBeenCalled();
  });
});

/**
 * Covers TICKET-014 / ISSUE-008 / BR-WS-06:
 * getDetail returns the workspace core plus the full billing profile,
 * selecting only the prefill fields (never ownerUserId / invoicePdfAddress /
 * billing id / timestamps), tolerates a missing billing profile, and defends
 * against an unknown workspaceId with BadRequestException.
 */
describe('WorkspacesService getDetail (TICKET-014)', () => {
  const workspaceId = 'ws-1';

  let prisma: {
    workspace: { findUnique: jest.Mock };
  };
  let service: WorkspacesService;

  beforeEach(() => {
    prisma = {
      workspace: { findUnique: jest.fn() },
    };
    service = new WorkspacesService(
      prisma as unknown as PrismaService,
      { write: jest.fn() } as unknown as AuditLogService,
    );
  });

  it('returns core fields plus the full billing profile', async () => {
    const billingProfile = {
      billingType: BillingType.INDIVIDUAL,
      companyName: null,
      taxCode: null,
      address: '123 Street, City',
      invoiceEmail: 'a@example.com',
      representativeName: null,
      phone: '0900000000',
      fullName: 'Nguyen Van A',
      citizenId: '012345678901',
    };
    prisma.workspace.findUnique.mockResolvedValue({
      id: workspaceId,
      name: 'WS',
      slug: 'ws',
      status: 'ACTIVE',
      billingProfile,
    });

    const result = await service.getDetail(workspaceId);

    expect(result).toEqual({
      id: workspaceId,
      name: 'WS',
      slug: 'ws',
      status: 'ACTIVE',
      billingProfile,
    });
  });

  it('only selects prefill fields (no ownerUserId / invoicePdfAddress / id / timestamps)', async () => {
    prisma.workspace.findUnique.mockResolvedValue({
      id: workspaceId,
      name: 'WS',
      slug: 'ws',
      status: 'ACTIVE',
      billingProfile: null,
    });

    await service.getDetail(workspaceId);

    const calls = prisma.workspace.findUnique.mock.calls as Array<
      [
        {
          select: {
            ownerUserId?: unknown;
            billingProfile: { select: Record<string, unknown> };
          };
        },
      ]
    >;
    const args = calls[0][0];
    expect(args.select.ownerUserId).toBeUndefined();
    const billingSelect = args.select.billingProfile.select;
    expect(billingSelect.id).toBeUndefined();
    expect(billingSelect.workspaceId).toBeUndefined();
    expect(billingSelect.invoicePdfAddress).toBeUndefined();
    expect(billingSelect.createdAt).toBeUndefined();
    expect(billingSelect.updatedAt).toBeUndefined();
    expect(Object.keys(billingSelect).sort()).toEqual(
      [
        'address',
        'billingType',
        'citizenId',
        'companyName',
        'fullName',
        'invoiceEmail',
        'phone',
        'representativeName',
        'taxCode',
      ].sort(),
    );
  });

  it('returns billingProfile: null when the workspace has no billing profile', async () => {
    prisma.workspace.findUnique.mockResolvedValue({
      id: workspaceId,
      name: 'WS',
      slug: 'ws',
      status: 'ACTIVE',
      billingProfile: null,
    });

    const result = await service.getDetail(workspaceId);

    expect(result.billingProfile).toBeNull();
  });

  it('throws BadRequestException when the workspace is not found', async () => {
    prisma.workspace.findUnique.mockResolvedValue(null);

    await expect(service.getDetail(workspaceId)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
