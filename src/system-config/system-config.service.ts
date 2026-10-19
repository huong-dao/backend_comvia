import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, TemplateCtaType } from '@prisma/client';
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

  async getCtaPricing(): Promise<Partial<Record<TemplateCtaType, number>>> {
    const config = await this.ensureSingleton();
    const raw = config.ctaPricingJson;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return Object.fromEntries(
      Object.entries(raw).filter(
        ([type, price]) =>
          Object.values(TemplateCtaType).includes(type as TemplateCtaType) &&
          typeof price === 'number' &&
          Number.isInteger(price) &&
          price >= 0,
      ),
    ) as Partial<Record<TemplateCtaType, number>>;
  }

  async updateCtaPricing(prices: Partial<Record<TemplateCtaType, number>>) {
    for (const [type, price] of Object.entries(prices)) {
      if (
        !Object.values(TemplateCtaType).includes(type as TemplateCtaType) ||
        !Number.isInteger(price) ||
        price < 0
      ) {
        throw new BadRequestException('Invalid CTA pricing configuration');
      }
    }
    return this.prismaService.systemConfig.upsert({
      where: { id: SYSTEM_CONFIG_SINGLETON_ID },
      create: {
        id: SYSTEM_CONFIG_SINGLETON_ID,
        defaultMessageUnitPrice: 400,
        ctaPricingJson: prices as Prisma.InputJsonValue,
      },
      update: { ctaPricingJson: prices as Prisma.InputJsonValue },
    });
  }

  async resolveCtaDefaultUnitPrice(type: TemplateCtaType): Promise<number> {
    return (await this.getCtaPricing())[type] ?? 0;
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
        ctaPricingJson: {},
      },
      update: {},
    });
  }
}
