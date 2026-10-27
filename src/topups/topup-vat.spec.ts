import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { calculateTopupAmounts, TOPUP_VAT_RATE } from './topup-vat';
import { CreateTopupPay2sDto } from './dto/create-topup-pay2s.dto';

describe('calculateTopupAmounts', () => {
  it('uses the server-owned 10% VAT rate for topup, order, and invoice totals', () => {
    const amounts = calculateTopupAmounts(100_000);

    expect(TOPUP_VAT_RATE).toBe(10);
    expect(amounts).toEqual({
      amountExclVat: 100_000,
      vatAmount: 10_000,
      amountInclVat: 110_000,
    });
  });

  it('rounds VAT once before calculating the amount charged to Pay2S', () => {
    expect(calculateTopupAmounts(10_001)).toEqual({
      amountExclVat: 10_001,
      vatAmount: 1_000,
      amountInclVat: 11_001,
    });
  });

  it('rejects a client-selected VAT rate before it reaches the service', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });

    await expect(
      pipe.transform(
        {
          amountExclVat: 100_000,
          moneyAccountId: 'money-account-1',
          vatRate: 0,
        },
        { type: 'body', metatype: CreateTopupPay2sDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
