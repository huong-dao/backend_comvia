import { NotFoundException } from '@nestjs/common';
import { OrdersInvoicesService } from './orders-invoices.service';

describe('OrdersInvoicesService owner scope', () => {
  it('scopes owner order detail by workspace', async () => {
    const prisma = { order: { findFirst: jest.fn().mockResolvedValue(null) } };
    const service = new OrdersInvoicesService(prisma as never);

    await expect(
      service.getOrderForOwner('workspace-a', 'order-from-other-workspace'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.order.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order-from-other-workspace', workspaceId: 'workspace-a' },
      }),
    );
  });
});
