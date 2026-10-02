import { BadRequestException, Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { imageSize } from 'image-size';
import { join } from 'path';

export interface ImageDimensions {
  width: number;
  height: number;
}

/**
 * Shared file storage service (ADR-002): writes binary files to local disk under
 * `public/<scope>/<subId>/` and returns the relative `/public/...` URL served by
 * `useStaticAssets`. Follows the pattern of `InvoicePdfStorageService`.
 */
@Injectable()
export class FileStorageService {
  /**
   * Save an image buffer under `public/<scope>/<subId>/` and return its relative URL.
   * For OA logos/avatars: scope = 'oa', subId = workspaceId.
   */
  async saveImage(
    scope: string,
    subId: string,
    buffer: Buffer,
    ext: string,
  ): Promise<string> {
    const normalizedExt = ext.replace(/^\./, '').toLowerCase();
    const dir = join(process.cwd(), 'public', scope, subId);
    await mkdir(dir, { recursive: true });

    const fileName = `${Date.now()}_${randomBytes(4).toString('hex')}.${normalizedExt}`;
    const absolutePath = join(dir, fileName);
    await writeFile(absolutePath, buffer);

    return `/public/${scope}/${subId}/${fileName}`;
  }

  /**
   * Assert the image has exactly the expected pixel dimensions (e.g. 400x96 for OA logos).
   * Throws `BadRequestException` when the dimensions differ or the buffer is not a readable image.
   */
  assertImageDimensions(buffer: Buffer, expected: ImageDimensions): void {
    let width: number | undefined;
    let height: number | undefined;
    try {
      const dimensions = imageSize(buffer);
      width = dimensions.width;
      height = dimensions.height;
    } catch {
      throw new BadRequestException('Unable to read image dimensions');
    }

    if (width !== expected.width || height !== expected.height) {
      throw new BadRequestException(
        `Image dimensions must be ${expected.width}x${expected.height}px, got ${width ?? 'unknown'}x${height ?? 'unknown'}px`,
      );
    }
  }

  /**
   * Assert the uploaded file's mimetype is in the allowed list (e.g. image/png, image/jpeg).
   */
  assertMimeAllowed(mimetype: string, allowed: string[]): void {
    if (!allowed.includes(mimetype)) {
      throw new BadRequestException(
        `Unsupported file type: ${mimetype}. Allowed: ${allowed.join(', ')}`,
      );
    }
  }

  /**
   * Assert the file size (in bytes) does not exceed the given limit.
   */
  assertSizeWithinLimit(size: number, maxBytes: number): void {
    if (size > maxBytes) {
      throw new BadRequestException(
        `File too large: ${size} bytes exceeds the limit of ${maxBytes} bytes`,
      );
    }
  }
}
