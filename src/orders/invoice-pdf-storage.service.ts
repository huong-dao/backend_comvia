import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

@Injectable()
export class InvoicePdfStorageService {
  async saveInvoicePdf(invoiceId: string, buffer: Buffer): Promise<string> {
    const dir = join(process.cwd(), 'public', 'invoices', invoiceId);
    await mkdir(dir, { recursive: true });

    const fileName = `${Date.now()}_${randomBytes(4).toString('hex')}.pdf`;
    const absolutePath = join(dir, fileName);
    await writeFile(absolutePath, buffer);

    return `/public/invoices/${invoiceId}/${fileName}`;
  }

  sha256Hex(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }
}
