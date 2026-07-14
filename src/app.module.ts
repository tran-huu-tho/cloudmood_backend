import { Module } from '@nestjs/common';
import { PrismaModule } from './shared/prisma/prisma.module';
import { AuthModule } from './mobile/auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { PlacesModule } from './mobile/places/places.module';
import { ItinerariesModule } from './mobile/itineraries/itineraries.module';
import { ReviewsModule } from './mobile/reviews/reviews.module';
import { CategoriesModule } from './mobile/categories/categories.module';
import { WeatherModule } from './shared/weather/weather.module';
import { NotificationsModule } from './shared/notifications/notifications.module';
import { AdminAiModule } from './admin/ai/ai.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    PlacesModule,
    ItinerariesModule,
    ReviewsModule,
    WeatherModule,
    CategoriesModule,
    NotificationsModule,
    AdminAiModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}

