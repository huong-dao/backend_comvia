import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OaConnectionStatus, Prisma } from '@prisma/client';
import {
  AUDIT_ACTIONS,
  AUDIT_RESOURCE_TYPES,
} from '../audit-log/audit-log.constants';
import { AuditLogService } from '../audit-log/audit-log.service';
import { FileStorageService } from '../common/storage/file-storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOaDto } from './dto/create-oa.dto';
import { UpdateOaDto } from './dto/update-oa.dto';

/** oaId placeholder trên connection rỗng trước khi OAuth Zalo hoàn tất (ADR-001). */
const PENDING_OA_ID = 'pending';

/** Ảnh OA chỉ nhận png/jpeg (ADR-002). */
const ALLOWED_IMAGE_MIMES = ['image/png', 'image/jpeg'];

/** Giới hạn dung lượng mỗi ảnh OA (TICKET-009). */
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/** logoLight/logoDark phải đúng 400x96 (ISSUE-003, BR-OA-05). */
const LOGO_DIMENSIONS = { width: 400, height: 96 };

/** Mimetype → đuôi file khi ghi ảnh OA xuống đĩa. */
const MIME_EXTENSION: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
};

/** Cột URL ảnh trên WorkspaceOa mà upload ghi vào. */
type OaImageField = 'avatarUrl' | 'logoLightUrl' | 'logoDarkUrl';

/** Phần file Multer (memory storage) mà service cần để validate + lưu ảnh. */
export interface UploadedImageFile {
  buffer: Buffer;
  mimetype?: string;
  size?: number;
}

/** Field profile trả cho client; token/oauth* của connection bị loại tuyệt đối. */
const PROFILE_SELECT = {
  id: true,
  workspaceId: true,
  name: true,
  code: true,
  description: true,
  avatarUrl: true,
  logoLightUrl: true,
  logoDarkUrl: true,
  createdByUserId: true,
  createdAt: true,
  updatedAt: true,
  connection: {
    select: {
      status: true,
      connectedAt: true,
      oaId: true,
    },
  },
} satisfies Prisma.WorkspaceOaSelect;

@Injectable()
export class OaProfileService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly fileStorageService: FileStorageService,
  ) {}

  /** GET: box "Thông tin OA" — profile + trạng thái kết nối (BR-OA-05). */
  async getProfile(workspaceId: string) {
    const profile = await this.prismaService.workspaceOa.findUnique({
      where: { workspaceId },
      select: PROFILE_SELECT,
    });

    if (!profile) {
      throw new NotFoundException('OA profile not found for this workspace');
    }

    return this.toView(profile);
  }

  /** POST "Tạo OA": tạo WorkspaceOa + connection rỗng NOT_CONNECTED, enforce 1-1 cứng (BR-OA-01). */
  async createProfile(
    workspaceId: string,
    actorUserId: string,
    dto: CreateOaDto,
  ) {
    const existing = await this.prismaService.workspaceOa.findUnique({
      where: { workspaceId },
      select: { id: true },
    });

    if (existing) {
      throw new BadRequestException('Workspace already has an OA');
    }

    const profile = await this.prismaService.$transaction(async (tx) => {
      const created = await tx.workspaceOa.create({
        data: {
          workspaceId,
          name: dto.name,
          code: dto.code,
          description: dto.description ?? null,
          createdByUserId: actorUserId,
          connection: {
            create: {
              oaId: PENDING_OA_ID,
              status: OaConnectionStatus.NOT_CONNECTED,
            },
          },
        },
        select: PROFILE_SELECT,
      });

      await this.auditLogService.write({
        actorUserId,
        workspaceId,
        action: AUDIT_ACTIONS.OA_CREATED,
        resourceType: AUDIT_RESOURCE_TYPES.WORKSPACE_OA,
        resourceId: created.id,
        metadataJson: { name: created.name, code: created.code },
        tx,
      });

      return created;
    });

    return this.toView(profile);
  }

  /** PATCH: sửa name/code/description; không chạm bảng connection (BR-OA-05). */
  async updateProfile(
    workspaceId: string,
    actorUserId: string,
    dto: UpdateOaDto,
  ) {
    const existing = await this.prismaService.workspaceOa.findUnique({
      where: { workspaceId },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('OA profile not found for this workspace');
    }

    const data: Prisma.WorkspaceOaUpdateInput = {};
    if (dto.name !== undefined) {
      data.name = dto.name;
    }
    if (dto.code !== undefined) {
      data.code = dto.code;
    }
    if (dto.description !== undefined) {
      data.description = dto.description;
    }

    const profile = await this.prismaService.$transaction(async (tx) => {
      const updated = await tx.workspaceOa.update({
        where: { workspaceId },
        data,
        select: PROFILE_SELECT,
      });

      await this.auditLogService.write({
        actorUserId,
        workspaceId,
        action: AUDIT_ACTIONS.OA_UPDATED,
        resourceType: AUDIT_RESOURCE_TYPES.WORKSPACE_OA,
        resourceId: updated.id,
        metadataJson: { changedFields: Object.keys(data) },
        tx,
      });

      return updated;
    });

    return this.toView(profile);
  }

  /** Upload avatar: chỉ ép mime + dung lượng, không ép 400x96 (TICKET-011). */
  uploadAvatar(
    workspaceId: string,
    actorUserId: string,
    file: UploadedImageFile,
  ) {
    return this.uploadImage(workspaceId, actorUserId, 'avatarUrl', file, false);
  }

  /** Upload logo nền sáng: ép mime + dung lượng + đúng 400x96. */
  uploadLogoLight(
    workspaceId: string,
    actorUserId: string,
    file: UploadedImageFile,
  ) {
    return this.uploadImage(
      workspaceId,
      actorUserId,
      'logoLightUrl',
      file,
      true,
    );
  }

  /** Upload logo nền tối: ép mime + dung lượng + đúng 400x96. */
  uploadLogoDark(
    workspaceId: string,
    actorUserId: string,
    file: UploadedImageFile,
  ) {
    return this.uploadImage(
      workspaceId,
      actorUserId,
      'logoDarkUrl',
      file,
      true,
    );
  }

  /**
   * Validate ảnh (mime → dung lượng → kích thước nếu là logo) TRƯỚC khi ghi file,
   * lưu qua FileStorageService, cập nhật cột URL + audit OA_UPDATED (BR-AUDIT-01).
   * Chỉ chạy khi OA profile đã tồn tại; chưa có → BadRequestException (TICKET-011).
   */
  private async uploadImage(
    workspaceId: string,
    actorUserId: string,
    field: OaImageField,
    file: UploadedImageFile,
    enforceLogoDimensions: boolean,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Image file is required');
    }

    const existing = await this.prismaService.workspaceOa.findUnique({
      where: { workspaceId },
      select: { id: true },
    });

    if (!existing) {
      throw new BadRequestException(
        'OA must be created before uploading images',
      );
    }

    const mimetype = file.mimetype ?? '';
    this.fileStorageService.assertMimeAllowed(mimetype, ALLOWED_IMAGE_MIMES);
    this.fileStorageService.assertSizeWithinLimit(
      file.size ?? file.buffer.length,
      MAX_IMAGE_BYTES,
    );
    if (enforceLogoDimensions) {
      this.fileStorageService.assertImageDimensions(
        file.buffer,
        LOGO_DIMENSIONS,
      );
    }

    const url = await this.fileStorageService.saveImage(
      'oa',
      workspaceId,
      file.buffer,
      MIME_EXTENSION[mimetype],
    );

    const data: Prisma.WorkspaceOaUpdateInput = { [field]: url };

    const profile = await this.prismaService.$transaction(async (tx) => {
      const updated = await tx.workspaceOa.update({
        where: { workspaceId },
        data,
        select: PROFILE_SELECT,
      });

      await this.auditLogService.write({
        actorUserId,
        workspaceId,
        action: AUDIT_ACTIONS.OA_UPDATED,
        resourceType: AUDIT_RESOURCE_TYPES.WORKSPACE_OA,
        resourceId: updated.id,
        metadataJson: { changedFields: [field] },
        tx,
      });

      return updated;
    });

    return this.toView(profile);
  }

  /** Chuẩn hóa response: connection phẳng hóa, mặc định NOT_CONNECTED nếu thiếu. */
  private toView(
    profile: Prisma.WorkspaceOaGetPayload<{ select: typeof PROFILE_SELECT }>,
  ) {
    const { connection, ...rest } = profile;
    return {
      ...rest,
      connection: connection ?? {
        status: OaConnectionStatus.NOT_CONNECTED,
        connectedAt: null,
        oaId: null,
      },
    };
  }
}
