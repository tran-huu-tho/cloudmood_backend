import { Module } from '@nestjs/common';
import { MobileAiController } from './ai.controller';
import { MobileAiService } from './ai.service';
import { RuleEngineService } from './rule-engine.service';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { WeatherModule } from '../../shared/weather/weather.module';

@Module({
  imports: [PrismaModule, WeatherModule],
  controllers: [MobileAiController],
  providers: [MobileAiService, RuleEngineService],
  exports: [MobileAiService, RuleEngineService],
})
export class MobileAiModule {}

