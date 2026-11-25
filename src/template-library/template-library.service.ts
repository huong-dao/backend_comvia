import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TemplateCtaType, TemplateType } from '@prisma/client';
import {
  AUDIT_ACTIONS,
  AUDIT_RESOURCE_TYPES,
} from '../audit-log/audit-log.constants';
import { AuditLogService } from '../audit-log/audit-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { assertOtpPlaceholderDefinition } from '../templates/otp-template.util';
import {
  CreateTemplateLibraryCategoryDto,
  ListTemplateLibraryCategoriesQueryDto,
  UpdateTemplateLibraryCategoryDto,
} from './dto/template-library-category.dto';
import {
  CreateTemplateLibraryItemDto,
  ListTemplateLibraryItemsQueryDto,
  TemplateLibraryCtaButtonDto,
  UpdateTemplateLibraryItemDto,
} from './dto/template-library-item.dto';

const UNCATEGORIZED = 'none';

const ITEM_SELECT = {
  id: true,
  categoryId: true,
  name: true,
  description: true,
  type: true,
  title: true,
  content: true,
  secondaryContent: true,
  content2: true,
  secondaryContent2: true,
  otpExpiryMinutes: true,
  placeholdersJson: true,
  placeholder_labels: true,
  placeholderOrder: true,
  ctaButtons: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true } },
} satisfies Prisma.TemplateLibraryItemSelect;

type ItemState = {
  type: TemplateType;
  content: string | null;
  otpExpiryMinutes: number | null;
  placeholdersJson: Record<string, unknown> | null;
  placeholder_labels: Record<string, string> | null;
  placeholderOrder: string[] | null;
  ctaButtons: TemplateLibraryCtaButtonDto[] | null;
};

/** Thư viện mẫu tin (BR-TPLLIB-*): ADMIN quản lý, user chỉ đọc. */
@Injectable()
export class TemplateLibraryService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  // ---- Danh mục -----------------------------------------------------------

  async listCategories(query: ListTemplateLibraryCategoriesQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 100;
    const where: Prisma.TemplateLibraryCategoryWhereInput = query.keyword
      ? { name: { contains: query.keyword, mode: 'insensitive' } }
      : {};
    const [rows, total] = await Promise.all([
      this.prismaService.templateLibraryCategory.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: { _count: { select: { items: true } } },
      }),
      this.prismaService.templateLibraryCategory.count({ where }),
    ]);
    return {
      data: rows.map(({ _count, ...category }) => ({
        ...category,
        itemCount: _count.items,
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async createCategory(
    actorUserId: string,
    dto: CreateTemplateLibraryCategoryDto,
  ) {
    const name = dto.name.trim();
    await this.assertCategoryNameFree(name);
    const category = await this.prismaService.templateLibraryCategory.create({
      data: {
        name,
        description: dto.description?.trim() || null,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
    await this.audit(
      actorUserId,
      AUDIT_ACTIONS.TEMPLATE_LIBRARY_CATEGORY_CREATED,
      AUDIT_RESOURCE_TYPES.TEMPLATE_LIBRARY_CATEGORY,
      category.id,
      { name },
    );
    return category;
  }

  async updateCategory(
    actorUserId: string,
    categoryId: string,
    dto: UpdateTemplateLibraryCategoryDto,
  ) {
    await this.findCategoryOrThrow(categoryId);
    const data: Prisma.TemplateLibraryCategoryUpdateInput = {};
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      await this.assertCategoryNameFree(name, categoryId);
      data.name = name;
    }
    if (dto.description !== undefined) {
      data.description = dto.description?.trim() || null;
    }
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;

    const category = await this.prismaService.templateLibraryCategory.update({
      where: { id: categoryId },
      data,
    });
    await this.audit(
      actorUserId,
      AUDIT_ACTIONS.TEMPLATE_LIBRARY_CATEGORY_UPDATED,
      AUDIT_RESOURCE_TYPES.TEMPLATE_LIBRARY_CATEGORY,
      categoryId,
      { fields: Object.keys(data) },
    );
    return category;
  }

  /** Mẫu tin thuộc danh mục được giữ lại, `categoryId` về null (chưa phân loại). */
  async deleteCategory(actorUserId: string, categoryId: string) {
    const category = await this.findCategoryOrThrow(categoryId);
    const orphanedItems = await this.prismaService.templateLibraryItem.count({
      where: { categoryId },
    });
    await this.prismaService.templateLibraryCategory.delete({
      where: { id: categoryId },
    });
    await this.audit(
      actorUserId,
      AUDIT_ACTIONS.TEMPLATE_LIBRARY_CATEGORY_DELETED,
      AUDIT_RESOURCE_TYPES.TEMPLATE_LIBRARY_CATEGORY,
      categoryId,
      { name: category.name, orphanedItems },
    );
    return { id: categoryId, deleted: true, orphanedItems };
  }

  // ---- Mẫu tin ------------------------------------------------------------

  async listItems(query: ListTemplateLibraryItemsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 12;
    const where: Prisma.TemplateLibraryItemWhereInput = {
      ...(query.categoryId
        ? {
            categoryId:
              query.categoryId === UNCATEGORIZED ? null : query.categoryId,
          }
        : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.keyword
        ? {
            OR: [
              { name: { contains: query.keyword, mode: 'insensitive' } },
              {
                description: { contains: query.keyword, mode: 'insensitive' },
              },
              { title: { contains: query.keyword, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prismaService.templateLibraryItem.findMany({
        where,
        select: ITEM_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prismaService.templateLibraryItem.count({ where }),
    ]);
    return {
      data: rows,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getItem(itemId: string) {
    const item = await this.prismaService.templateLibraryItem.findUnique({
      where: { id: itemId },
      select: ITEM_SELECT,
    });
    if (!item) throw new NotFoundException('Library template not found');
    return item;
  }

  async createItem(actorUserId: string, dto: CreateTemplateLibraryItemDto) {
    const type = dto.type ?? TemplateType.TEXT;
    const isOtp = type === TemplateType.OTP;
    const state: ItemState = {
      type,
      content: dto.content ?? null,
      otpExpiryMinutes: dto.otpExpiryMinutes ?? null,
      placeholdersJson: dto.placeholdersJson ?? null,
      placeholder_labels: dto.placeholder_labels ?? null,
      placeholderOrder: dto.placeholderOrder ?? null,
      ctaButtons: dto.ctaButtons ?? null,
    };
    this.validateOrThrow(state);
    if (dto.categoryId) await this.findCategoryOrThrow(dto.categoryId);

    const item = await this.prismaService.templateLibraryItem.create({
      data: {
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        categoryId: dto.categoryId ?? null,
        type,
        title: dto.title ?? null,
        // OTP không có nội dung tự do (giống Template).
        content: isOtp ? null : state.content,
        secondaryContent: isOtp ? null : (dto.secondaryContent ?? null),
        content2: isOtp ? null : (dto.content2 ?? null),
        secondaryContent2: isOtp ? null : (dto.secondaryContent2 ?? null),
        otpExpiryMinutes: isOtp ? state.otpExpiryMinutes : null,
        placeholdersJson: this.json(state.placeholdersJson),
        placeholder_labels: this.json(state.placeholder_labels),
        placeholderOrder: this.json(this.normalizeOrder(state)),
        ctaButtons: this.json(this.sortCta(state.ctaButtons)),
        createdById: actorUserId,
      },
      select: ITEM_SELECT,
    });
    await this.audit(
      actorUserId,
      AUDIT_ACTIONS.TEMPLATE_LIBRARY_ITEM_CREATED,
      AUDIT_RESOURCE_TYPES.TEMPLATE_LIBRARY_ITEM,
      item.id,
      { name: item.name, type: item.type, categoryId: item.categoryId },
    );
    return item;
  }

  async updateItem(
    actorUserId: string,
    itemId: string,
    dto: UpdateTemplateLibraryItemDto,
  ) {
    const current = await this.prismaService.templateLibraryItem.findUnique({
      where: { id: itemId },
    });
    if (!current) throw new NotFoundException('Library template not found');

    const pick = <T>(sent: T | null | undefined, stored: T | null): T | null =>
      sent === undefined ? stored : sent;

    const state: ItemState = {
      type: dto.type ?? current.type,
      content: pick(dto.content, current.content),
      otpExpiryMinutes: pick(dto.otpExpiryMinutes, current.otpExpiryMinutes),
      placeholdersJson: pick(
        dto.placeholdersJson,
        current.placeholdersJson as Record<string, unknown> | null,
      ),
      placeholder_labels: pick(
        dto.placeholder_labels,
        current.placeholder_labels as Record<string, string> | null,
      ),
      placeholderOrder: pick(
        dto.placeholderOrder,
        current.placeholderOrder as string[] | null,
      ),
      ctaButtons: pick(
        dto.ctaButtons,
        current.ctaButtons as TemplateLibraryCtaButtonDto[] | null,
      ),
    };
    this.validateOrThrow(state);
    if (dto.categoryId) await this.findCategoryOrThrow(dto.categoryId);

    const isOtp = state.type === TemplateType.OTP;
    const data: Prisma.TemplateLibraryItemUncheckedUpdateInput = {
      type: state.type,
      content: isOtp ? null : state.content,
      secondaryContent: isOtp
        ? null
        : pick(dto.secondaryContent, current.secondaryContent),
      content2: isOtp ? null : pick(dto.content2, current.content2),
      secondaryContent2: isOtp
        ? null
        : pick(dto.secondaryContent2, current.secondaryContent2),
      otpExpiryMinutes: isOtp ? state.otpExpiryMinutes : null,
      placeholdersJson: this.json(state.placeholdersJson),
      placeholder_labels: this.json(state.placeholder_labels),
      placeholderOrder: this.json(this.normalizeOrder(state)),
      ctaButtons: this.json(this.sortCta(state.ctaButtons)),
      title: pick(dto.title, current.title),
      description:
        dto.description === undefined
          ? current.description
          : dto.description?.trim() || null,
      categoryId:
        dto.categoryId === undefined ? current.categoryId : dto.categoryId,
    };
    if (dto.name !== undefined) data.name = dto.name.trim();

    const item = await this.prismaService.templateLibraryItem.update({
      where: { id: itemId },
      data,
      select: ITEM_SELECT,
    });
    await this.audit(
      actorUserId,
      AUDIT_ACTIONS.TEMPLATE_LIBRARY_ITEM_UPDATED,
      AUDIT_RESOURCE_TYPES.TEMPLATE_LIBRARY_ITEM,
      itemId,
      { fields: Object.keys(dto) },
    );
    return item;
  }

  async deleteItem(actorUserId: string, itemId: string) {
    const item = await this.prismaService.templateLibraryItem.findUnique({
      where: { id: itemId },
      select: { id: true, name: true },
    });
    if (!item) throw new NotFoundException('Library template not found');
    await this.prismaService.templateLibraryItem.delete({
      where: { id: itemId },
    });
    await this.audit(
      actorUserId,
      AUDIT_ACTIONS.TEMPLATE_LIBRARY_ITEM_DELETED,
      AUDIT_RESOURCE_TYPES.TEMPLATE_LIBRARY_ITEM,
      itemId,
      { name: item.name },
    );
    return { id: itemId, deleted: true };
  }

  // ---- Helpers ------------------------------------------------------------

  /** Cùng luật cấu trúc theo type như Template (BR-TPL-01), bỏ phần OA/giá. */
  private validateOrThrow(state: ItemState): void {
    if (state.type === TemplateType.OTP) {
      if (state.otpExpiryMinutes == null) {
        throw new BadRequestException(
          'otpExpiryMinutes is required for OTP templates',
        );
      }
      assertOtpPlaceholderDefinition(state.placeholdersJson);
    } else {
      if (!state.content) {
        throw new BadRequestException(
          'content is required for TEXT/TABLE templates',
        );
      }
      if (state.placeholdersJson == null) {
        throw new BadRequestException(
          'placeholdersJson is required for TEXT/TABLE templates',
        );
      }
    }

    const slugs = new Set(Object.keys(state.placeholdersJson ?? {}));
    if (state.placeholder_labels) {
      if (
        Object.values(state.placeholder_labels).some(
          (v) => typeof v !== 'string',
        )
      ) {
        throw new BadRequestException(
          'placeholder_labels values must be strings',
        );
      }
      const unknown = Object.keys(state.placeholder_labels).filter(
        (s) => !slugs.has(s),
      );
      if (unknown.length > 0) {
        throw new BadRequestException(
          `placeholder_labels has keys not in placeholdersJson: ${unknown.join(', ')}`,
        );
      }
    }
    const order = state.placeholderOrder;
    if (order) {
      const dup = order.filter((s, i) => order.indexOf(s) !== i);
      if (dup.length > 0) {
        throw new BadRequestException(
          `placeholderOrder has duplicate slugs: ${[...new Set(dup)].join(', ')}`,
        );
      }
      const unknown = order.filter((s) => !slugs.has(s));
      if (unknown.length > 0) {
        throw new BadRequestException(
          `placeholderOrder has slugs not in placeholdersJson: ${unknown.join(', ')}`,
        );
      }
    }
    this.validateCtaOrThrow(state.ctaButtons);
  }

  /** Giữ thứ tự đã gửi, slug còn thiếu nối theo thứ tự key. */
  private normalizeOrder(state: ItemState): string[] | null {
    if (!state.placeholderOrder) return null;
    const slugs = Object.keys(state.placeholdersJson ?? {});
    const kept = state.placeholderOrder.filter((s) => slugs.includes(s));
    return [...kept, ...slugs.filter((s) => !kept.includes(s))];
  }

  private sortCta(buttons: TemplateLibraryCtaButtonDto[] | null) {
    if (!buttons || buttons.length === 0) return null;
    return [...buttons]
      .sort((a, b) => a.position - b.position)
      .map(({ type, label, target, position }) => ({
        type,
        label: label ?? null,
        target: target ?? null,
        position,
      }));
  }

  private validateCtaOrThrow(buttons: TemplateLibraryCtaButtonDto[] | null) {
    if (!buttons) return;
    if (buttons.length > 2) {
      throw new BadRequestException(
        'A template can have at most two CTA buttons',
      );
    }
    if (new Set(buttons.map((b) => b.position)).size !== buttons.length) {
      throw new BadRequestException('CTA button positions must be unique');
    }
    for (const button of buttons) {
      if (button.type === TemplateCtaType.OA_PROFILE) {
        if (
          button.target !== undefined &&
          button.target !== null &&
          !this.isHttpUrl(button.target)
        ) {
          throw new BadRequestException(
            'OA_PROFILE target must be a valid http(s) URL when supplied',
          );
        }
        continue;
      }
      if (!button.target) {
        throw new BadRequestException(
          `CTA target is required for ${button.type}`,
        );
      }
      if (button.type === TemplateCtaType.PHONE_CALL) {
        if (
          !/^(?:\+84|84|0)\d{9,10}$/.test(button.target.replace(/[.\s-]/g, ''))
        ) {
          throw new BadRequestException(
            'PHONE_CALL target must be a valid Vietnamese phone number',
          );
        }
      } else if (!this.isHttpUrl(button.target)) {
        throw new BadRequestException(
          `CTA target must be a valid http(s) URL for ${button.type}`,
        );
      }
    }
  }

  private isHttpUrl(value: string): boolean {
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  private json(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
    return value == null ? Prisma.DbNull : (value as Prisma.InputJsonValue);
  }

  private async findCategoryOrThrow(categoryId: string) {
    const category =
      await this.prismaService.templateLibraryCategory.findUnique({
        where: { id: categoryId },
      });
    if (!category) throw new NotFoundException('Library category not found');
    return category;
  }

  private async assertCategoryNameFree(name: string, exceptId?: string) {
    const existing = await this.prismaService.templateLibraryCategory.findFirst(
      {
        where: {
          name: { equals: name, mode: 'insensitive' },
          ...(exceptId ? { id: { not: exceptId } } : {}),
        },
        select: { id: true },
      },
    );
    if (existing) {
      throw new BadRequestException('Library category name already exists');
    }
  }

  private async audit(
    actorUserId: string,
    action: string,
    resourceType: string,
    resourceId: string,
    metadataJson: Prisma.InputJsonValue,
  ) {
    await this.auditLogService.write({
      actorUserId,
      action,
      resourceType,
      resourceId,
      metadataJson,
    });
  }
}
