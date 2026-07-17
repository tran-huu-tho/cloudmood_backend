import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ExploreService } from './explore.service';

@Controller('explore')
export class ExploreController {
  constructor(private readonly exploreService: ExploreService) {}

  @Get()
  findAll(@Query('destination') destination?: string) {
    return this.exploreService.findAll(destination);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.exploreService.findOne(id);
  }
}
