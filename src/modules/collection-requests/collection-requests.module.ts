import { Module } from '@nestjs/common';
import { CollectionRequestsController } from './collection-requests.controller';
import { CollectionRequestsService } from './collection-requests.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CollectionRequestsController],
  providers: [CollectionRequestsService],
  exports: [CollectionRequestsService],
})
export class CollectionRequestsModule {}
