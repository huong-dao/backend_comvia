import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { WorkspacesModule } from './workspaces/workspaces.module';
import { MembersModule } from './members/members.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { PublicApiModule } from './public-api/public-api.module';
import { WalletModule } from './wallet/wallet.module';
import { TopupsModule } from './topups/topups.module';
import { OrdersInvoicesModule } from './orders/orders-invoices.module';
import { OaConnectionsModule } from './oa/oa-connections.module';
import { TemplatesModule } from './templates/templates.module';
import { MessagingModule } from './messaging/messaging.module';
import { AdminModule } from './admin/admin.module';
import { QuickChatModule } from './quick-chat/quick-chat.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    WorkspacesModule,
    MembersModule,
    ApiKeysModule,
    PublicApiModule,
    WalletModule,
    TopupsModule,
    OrdersInvoicesModule,
    OaConnectionsModule,
    TemplatesModule,
    MessagingModule,
    AdminModule,
    QuickChatModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
