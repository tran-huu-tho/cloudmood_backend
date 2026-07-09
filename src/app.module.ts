import { Module } from '@nestjs/common';
import { PrismaModule } from './shared/prisma/prisma.module';
import { AuthModule } from './mobile/auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { PlacesModule } from './mobile/places/places.module';
import { ItinerariesModule } from './mobile/itineraries/itineraries.module';
import { ReviewsModule } from './mobile/reviews/reviews.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    PlacesModule,
    ItinerariesModule,
    ReviewsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
