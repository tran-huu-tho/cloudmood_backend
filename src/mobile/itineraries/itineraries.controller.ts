import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { ItinerariesService } from './itineraries.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('itineraries')
export class ItinerariesController {
  constructor(private readonly itinerariesService: ItinerariesService) {}

  @Get('accept-invite')
  async acceptInvite(@Query('token') token: string, @Request() req) {
    const userId = req.user?.id ? req.user.id.toString() : undefined;
    const res = await this.itinerariesService.acceptInvite(token, userId);

    return `
      <!DOCTYPE html>
      <html lang="vi">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Xác nhận tham gia chuyến đi - Cloudmood</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f3f4f6; margin: 0; padding: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
          .card { background: white; padding: 40px; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.08); max-width: 420px; width: 90%; text-align: center; }
          .icon { width: 70px; height: 70px; background: #eff6ff; color: #2563eb; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; font-size: 36px; }
          h2 { color: #1e293b; margin-bottom: 12px; }
          p { color: #64748b; font-size: 15px; line-height: 1.6; margin-bottom: 28px; }
          .btn { background: #2563eb; color: white; border: none; padding: 14px 28px; font-size: 15px; font-weight: 600; border-radius: 10px; cursor: pointer; text-decoration: none; display: inline-block; width: 100%; box-sizing: border-box; }
          .btn:hover { background: #1d4ed8; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="icon">🎉</div>
          <h2>Xác nhận lời mời</h2>
          <p>${res.message}</p>
          <a href="cloudmood://invite?token=${token}" class="btn">Mở ứng dụng Cloudmood</a>
        </div>
      </body>
      </html>
    `;
  }

  @Get()
  @UseGuards(AuthGuard('jwt'))
  async findAll(@Request() req, @Query('isGuide') isGuide: string) {
    return this.itinerariesService.findAllByUser(
      req.user.id.toString(),
      isGuide === 'true',
    );
  }

  @Get('fix-db')
  async fixDb() {
    return this.itinerariesService.fixDb();
  }

  @Get('checklist-templates')
  async getChecklistTemplates() {
    return this.itinerariesService.getChecklistTemplates();
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

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.itinerariesService.remove(+id);
  }

  @Put(':id/day-configs')
  async updateDayConfigs(@Param('id') id: string, @Body() body: any) {
    return this.itinerariesService.updateDayConfigs(+id, body);
  }

  @Post(':id/shift-details')
  async shiftDetails(@Param('id') id: string, @Body() body: any) {
    return this.itinerariesService.shiftDetailsDays(
      +id,
      body.targetDay,
      body.offset,
    );
  }

  @Delete(':id/details/day/:day')
  async deleteDetailsForDay(
    @Param('id') id: string,
    @Param('day') day: string,
  ) {
    return this.itinerariesService.deleteDetailsForDay(+id, +day);
  }

  @Post('details')
  async addDetail(@Request() req, @Body() body: any) {
    return this.itinerariesService.addDetail(body, req.user?.id?.toString());
  }

  @Put('details/:id')
  async updateDetail(@Request() req, @Param('id') id: string, @Body() body: any) {
    return this.itinerariesService.updateDetail(+id, body, req.user?.id?.toString());
  }

  @Delete('details/:id')
  async deleteDetail(@Request() req, @Param('id') id: string) {
    return this.itinerariesService.deleteDetail(+id, req.user?.id?.toString());
  }

  @Post('saved-places')
  async addSavedPlace(@Request() req, @Body() body: any) {
    return this.itinerariesService.addSavedPlace(body, req.user?.id?.toString());
  }

  @Put('saved-places/:id')
  async updateSavedPlace(@Request() req, @Param('id') id: string, @Body() body: any) {
    return this.itinerariesService.updateSavedPlace(+id, body, req.user?.id?.toString());
  }

  @Delete('saved-places/:id')
  async deleteSavedPlace(@Request() req, @Param('id') id: string) {
    return this.itinerariesService.deleteSavedPlace(+id, req.user?.id?.toString());
  }

  @Delete(':id/saved-places/section/:section')
  async deleteSavedPlacesBySection(
    @Request() req,
    @Param('id') id: string,
    @Param('section') section: string,
  ) {
    return this.itinerariesService.deleteSavedPlacesBySection(+id, section, req.user?.id?.toString());
  }

  @Post('saved-places/bulk-delete')
  async deleteMultipleSavedPlaces(@Request() req, @Body() body: { ids: number[] }) {
    return this.itinerariesService.deleteMultipleSavedPlaces(body.ids, req.user?.id?.toString());
  }

  @Post('sections')
  async upsertSection(@Request() req, @Body() body: any) {
    return this.itinerariesService.upsertSection(body, req.user?.id?.toString());
  }

  @Delete(':id/sections/:name')
  async deleteSection(@Request() req, @Param('id') id: string, @Param('name') name: string) {
    return this.itinerariesService.deleteSection(+id, name, req.user?.id?.toString());
  }

  // --- API CHIA SẺ & QUẢN LÝ THÀNH VIÊN ---

  @Post(':id/invite-email')
  @UseGuards(AuthGuard('jwt'))
  async inviteByEmail(
    @Param('id') id: string,
    @Request() req,
    @Body('email') email: string,
  ) {
    return this.itinerariesService.inviteByEmail(+id, req.user.id.toString(), email);
  }

  @Post(':id/share-link')
  @UseGuards(AuthGuard('jwt'))
  async getShareLink(@Param('id') id: string, @Request() req) {
    return this.itinerariesService.getShareLink(+id, req.user.id.toString());
  }

  @Get(':id/members')
  @UseGuards(AuthGuard('jwt'))
  async getMembers(@Param('id') id: string, @Request() req) {
    return this.itinerariesService.getMembers(+id, req.user.id.toString());
  }

  @Put(':id/members/:userId')
  @UseGuards(AuthGuard('jwt'))
  async updateMemberRole(
    @Param('id') id: string,
    @Param('userId') targetUserId: string,
    @Request() req,
    @Body('role') role: string,
  ) {
    return this.itinerariesService.updateMemberRole(
      +id,
      req.user.id.toString(),
      targetUserId,
      role,
    );
  }

  @Delete(':id/members/:userId')
  @UseGuards(AuthGuard('jwt'))
  async removeMember(
    @Param('id') id: string,
    @Param('userId') targetUserId: string,
    @Request() req,
  ) {
    return this.itinerariesService.removeMember(
      +id,
      req.user.id.toString(),
      targetUserId,
    );
  }

  @Post(':id/duplicate')
  @UseGuards(AuthGuard('jwt'))
  async duplicateItinerary(@Param('id') id: string, @Request() req) {
    return this.itinerariesService.duplicateItinerary(+id, req.user.id.toString());
  }
}
