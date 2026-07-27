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
  private inMemoryNotifications: NotificationItem[] = [
    {
      id: 9991,
      type: 'warning',
      title: 'Đánh giá mới cần kiểm duyệt',
      message:
        'Có 1 nhận xét 1 sao mới tại "Quán Ăn Cây Trứng Cá" cần admin xử lý.',
      createdAt: new Date(Date.now() - 15 * 60000),
      isRead: false,
    },
  ];
  private nextId = 1000;

  constructor(private readonly prisma: PrismaService) {}

  async getNotifications(): Promise<NotificationItem[]> {
    try {
      // Query places pending approval (isApproved === false)
      const pendingPlaces = await this.prisma.place.findMany({
        where: { isApproved: false },
        take: 10,
        orderBy: { id: 'desc' },
      });

      const pendingNotifications: NotificationItem[] = pendingPlaces.map((p, idx) => ({
        id: Number(p.id) || (idx + 1),
        type: 'warning',
        title: 'Địa điểm mới cần được duyệt',
        message: `Địa điểm "${p.name}" (${p.address || 'Chưa có địa chỉ'}) vừa được đề xuất và đang chờ admin phê duyệt.`,
        createdAt: (p as any).createdAt ? new Date((p as any).createdAt) : new Date(),
        isRead: false,
      }));

      return [...pendingNotifications, ...this.inMemoryNotifications];
    } catch (e) {
      return this.inMemoryNotifications;
    }
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
