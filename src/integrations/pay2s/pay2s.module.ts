import { Module } from '@nestjs/common';
import { Pay2sCollectionService } from './pay2s-collection.service';

@Module({
  providers: [Pay2sCollectionService],
  exports: [Pay2sCollectionService],
})
export class Pay2sModule {}
