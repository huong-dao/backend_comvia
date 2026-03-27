import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { MoneyAccountsService } from './money-accounts.service';
import { CreateMoneyAccountDto } from './dto/create-money-account.dto';
import { UpdateMoneyAccountDto } from './dto/update-money-account.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('money-accounts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class MoneyAccountsController {
  constructor(private readonly moneyAccountsService: MoneyAccountsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateMoneyAccountDto) {
    const account = await this.moneyAccountsService.create(
      dto,
      'default-workspace',
    );
    return {
      success: true,
      data: account,
      message: 'Money account created successfully',
    };
  }

  @Get()
  async findAll() {
    const accounts =
      await this.moneyAccountsService.findAll('default-workspace');
    return {
      success: true,
      data: accounts,
      message: 'Money accounts retrieved successfully',
    };
  }

  @Get('all')
  async findAllIncludingInactive() {
    const accounts =
      await this.moneyAccountsService.findAllIncludingInactive(
        'default-workspace',
      );
    return {
      success: true,
      data: accounts,
      message: 'All money accounts retrieved successfully',
    };
  }

  @Get('active-for-topup')
  async getActiveAccountsForTopup() {
    const accounts =
      await this.moneyAccountsService.getActiveAccountsForTopup(
        'default-workspace',
      );
    return {
      success: true,
      data: accounts,
      message: 'Active accounts for topup retrieved successfully',
    };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const account = await this.moneyAccountsService.findOne(
      id,
      'default-workspace',
    );
    return {
      success: true,
      data: account,
      message: 'Money account retrieved successfully',
    };
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(@Param('id') id: string, @Body() dto: UpdateMoneyAccountDto) {
    const account = await this.moneyAccountsService.update(
      id,
      dto,
      'default-workspace',
    );
    return {
      success: true,
      data: account,
      message: 'Money account updated successfully',
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id') id: string) {
    await this.moneyAccountsService.remove(id, 'default-workspace');
    return {
      success: true,
      message: 'Money account deleted successfully',
    };
  }
}
