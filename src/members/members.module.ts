import { Module } from '@nestjs/common';
import { EmailModule } from '../integrations/email/email.module';
import { MembersController } from './members.controller';
import { MembersService } from './members.service';

@Module({
  imports: [EmailModule],
  controllers: [MembersController],
  providers: [MembersService],
  exports: [MembersService],
})
export class MembersModule {}
