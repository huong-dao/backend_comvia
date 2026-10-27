import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';

@Injectable()
export class InvoicePdfStorageService {
  async saveInvoicePdf(invoiceId: string, buffer: Buffer): Promise<string> {
    const dir = join(process.cwd(), 'private', 'invoices', invoiceId);
    await mkdir(dir, { recursive: true });

    const fileName = `${Date.now()}_${randomBytes(4).toString('hex')}.pdf`;
    const absolutePath = join(dir, fileName);
    await writeFile(absolutePath, buffer);

    return `invoices/${invoiceId}/${fileName}`;
  }

  async readInvoicePdf(storageKey: string): Promise<Buffer> {
    if (!/^invoices\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+\.pdf$/.test(storageKey)) {
      throw new Error('Invalid private invoice PDF storage key');
    }
    return readFile(join(process.cwd(), 'private', storageKey));
  }

  sha256Hex(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }
}
