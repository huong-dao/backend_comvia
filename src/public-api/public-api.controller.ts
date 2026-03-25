import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { SendPublicMessageDto } from './dto/send-public-message.dto';
import { PublicApiService } from './public-api.service';

@Controller('public')
export class PublicApiController {
  constructor(private readonly publicApiService: PublicApiService) {}

  @Public()
  @UseGuards(ApiKeyGuard)
  @Get('templates')
  listTemplates(@Request() req: { workspaceId: string }) {
    return this.publicApiService.listApprovedTemplates({
      workspaceId: req.workspaceId,
    });
  }

  @Public()
  @UseGuards(ApiKeyGuard)
  @Get('templates/:templateId')
  getTemplate(
    @Request() req: { workspaceId: string },
    @Param('templateId') templateId: string,
  ) {
    return this.publicApiService.getApprovedTemplate(
      { workspaceId: req.workspaceId },
      templateId,
    );
  }

  @Public()
  @UseGuards(ApiKeyGuard)
  @Post('messages/send')
  sendSingle(
    @Request() req: { workspaceId: string },
    @Body() dto: SendPublicMessageDto,
  ) {
    // dto.api_key is used by guard for auth; service only needs other fields.
    void dto.api_key;
    return this.publicApiService.sendSingle(
      { workspaceId: req.workspaceId },
      {
        templateId: dto.templateId,
        phoneNumber: dto.phoneNumber,
        data: dto.data,
      },
    );
  }
}
