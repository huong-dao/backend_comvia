import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import {
  CreateTemplateLibraryCategoryDto,
  ListTemplateLibraryCategoriesQueryDto,
  UpdateTemplateLibraryCategoryDto,
} from './dto/template-library-category.dto';
import {
  CreateTemplateLibraryItemDto,
  ListTemplateLibraryItemsQueryDto,
  UpdateTemplateLibraryItemDto,
} from './dto/template-library-item.dto';
import { TemplateLibraryService } from './template-library.service';

type AuthRequest = { user: { id: string } };

/**
 * Đọc thư viện: USER và ADMIN (STAFF bị chặn bởi RolesGuard).
 * Không cần workspace: thư viện là dữ liệu chung toàn hệ thống.
 */
@Controller('template-library')
@Roles(UserRole.USER, UserRole.ADMIN)
export class TemplateLibraryController {
  constructor(private readonly service: TemplateLibraryService) {}

  @Get('categories')
  listCategories(@Query() query: ListTemplateLibraryCategoriesQueryDto) {
    return this.service.listCategories(query);
  }

  @Get('items')
  listItems(@Query() query: ListTemplateLibraryItemsQueryDto) {
    return this.service.listItems(query);
  }

  @Get('items/:itemId')
  getItem(@Param('itemId') itemId: string) {
    return this.service.getItem(itemId);
  }
}

/** Quản lý thư viện: chỉ ADMIN. */
@Controller('admin/template-library')
@Roles(UserRole.ADMIN)
export class AdminTemplateLibraryController {
  constructor(private readonly service: TemplateLibraryService) {}

  @Get('categories')
  listCategories(@Query() query: ListTemplateLibraryCategoriesQueryDto) {
    return this.service.listCategories(query);
  }

  @Post('categories')
  createCategory(
    @Request() req: AuthRequest,
    @Body() dto: CreateTemplateLibraryCategoryDto,
  ) {
    return this.service.createCategory(req.user.id, dto);
  }

  @Patch('categories/:categoryId')
  updateCategory(
    @Request() req: AuthRequest,
    @Param('categoryId') categoryId: string,
    @Body() dto: UpdateTemplateLibraryCategoryDto,
  ) {
    return this.service.updateCategory(req.user.id, categoryId, dto);
  }

  @Delete('categories/:categoryId')
  deleteCategory(
    @Request() req: AuthRequest,
    @Param('categoryId') categoryId: string,
  ) {
    return this.service.deleteCategory(req.user.id, categoryId);
  }

  @Get('items')
  listItems(@Query() query: ListTemplateLibraryItemsQueryDto) {
    return this.service.listItems(query);
  }

  @Get('items/:itemId')
  getItem(@Param('itemId') itemId: string) {
    return this.service.getItem(itemId);
  }

  @Post('items')
  createItem(
    @Request() req: AuthRequest,
    @Body() dto: CreateTemplateLibraryItemDto,
  ) {
    return this.service.createItem(req.user.id, dto);
  }

  @Patch('items/:itemId')
  updateItem(
    @Request() req: AuthRequest,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateTemplateLibraryItemDto,
  ) {
    return this.service.updateItem(req.user.id, itemId, dto);
  }

  @Delete('items/:itemId')
  deleteItem(@Request() req: AuthRequest, @Param('itemId') itemId: string) {
    return this.service.deleteItem(req.user.id, itemId);
  }
}
