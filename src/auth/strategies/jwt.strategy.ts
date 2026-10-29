import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { User } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prismaService: PrismaService,
  ) {
    const jwtSecret = configService.get<string>('JWT_SECRET');
    if (!jwtSecret) {
      throw new Error('Missing JWT_SECRET in environment variables');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  async validate(
    payload: JwtPayload,
  ): Promise<
    Pick<User, 'id' | 'email' | 'role'> & { impersonatedBy?: string }
  > {
    // A refresh token must only ever be redeemed via POST /auth/refresh,
    // never accepted as credentials on a normal protected route.
    if (payload.type === 'refresh') {
      throw new UnauthorizedException('Token không hợp lệ');
    }

    const user = await this.prismaService.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, tokenVersion: true },
    });

    if (!user || (payload.tokenVersion ?? 0) !== user.tokenVersion) {
      throw new UnauthorizedException('Token không hợp lệ');
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      ...(payload.impersonatedBy
        ? { impersonatedBy: payload.impersonatedBy }
        : {}),
    };
  }
}
