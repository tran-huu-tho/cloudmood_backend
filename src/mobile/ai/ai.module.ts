import { Module } from '@nestjs/common';
import { MobileAiController } from './ai.controller';
import { MobileAiService } from './ai.service';
import { PrismaModule } from '../../shared/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [MobileAiController],
  providers: [MobileAiService],
  exports: [MobileAiService],
})
export class MobileAiModule {}
