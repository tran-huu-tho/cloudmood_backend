import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AdminGuard } from '../shared/guards/admin.guard';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(AuthGuard('jwt'), AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // 1. Dashboard & Statistics
  @Get('dashboard/stats')
  async getDashboardStats() {
    return this.adminService.getDashboardStats();
  }

  @Get('itineraries')
  async getItineraries(@Query('limit') limit?: string) {
    const limitNum = limit ? parseInt(limit) : 10000;
    return this.adminService.getItineraries(limitNum);
  }

  // 2. User Management
  @Get('users')
  async getUsers(
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page) : 1;
    const limitNum = limit ? parseInt(limit) : 15;
    return this.adminService.getUsers(search, pageNum, limitNum);
  }

  @Post('users')
  async createUser(@Body() body: any) {
    return this.adminService.createUser(body);
  }

  @Put('users/:id/block')
  async toggleBlockUser(
    @Param('id') id: string,
    @Body('isBlocked') isBlocked: boolean,
  ) {
    return this.adminService.toggleBlockUser(id, isBlocked);
  }

  // 3. Category Management
  @Get('categories')
  async getCategories() {
    return this.adminService.getCategories();
  }

  @Post('categories')
  async createCategory(@Body() body: any) {
    return this.adminService.createCategory(body);
  }

  @Put('categories/:id')
  async updateCategory(@Param('id') id: string, @Body() body: any) {
    return this.adminService.updateCategory(id, body);
  }

  @Delete('categories/:id')
  async deleteCategory(@Param('id') id: string) {
    return this.adminService.deleteCategory(id);
  }

  // 4. Places & Photos Management
  @Get('places')
  async getPlaces(
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('isApproved') isApproved?: string,
  ) {
    const pageNum = page ? parseInt(page) : 1;
    const limitNum = limit ? parseInt(limit) : 15;
    return this.adminService.getPlaces(search, categoryId, pageNum, limitNum, isApproved);
  }

  @Get('places/:id')
  async getPlaceDetails(@Param('id') id: string) {
    return this.adminService.getPlaceDetails(id);
  }

  @Post('places')
  async createPlace(@Body() body: any) {
    return this.adminService.createPlace(body);
  }

  @Put('places/:id')
  async updatePlace(@Param('id') id: string, @Body() body: any) {
    return this.adminService.updatePlace(id, body);
  }

  @Delete('places/:id')
  async deletePlace(@Param('id') id: string) {
    return this.adminService.deletePlace(id);
  }

  // 5. Photos Management
  @Post('places/:id/photos')
  async addPlacePhoto(@Param('id') placeId: string, @Body() body: any) {
    return this.adminService.addPlacePhoto(placeId, body);
  }

  @Delete('places/photos/:photoId')
  async deletePlacePhoto(@Param('photoId') photoId: string) {
    return this.adminService.deletePlacePhoto(photoId);
  }

  @Post('places/:id/reviews')
  async addPlaceReview(@Param('id') placeId: string, @Body() body: any) {
    return this.adminService.addPlaceReview(placeId, body);
  }

  // 6. Bulk Import
  @Post('places/import')
  async importPlaces(@Body() body: any) {
    const places = Array.isArray(body) ? body : body.places;
    return this.adminService.importPlaces(places);
  }

  // 7. Weather Cache Management
  @Get('weather/cache')
  async getWeatherCache() {
    return this.adminService.getWeatherCache();
  }

  @Delete('weather/cache/:id')
  async deleteWeatherCache(@Param('id') id: string) {
    return this.adminService.deleteWeatherCache(id);
  }

  @Delete('weather/cache')
  async clearAllWeatherCache() {
    return this.adminService.clearAllWeatherCache();
  }
}
