import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AdminService } from './admin.service';

describe('AdminService.impersonateWorkspaceOwner', () => {
  let service: AdminService;
  const prisma = { workspace: { findUnique: jest.fn() } };
  const jwtService = { signAsync: jest.fn() };
  const auditLogService = { write: jest.fn() };

  const baseWorkspace = {
    id: 'ws-1',
    name: 'Demo Workspace',
    slug: 'demo-workspace',
    status: 'ACTIVE',
    owner: {
      id: 'owner-1',
      email: 'owner@example.com',
      fullName: 'Owner Name',
      role: 'USER',
      status: 'ACTIVE',
      tokenVersion: 3,
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogService, useValue: auditLogService },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();
    service = module.get(AdminService);
  });

  it('signs a token for the real owner identity and audit-logs the action', async () => {
    prisma.workspace.findUnique.mockResolvedValue(baseWorkspace);
    jwtService.signAsync.mockResolvedValue('signed.jwt.token');

    const result = await service.impersonateWorkspaceOwner('admin-1', 'ws-1');

    expect(jwtService.signAsync).toHaveBeenCalledWith(
      {
        sub: 'owner-1',
        email: 'owner@example.com',
        role: 'USER',
        tokenVersion: 3,
        impersonatedBy: 'admin-1',
      },
      { expiresIn: '20m' },
    );
    expect(auditLogService.write).toHaveBeenCalledWith({
      actorUserId: 'admin-1',
      workspaceId: 'ws-1',
      action: 'workspace.admin_impersonated',
      resourceType: 'Workspace',
      resourceId: 'ws-1',
      metadataJson: {
        targetOwnerUserId: 'owner-1',
        targetOwnerEmail: 'owner@example.com',
        expiresInMinutes: 20,
      },
    });
    expect(result).toEqual({
      accessToken: 'signed.jwt.token',
      tokenType: 'Bearer',
      expiresInMinutes: 20,
      workspace: { id: 'ws-1', name: 'Demo Workspace', slug: 'demo-workspace' },
      owner: {
        id: 'owner-1',
        email: 'owner@example.com',
        fullName: 'Owner Name',
      },
    });
  });

  it('rejects when the workspace does not exist', async () => {
    prisma.workspace.findUnique.mockResolvedValue(null);

    await expect(
      service.impersonateWorkspaceOwner('admin-1', 'missing'),
    ).rejects.toThrow(BadRequestException);
    expect(jwtService.signAsync).not.toHaveBeenCalled();
    expect(auditLogService.write).not.toHaveBeenCalled();
  });

  it('rejects a non-active workspace', async () => {
    prisma.workspace.findUnique.mockResolvedValue({
      ...baseWorkspace,
      status: 'DISABLED',
    });

    await expect(
      service.impersonateWorkspaceOwner('admin-1', 'ws-1'),
    ).rejects.toThrow(BadRequestException);
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });

  it('rejects when the owner account is not active', async () => {
    prisma.workspace.findUnique.mockResolvedValue({
      ...baseWorkspace,
      owner: { ...baseWorkspace.owner, status: 'LOCKED' },
    });

    await expect(
      service.impersonateWorkspaceOwner('admin-1', 'ws-1'),
    ).rejects.toThrow(BadRequestException);
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });
});
