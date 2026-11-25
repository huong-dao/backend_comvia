import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TemplateLibraryService } from './template-library.service';

function build(overrides: Record<string, unknown> = {}) {
  const prisma = {
    templateLibraryCategory: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findUnique: jest.fn().mockResolvedValue({ id: 'cat-1', name: 'Cat' }),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'cat-1' }),
      update: jest.fn(),
      delete: jest.fn().mockResolvedValue({}),
    },
    templateLibraryItem: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findUnique: jest.fn(),
      create: jest.fn().mockImplementation(({ data }) => ({
        id: 'item-1',
        ...data,
      })),
      update: jest.fn().mockImplementation(({ data }) => ({
        id: 'item-1',
        ...data,
      })),
      delete: jest.fn().mockResolvedValue({}),
    },
    ...overrides,
  };
  const audit = { write: jest.fn().mockResolvedValue(undefined) };
  const service = new TemplateLibraryService(prisma as never, audit as never);
  return { service, prisma, audit };
}

describe('TemplateLibraryService items', () => {
  it('lists with pagination, keyword, category and type filters', async () => {
    const { service, prisma } = build();
    prisma.templateLibraryItem.count.mockResolvedValue(25);

    const result = await service.listItems({
      page: 2,
      limit: 10,
      keyword: 'ship',
      categoryId: 'cat-1',
      type: 'TEXT',
    });

    expect(prisma.templateLibraryItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    );
    const where = prisma.templateLibraryItem.findMany.mock.calls[0][0].where;
    expect(where.categoryId).toBe('cat-1');
    expect(where.type).toBe('TEXT');
    expect(where.OR).toHaveLength(3);
    expect(result.meta).toEqual({
      page: 2,
      limit: 10,
      total: 25,
      totalPages: 3,
    });
  });

  it('maps categoryId=none to uncategorized items', async () => {
    const { service, prisma } = build();
    await service.listItems({ categoryId: 'none' });
    expect(
      prisma.templateLibraryItem.findMany.mock.calls[0][0].where.categoryId,
    ).toBeNull();
  });

  it('returns 404 for a missing item', async () => {
    const { service, prisma } = build();
    prisma.templateLibraryItem.findUnique.mockResolvedValue(null);
    await expect(service.getItem('x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('requires content and placeholders for TEXT', async () => {
    const { service } = build();
    await expect(
      service.createItem('admin-1', { name: 'Mau 1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires otpExpiryMinutes and otp/phut placeholders for OTP', async () => {
    const { service } = build();
    await expect(
      service.createItem('admin-1', {
        name: 'Otp',
        type: 'OTP',
        placeholdersJson: { otp: '1', phut: '5' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createItem('admin-1', {
        name: 'Otp',
        type: 'OTP',
        otpExpiryMinutes: 5,
        placeholdersJson: { foo: '1' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects placeholder_labels for unknown slugs', async () => {
    const { service } = build();
    await expect(
      service.createItem('admin-1', {
        name: 'Mau 1',
        content: 'Xin chao <name>',
        placeholdersJson: { name: 'A' },
        placeholder_labels: { other: 'X' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates a TEXT item, normalizes placeholderOrder and audits', async () => {
    const { service, prisma, audit } = build();
    const item = await service.createItem('admin-1', {
      name: ' Mau 1 ',
      categoryId: 'cat-1',
      content: 'Xin chao',
      placeholdersJson: { a: '1', b: '2' },
      placeholderOrder: ['b'],
      ctaButtons: [
        { type: 'BUSINESS_WEBSITE', target: 'https://x.vn', position: 1 },
        { type: 'OA_PROFILE', position: 0 },
      ],
    });

    expect(item.name).toBe('Mau 1');
    const data = prisma.templateLibraryItem.create.mock.calls[0][0].data;
    expect(data.placeholderOrder).toEqual(['b', 'a']);
    expect(data.ctaButtons[0].position).toBe(0);
    expect(data.createdById).toBe('admin-1');
    expect(audit.write).toHaveBeenCalledTimes(1);
  });

  it('rejects a CTA without a valid target', async () => {
    const { service } = build();
    await expect(
      service.createItem('admin-1', {
        name: 'Mau 1',
        content: 'x',
        placeholdersJson: {},
        ctaButtons: [{ type: 'PHONE_CALL', target: 'abc', position: 0 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an unknown category on create', async () => {
    const { service, prisma } = build();
    prisma.templateLibraryCategory.findUnique.mockResolvedValue(null);
    await expect(
      service.createItem('admin-1', {
        name: 'Mau 1',
        categoryId: 'nope',
        content: 'x',
        placeholdersJson: {},
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('patch keeps unsent fields and clears fields sent as null', async () => {
    const { service, prisma } = build();
    prisma.templateLibraryItem.findUnique.mockResolvedValue({
      id: 'item-1',
      type: 'TEXT',
      content: 'old',
      secondaryContent: 'sec',
      content2: null,
      secondaryContent2: null,
      otpExpiryMinutes: null,
      placeholdersJson: { a: '1' },
      placeholder_labels: null,
      placeholderOrder: null,
      ctaButtons: null,
      title: 'T',
      description: 'D',
      categoryId: 'cat-1',
    });

    await service.updateItem('admin-1', 'item-1', {
      name: 'Moi',
      title: null,
      categoryId: null,
    });

    const data = prisma.templateLibraryItem.update.mock.calls[0][0].data;
    expect(data.name).toBe('Moi');
    expect(data.content).toBe('old');
    expect(data.secondaryContent).toBe('sec');
    expect(data.title).toBeNull();
    expect(data.categoryId).toBeNull();
    expect(data.description).toBe('D');
  });

  it('deletes an item and 404s when missing', async () => {
    const { service, prisma, audit } = build();
    prisma.templateLibraryItem.findUnique.mockResolvedValueOnce(null);
    await expect(service.deleteItem('a', 'x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    prisma.templateLibraryItem.findUnique.mockResolvedValueOnce({
      id: 'item-1',
      name: 'n',
    });
    await expect(service.deleteItem('a', 'item-1')).resolves.toEqual({
      id: 'item-1',
      deleted: true,
    });
    expect(audit.write).toHaveBeenCalledTimes(1);
  });
});

describe('TemplateLibraryService categories', () => {
  it('rejects a duplicate category name', async () => {
    const { service, prisma } = build();
    prisma.templateLibraryCategory.findFirst.mockResolvedValue({ id: 'other' });
    await expect(
      service.createCategory('admin-1', { name: 'Cat' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lists categories with item counts', async () => {
    const { service, prisma } = build();
    prisma.templateLibraryCategory.findMany.mockResolvedValue([
      { id: 'c1', name: 'A', _count: { items: 3 } },
    ]);
    prisma.templateLibraryCategory.count.mockResolvedValue(1);
    const result = await service.listCategories({});
    expect(result.data).toEqual([{ id: 'c1', name: 'A', itemCount: 3 }]);
  });

  it('deleting a category keeps its items and reports how many are orphaned', async () => {
    const { service, prisma } = build();
    prisma.templateLibraryItem.count.mockResolvedValue(4);
    await expect(service.deleteCategory('admin-1', 'cat-1')).resolves.toEqual({
      id: 'cat-1',
      deleted: true,
      orphanedItems: 4,
    });
    expect(prisma.templateLibraryItem.delete).not.toHaveBeenCalled();
  });
});
