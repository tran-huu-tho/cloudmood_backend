import { Controller, Get, Post, Query, Param, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PlacesService } from './places.service';

@Controller('places')
export class PlacesController {
  constructor(private readonly placesService: PlacesService) {}

  @Get()
  async findAll(
    @Query('categoryName') categoryName?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('query') query?: string,
    @Query('priceLevels') priceLevels?: string,
    @Query('minRating') minRating?: string,
    @Query('amenities') amenities?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : undefined;
    const limitNum = limit ? parseInt(limit, 10) : undefined;
    const ratingNum = minRating ? parseFloat(minRating) : undefined;
    const priceLevelArray = priceLevels ? priceLevels.split(',') : undefined;
    const amenitiesArray = amenities ? amenities.split(',') : undefined;
    return this.placesService.findAll(categoryName, pageNum, limitNum, query, priceLevelArray, ratingNum, amenitiesArray);
  }

  @Get('check-destination')
  async checkDestination(@Query('cityName') cityName: string) {
    const isSupported = await this.placesService.isDestinationSupported(cityName);
    return { supported: isSupported };
  }

  @Get('search')
  async search(
    @Query('destination') destination: string,
    @Query('query') query?: string,
    @Query('categoryName') categoryName?: string,
    @Query('priceLevels') priceLevels?: string,
    @Query('minRating') minRating?: string,
    @Query('amenities') amenities?: string,
  ) {
    const ratingNum = minRating ? parseFloat(minRating) : undefined;
    const priceLevelArray = priceLevels ? priceLevels.split(',') : undefined;
    const amenitiesArray = amenities ? amenities.split(',') : undefined;
    return this.placesService.searchPlaces(destination, query, categoryName, priceLevelArray, ratingNum, amenitiesArray);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  async proposePlace(@Body() body: any) {
    return this.placesService.proposePlace(body);
  }
}
