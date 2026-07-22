import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'))
  async findAllByUser(@Request() req) {
    return this.reviewsService.findAllByUser(req.user.id.toString());
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  async create(@Request() req, @Body() body: any) {
    return this.reviewsService.create(req.user.id.toString(), body);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  async delete(@Param('id') id: string) {
    return this.reviewsService.delete(id);
  }

  @Get('place/:placeId')
  async findByPlace(@Param('placeId') placeId: string) {
    return this.reviewsService.findByPlace(placeId);
  }
}
