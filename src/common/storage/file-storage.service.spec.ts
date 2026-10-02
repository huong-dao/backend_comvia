import { BadRequestException } from '@nestjs/common';
import { readFile, rm, stat } from 'fs/promises';
import { join } from 'path';
import { FileStorageService } from './file-storage.service';

/** Build a minimal valid PNG buffer with the given dimensions (header only). */
function makePng(width: number, height: number): Buffer {
  const signature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0); // chunk length
  ihdr.write('IHDR', 4);
  ihdr.writeUInt32BE(width, 8);
  ihdr.writeUInt32BE(height, 12);
  ihdr[16] = 8; // bit depth
  ihdr[17] = 6; // color type (RGBA)
  ihdr[18] = 0; // compression
  ihdr[19] = 0; // filter
  ihdr[20] = 0; // interlace
  ihdr.writeUInt32BE(0, 21); // CRC placeholder (not validated by image-size)
  return Buffer.concat([signature, ihdr]);
}

describe('FileStorageService', () => {
  let service: FileStorageService;
  const createdSubIds: string[] = [];

  beforeEach(() => {
    service = new FileStorageService();
  });

  afterAll(async () => {
    for (const subId of createdSubIds) {
      await rm(join(process.cwd(), 'public', 'oa', subId), {
        recursive: true,
        force: true,
      });
    }
  });

  describe('saveImage', () => {
    it('writes the file under public/oa/<subId>/ and returns a /public URL', async () => {
      const subId = `test-ws-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      createdSubIds.push(subId);
      const buffer = makePng(400, 96);

      const url = await service.saveImage('oa', subId, buffer, 'png');

      expect(url).toMatch(
        new RegExp(`^/public/oa/${subId}/\\d+_[0-9a-f]+\\.png$`),
      );

      const relativePath = url.replace(/^\//, '');
      const absolutePath = join(process.cwd(), relativePath);
      await expect(stat(absolutePath)).resolves.toBeDefined();
      const written = await readFile(absolutePath);
      expect(written.equals(buffer)).toBe(true);
    });

    it('normalizes a leading dot and uppercase in the extension', async () => {
      const subId = `test-ws-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      createdSubIds.push(subId);

      const url = await service.saveImage('oa', subId, makePng(10, 10), '.PNG');

      expect(url.endsWith('.png')).toBe(true);
    });
  });

  describe('assertImageDimensions', () => {
    it('passes for an image matching the expected dimensions', () => {
      expect(() =>
        service.assertImageDimensions(makePng(400, 96), {
          width: 400,
          height: 96,
        }),
      ).not.toThrow();
    });

    it('throws BadRequestException for a mismatched size', () => {
      expect(() =>
        service.assertImageDimensions(makePng(200, 50), {
          width: 400,
          height: 96,
        }),
      ).toThrow(BadRequestException);
    });

    it('throws BadRequestException for a non-image buffer', () => {
      expect(() =>
        service.assertImageDimensions(Buffer.from('not an image'), {
          width: 400,
          height: 96,
        }),
      ).toThrow(BadRequestException);
    });
  });

  describe('assertMimeAllowed', () => {
    const allowed = ['image/png', 'image/jpeg'];

    it('passes for an allowed mimetype', () => {
      expect(() =>
        service.assertMimeAllowed('image/png', allowed),
      ).not.toThrow();
    });

    it('throws BadRequestException for a disallowed mimetype', () => {
      expect(() => service.assertMimeAllowed('image/gif', allowed)).toThrow(
        BadRequestException,
      );
    });
  });

  describe('assertSizeWithinLimit', () => {
    it('passes when size is within the limit', () => {
      expect(() => service.assertSizeWithinLimit(1000, 2000)).not.toThrow();
    });

    it('throws BadRequestException when size exceeds the limit', () => {
      expect(() => service.assertSizeWithinLimit(3000, 2000)).toThrow(
        BadRequestException,
      );
    });
  });
});
