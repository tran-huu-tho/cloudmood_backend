import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request, Query } from '@nestjs/common';
import { ItinerariesService } from './itineraries.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('itineraries')
@UseGuards(AuthGuard('jwt'))
export class ItinerariesController {
  constructor(private readonly itinerariesService: ItinerariesService) {}

  @Get()
  async findAll(@Request() req) {
    return this.itinerariesService.findAllByUser(req.user.id.toString());
  }

  @Get('fix-db')
  async fixDb() {
    return this.itinerariesService.fixDb();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.itinerariesService.findOne(+id);
  }

  @Post()
  async create(@Request() req, @Body() body: any) {
    return this.itinerariesService.create(req.user.id.toString(), body);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: any) {
    return this.itinerariesService.update(+id, body);
  }

  @Put(':id/day-configs')
  async updateDayConfigs(@Param('id') id: string, @Body() body: any) {
    return this.itinerariesService.updateDayConfigs(+id, body);
  }

  @Post(':id/shift-details')
  async shiftDetails(@Param('id') id: string, @Body() body: any) {
    return this.itinerariesService.shiftDetailsDays(+id, body.targetDay, body.offset);
  }

  @Delete(':id/details/day/:day')
  async deleteDetailsForDay(@Param('id') id: string, @Param('day') day: string) {
    return this.itinerariesService.deleteDetailsForDay(+id, +day);
  }

  @Post('details')
  async addDetail(@Body() body: any) {
    return this.itinerariesService.addDetail(body);
  }

  @Put('details/:id')
  async updateDetail(@Param('id') id: string, @Body() body: any) {
    return this.itinerariesService.updateDetail(+id, body);
  }

  @Delete('details/:id')
  async deleteDetail(@Param('id') id: string) {
    return this.itinerariesService.deleteDetail(+id);
  }

  @Post('saved-places')
  async addSavedPlace(@Body() body: any) {
    return this.itinerariesService.addSavedPlace(body);
  }

  @Put('saved-places/:id')
  async updateSavedPlace(@Param('id') id: string, @Body() body: any) {
    return this.itinerariesService.updateSavedPlace(+id, body);
  }

  @Delete('saved-places/:id')
  async deleteSavedPlace(@Param('id') id: string) {
    return this.itinerariesService.deleteSavedPlace(+id);
  }

  @Delete(':id/saved-places/section/:section')
  async deleteSavedPlacesBySection(@Param('id') id: string, @Param('section') section: string) {
    return this.itinerariesService.deleteSavedPlacesBySection(+id, section);
  }

  @Post('saved-places/bulk-delete')
  async deleteMultipleSavedPlaces(@Body() body: { ids: number[] }) {
    return this.itinerariesService.deleteMultipleSavedPlaces(body.ids);
  }

  @Post('sections')
  async upsertSection(@Body() body: any) {
    return this.itinerariesService.upsertSection(body);
  }

  @Delete(':id/sections/:name')
  async deleteSection(@Param('id') id: string, @Param('name') name: string) {
    return this.itinerariesService.deleteSection(+id, name);
  }
}
