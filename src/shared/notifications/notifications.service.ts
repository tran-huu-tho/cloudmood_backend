import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface NotificationItem {
  id: number;
  type: 'warning' | 'rotation' | 'info';
  title: string;
  message: string;
  createdAt: Date;
  isRead: boolean;
}

@Injectable()
export class NotificationsService {
  private inMemoryNotifications: NotificationItem[] = [];
  private nextId = 1000;

  constructor(private readonly prisma: PrismaService) {}

  async getNotifications(): Promise<NotificationItem[]> {
    return this.inMemoryNotifications;
  }

  addNotification(
    type: 'warning' | 'rotation' | 'info',
    title: string,
    message: string,
  ) {
    if (type === 'rotation') return null; // Ignore API rotation notifications

    const item: NotificationItem = {
      id: this.nextId++,
      type,
      title,
      message,
      createdAt: new Date(),
      isRead: false,
    };
    this.inMemoryNotifications.unshift(item);

    if (this.inMemoryNotifications.length > 30) {
      this.inMemoryNotifications = this.inMemoryNotifications.slice(0, 30);
    }
    return item;
  }

  markAllAsRead() {
    this.inMemoryNotifications = this.inMemoryNotifications.map((n) => ({
      ...n,
      isRead: true,
    }));
  }

  clearAll() {
    this.inMemoryNotifications = [];
  }
}
