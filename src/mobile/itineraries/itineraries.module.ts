import { Module } from '@nestjs/common';
import { ItinerariesService } from './itineraries.service';
import { ItinerariesController } from './itineraries.controller';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { WeatherModule } from '../../shared/weather/weather.module';

import { ItinerariesGateway } from './itineraries.gateway';

@Module({
  imports: [PrismaModule, WeatherModule],
  providers: [ItinerariesService, ItinerariesGateway],
  controllers: [ItinerariesController],
  exports: [ItinerariesGateway],
})
export class ItinerariesModule {}
