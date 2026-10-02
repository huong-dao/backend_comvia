import { Module } from '@nestjs/common';
import { FileStorageService } from './storage/file-storage.service';

/**
 * Shared, cross-cutting providers (ADR-002). Feature modules import `CommonModule`
 * to reuse `FileStorageService` for writing files under `public/`.
 */
@Module({
  providers: [FileStorageService],
  exports: [FileStorageService],
})
export class CommonModule {}
