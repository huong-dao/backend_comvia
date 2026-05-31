import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MemberRole } from '@prisma/client';
import { WorkspaceContextGuard } from '../common/guards/workspace-context.guard';
import { WorkspaceRoles } from '../common/decorators/workspace-roles.decorator';
import { WorkspaceRolesGuard } from '../common/guards/workspace-roles.guard';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { ListCampaignRowsQueryDto } from './dto/list-campaign-rows-query.dto';
import { RetryCampaignDto } from './dto/retry-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { UpdateCampaignRowDto } from './dto/update-campaign-row.dto';

type CsvUploadFile = {
  buffer: Buffer;
  mimetype?: string;
  originalname?: string;
};

@Controller('workspaces/:workspaceId/campaigns')
@UseGuards(WorkspaceContextGuard, WorkspaceRolesGuard)
@WorkspaceRoles(MemberRole.OWNER, MemberRole.MEMBER)
export class CampaignsController {
  constructor(private readonly service: CampaignsService) {}

  @Post()
  create(
    @Request() req: { user: { id: string } },
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateCampaignDto,
  ) {
    return this.service.create(workspaceId, req.user.id, dto);
  }

  @Get()
  list(@Param('workspaceId') workspaceId: string) {
    return this.service.list(workspaceId);
  }

  @Get(':campaignId')
  get(
    @Param('workspaceId') workspaceId: string,
    @Param('campaignId') campaignId: string,
  ) {
    return this.service.get(workspaceId, campaignId);
  }

  @Patch(':campaignId')
  update(
    @Param('workspaceId') workspaceId: string,
    @Param('campaignId') campaignId: string,
    @Body() dto: UpdateCampaignDto,
  ) {
    return this.service.update(workspaceId, campaignId, dto);
  }

  @Delete(':campaignId')
  remove(
    @Param('workspaceId') workspaceId: string,
    @Param('campaignId') campaignId: string,
  ) {
    return this.service.remove(workspaceId, campaignId);
  }

  @Get(':campaignId/csv-template')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="campaign-template.csv"')
  async exportCsvTemplate(
    @Param('workspaceId') workspaceId: string,
    @Param('campaignId') campaignId: string,
  ) {
    return this.service.exportCsvTemplate(workspaceId, campaignId);
  }

  @Post(':campaignId/import-csv')
  @UseInterceptors(FileInterceptor('file'))
  importCsv(
    @Param('workspaceId') workspaceId: string,
    @Param('campaignId') campaignId: string,
    @UploadedFile() file: CsvUploadFile,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('CSV file is required');
    }
    const csvText = file.buffer.toString('utf-8');
    return this.service.importCsv(workspaceId, campaignId, csvText);
  }

  @Get(':campaignId/rows')
  listRows(
    @Param('workspaceId') workspaceId: string,
    @Param('campaignId') campaignId: string,
    @Query() query: ListCampaignRowsQueryDto,
  ) {
    return this.service.listRows(
      workspaceId,
      campaignId,
      query.status,
      query.limit,
    );
  }

  @Patch(':campaignId/rows/:rowId')
  updateRow(
    @Param('workspaceId') workspaceId: string,
    @Param('campaignId') campaignId: string,
    @Param('rowId') rowId: string,
    @Body() dto: UpdateCampaignRowDto,
  ) {
    return this.service.updateRow(workspaceId, campaignId, rowId, dto);
  }

  @Delete(':campaignId/rows/:rowId')
  removeRow(
    @Param('workspaceId') workspaceId: string,
    @Param('campaignId') campaignId: string,
    @Param('rowId') rowId: string,
  ) {
    return this.service.removeRow(workspaceId, campaignId, rowId);
  }

  @Post(':campaignId/execute')
  execute(
    @Request() req: { user: { id: string } },
    @Param('workspaceId') workspaceId: string,
    @Param('campaignId') campaignId: string,
  ) {
    return this.service.execute(workspaceId, campaignId, req.user.id);
  }

  @Post(':campaignId/retry')
  retry(
    @Request() req: { user: { id: string } },
    @Param('workspaceId') workspaceId: string,
    @Param('campaignId') campaignId: string,
    @Body() dto: RetryCampaignDto,
  ) {
    return this.service.retry(workspaceId, campaignId, req.user.id, dto);
  }
}
