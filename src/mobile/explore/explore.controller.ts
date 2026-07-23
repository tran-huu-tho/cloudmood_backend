import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
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

  @Post('publish-itinerary/:id')
  @UseGuards(AuthGuard('jwt'))
  publishItinerary(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
  ) {
    return this.exploreService.publishItinerary(id, body, Number(req.user.id));
  }

  @Get('images/search')
  searchImages(@Query('query') query: string, @Query('page') page: string) {
    return this.exploreService.searchImages(query, page ? parseInt(page) : 1);
  }

  @Post('unpublish-itinerary/:id')
  @UseGuards(AuthGuard('jwt'))
  unpublishItinerary(@Param('id', ParseIntPipe) id: number) {
    return this.exploreService.unpublishItinerary(id);
  }

  @Post(':id/like')
  @UseGuards(AuthGuard('jwt'))
  likePost(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.exploreService.likePost(id, Number(req.user.id));
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  removeExplorePost(@Param('id', ParseIntPipe) id: number) {
    return this.exploreService.removeExplorePost(id);
  }

  @Delete(':id/like')
  @UseGuards(AuthGuard('jwt'))
  unlikePost(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.exploreService.unlikePost(id, Number(req.user.id));
  }

  @Get('by-place/:placeId')
  findByPlaceId(@Param('placeId', ParseIntPipe) placeId: number) {
    return this.exploreService.findByPlaceId(placeId);
  }
}
