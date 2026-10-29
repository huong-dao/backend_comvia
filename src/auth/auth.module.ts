import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { StringValue } from 'ms';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { OtpService } from './otp/otp.service';
import { EmailModule } from '../integrations/email/email.module';

@Module({
  imports: [
    ConfigModule,
    EmailModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          // ISSUE-003 (Hướng B): this is now the ACCESS token TTL, not the
          // whole session length — the 30-day sliding session comes from the
          // refresh token (see AuthService.issueTokenPair / JWT_REFRESH_EXPIRES_IN).
          // Ops: if JWT_EXPIRES_IN was previously set long (e.g. "7d"/"30d")
          // to carry the whole session before refresh tokens existed, it
          // should be tightened to something short like "1h" post-deploy.
          expiresIn: (configService.get<string>('JWT_EXPIRES_IN') ??
            '1h') as StringValue,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, OtpService],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
