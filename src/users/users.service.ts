import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateMyProfileDto } from './dto/update-my-profile.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prismaService: PrismaService) {}

  findAll() {
    return this.prismaService.user.findMany({
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        status: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  updateMe(userId: string, dto: UpdateMyProfileDto) {
    if (!dto.fullName) {
      throw new BadRequestException(
        'At least one profile field must be provided',
      );
    }

    return this.prismaService.user.update({
      where: { id: userId },
      data: {
        fullName: dto.fullName,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }
}
