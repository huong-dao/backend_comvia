import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { OrdersInvoicesController } from './orders-invoices.controller';

describe('OrdersInvoicesController authorization', () => {
  it('allows only ADMIN to access order operations', () => {
    expect(Reflect.getMetadata(ROLES_KEY, OrdersInvoicesController)).toEqual([
      UserRole.ADMIN,
    ]);
  });
});
