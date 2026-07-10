import { Module } from '@nestjs/common';
import { ItinerariesService } from './itineraries.service';
import { ItinerariesController } from './itineraries.controller';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { WeatherModule } from '../../shared/weather/weather.module';

@Module({
  imports: [PrismaModule, WeatherModule],
  providers: [ItinerariesService],
  controllers: [ItinerariesController],
})
export class ItinerariesModule {}

