import { Module } from '@nestjs/common';
import { MembersModule } from '../members/members.module';
import { MessagingModule } from '../messaging/messaging.module';
import { TemplatesModule } from '../templates/templates.module';
import { TopupsModule } from '../topups/topups.module';
import { WalletModule } from '../wallet/wallet.module';
import { QuickChatAdminController } from './quick-chat-admin.controller';
import { QuickChatController } from './quick-chat.controller';
import { QuickChatInternalController } from './quick-chat-internal.controller';
import { QuickChatOrchestratorService } from './quick-chat-orchestrator.service';
import { QuickChatService } from './quick-chat.service';
import { QuickChatToolExecutorService } from './quick-chat-tool-executor.service';
import { QuickChatToolRegistryService } from './quick-chat-tool-registry.service';

@Module({
  imports: [
    WalletModule,
    TemplatesModule,
    MembersModule,
    TopupsModule,
    MessagingModule,
  ],
  controllers: [
    QuickChatController,
    QuickChatInternalController,
    QuickChatAdminController,
  ],
  providers: [
    QuickChatToolRegistryService,
    QuickChatOrchestratorService,
    QuickChatToolExecutorService,
    QuickChatService,
  ],
})
export class QuickChatModule {}
