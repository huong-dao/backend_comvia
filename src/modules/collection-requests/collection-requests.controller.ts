import {
  Controller,
  Get,
  Post,
  Query,
  Param,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Headers,
} from '@nestjs/common';
import { CollectionRequestsService } from './collection-requests.service';
import {
  CreateCollectionRequestDto,
  QueryCollectionRequestDto,
  CollectionRequestResponseDto,
} from './dto/collection-request.dto';

@Controller('collection-requests')
export class CollectionRequestsController {
  constructor(
    private readonly collectionRequestsService: CollectionRequestsService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Headers('authorization') authHeader: string,
    @Body() dto: CreateCollectionRequestDto,
  ): Promise<CollectionRequestResponseDto> {
    // Extract user ID from JWT token (simplified for now)
    const userId = 'temp-user-id'; // TODO: Implement proper JWT extraction
    return this.collectionRequestsService.create(userId, dto);
  }

  @Get('workspace')
  @HttpCode(HttpStatus.OK)
  async findByWorkspace(@Query() query: QueryCollectionRequestDto) {
    return this.collectionRequestsService.findByWorkspace(
      query.workspaceId!,
      query,
    );
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findOne(
    @Param('id') id: string,
  ): Promise<CollectionRequestResponseDto> {
    return this.collectionRequestsService.findOne(id);
  }

  @Get('code/:code')
  @HttpCode(HttpStatus.OK)
  async findByCode(@Param('code') code: string) {
    return this.collectionRequestsService.findByCode(code);
  }
}
