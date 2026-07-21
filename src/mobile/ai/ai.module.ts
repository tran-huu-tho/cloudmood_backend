import { Module } from '@nestjs/common';
import { MobileAiController } from './ai.controller';
import { MobileAiService } from './ai.service';

@Module({
  controllers: [MobileAiController],
  providers: [MobileAiService],
  exports: [MobileAiService],
})
export class MobileAiModule {}
