import { Module } from '@nestjs/common';
import { TopupsController } from './topups.controller';
import { TopupsService } from './topups.service';
import { CollectionRequestsModule } from '../modules/collection-requests/collection-requests.module';

@Module({
  imports: [CollectionRequestsModule],
  controllers: [TopupsController],
  providers: [TopupsService],
  exports: [TopupsService],
})
export class TopupsModule {}
