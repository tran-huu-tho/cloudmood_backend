import { Controller, Get, Post, Delete, Param, Body, UseGuards, Request } from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('reviews')
@UseGuards(AuthGuard('jwt'))
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get()
  async findAllByUser(@Request() req) {
    return this.reviewsService.findAllByUser(req.user.id.toString());
  }

  @Post()
  async create(@Request() req, @Body() body: any) {
    return this.reviewsService.create(req.user.id.toString(), body);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.reviewsService.delete(id);
  }
}
