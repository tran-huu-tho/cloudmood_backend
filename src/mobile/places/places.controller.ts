import { Controller, Get, Post, Query, Param, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PlacesService } from './places.service';

@Controller('places')
export class PlacesController {
  constructor(private readonly placesService: PlacesService) {}

  @Get()
  async findAll(@Query('categoryName') categoryName?: string) {
    return this.placesService.findAll(categoryName);
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
  ) {
    return this.placesService.searchPlaces(destination, query, categoryName);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  async proposePlace(@Body() body: any) {
    return this.placesService.proposePlace(body);
  }
}
