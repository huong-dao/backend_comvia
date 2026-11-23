import { Module } from '@nestjs/common';
import { EmailModule } from '../integrations/email/email.module';
import { Pay2sModule } from '../integrations/pay2s/pay2s.module';
import { AdminSubscriptionsController } from './admin-subscriptions.controller';
import { AdminSubscriptionsService } from './admin-subscriptions.service';
import { SubscriptionAccessService } from './subscription-access.service';
import { SubscriptionExpiryReminderWorker } from './subscription-expiry-reminder.worker';
import { SubscriptionPaymentsService } from './subscription-payments.service';
import { SubscriptionPlansService } from './subscription-plans.service';
import { SubscriptionPurchasesService } from './subscription-purchases.service';
import { SubscriptionsController } from './subscriptions.controller';

@Module({
  imports: [Pay2sModule, EmailModule],
  controllers: [SubscriptionsController, AdminSubscriptionsController],
  providers: [
    SubscriptionAccessService,
    SubscriptionPlansService,
    SubscriptionPurchasesService,
    SubscriptionPaymentsService,
    AdminSubscriptionsService,
    SubscriptionExpiryReminderWorker,
  ],
  exports: [SubscriptionAccessService, SubscriptionPaymentsService],
})
export class SubscriptionsModule {}
