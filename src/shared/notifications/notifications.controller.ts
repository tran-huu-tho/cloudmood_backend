import { Controller, Get, Post, Delete } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

@Controller('api/admin/notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  getNotifications() {
    return this.notificationsService.getNotifications();
  }

  @Post('read-all')
  markAllAsRead() {
    this.notificationsService.markAllAsRead();
    return { success: true };
  }

  @Delete()
  clearAll() {
    this.notificationsService.clearAll();
    return { success: true };
  }
}
