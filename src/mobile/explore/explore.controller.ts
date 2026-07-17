import { Controller, Get, Post, Body, Param, ParseIntPipe, Query, UseGuards, Request } from '@nestjs/common';
import { ExploreService } from './explore.service';
import { AuthGuard } from '@nestjs/passport';

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

  @Post()
  @UseGuards(AuthGuard('jwt'))
  create(@Request() req, @Body() body: any) {
    return this.exploreService.create(body, Number(req.user.id));
  }
}
