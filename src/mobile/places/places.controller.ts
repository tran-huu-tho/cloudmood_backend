import { Controller, Get, Query, Param } from '@nestjs/common';
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
}
