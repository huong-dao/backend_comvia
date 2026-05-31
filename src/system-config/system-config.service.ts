import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SYSTEM_CONFIG_SINGLETON_ID } from './system-config.constants';

@Injectable()
export class SystemConfigService {
  constructor(private readonly prismaService: PrismaService) {}

  async getDefaultMessageUnitPrice(): Promise<number> {
    const config = await this.ensureSingleton();
    return Number(config.defaultMessageUnitPrice);
  }

  async getConfig() {
    return this.ensureSingleton();
  }

  async updateDefaultMessageUnitPrice(price: number) {
    return this.prismaService.systemConfig.upsert({
      where: { id: SYSTEM_CONFIG_SINGLETON_ID },
      create: {
        id: SYSTEM_CONFIG_SINGLETON_ID,
        defaultMessageUnitPrice: new Prisma.Decimal(price),
      },
      update: {
        defaultMessageUnitPrice: new Prisma.Decimal(price),
      },
    });
  }

  async resolveTemplateUnitPrice(
    templateUnitPrice: Prisma.Decimal | null | undefined,
  ): Promise<number> {
    if (templateUnitPrice != null) {
      return Number(templateUnitPrice);
    }
    return this.getDefaultMessageUnitPrice();
  }

  private async ensureSingleton() {
    return this.prismaService.systemConfig.upsert({
      where: { id: SYSTEM_CONFIG_SINGLETON_ID },
      create: {
        id: SYSTEM_CONFIG_SINGLETON_ID,
        defaultMessageUnitPrice: 400,
      },
      update: {},
    });
  }
}
