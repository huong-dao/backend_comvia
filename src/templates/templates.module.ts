import { Module } from '@nestjs/common';
import {
  InternalTemplatesController,
  TemplatesController,
} from './templates.controller';
import { TemplatesService } from './templates.service';

@Module({
  controllers: [TemplatesController, InternalTemplatesController],
  providers: [TemplatesService],
  exports: [TemplatesService],
})
export class TemplatesModule {}
