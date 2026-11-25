import { Module } from '@nestjs/common';
import {
  AdminTemplateLibraryController,
  TemplateLibraryController,
} from './template-library.controller';
import { TemplateLibraryService } from './template-library.service';

@Module({
  controllers: [TemplateLibraryController, AdminTemplateLibraryController],
  providers: [TemplateLibraryService],
})
export class TemplateLibraryModule {}
