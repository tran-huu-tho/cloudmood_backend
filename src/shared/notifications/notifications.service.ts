import { Injectable } from '@nestjs/common';

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
  private notifications: NotificationItem[] = [
    {
      id: 1,
      type: 'warning',
      title: 'Đánh giá mới cần kiểm duyệt',
      message:
        'Có 1 nhận xét 1 sao mới tại "Quán Ăn Cây Trứng Cá" cần admin xử lý.',
      createdAt: new Date(Date.now() - 5 * 60000), // 5 mins ago
      isRead: false,
    },
    {
      id: 2,
      type: 'rotation',
      title: 'Xoay vòng API Key thành công',
      message:
        'Key số 1 bị cạn hạn ngạch (429). Đã tự động xoay vòng sang Key số 2.',
      createdAt: new Date(Date.now() - 15 * 60000), // 15 mins ago
      isRead: false,
    },
    {
      id: 3,
      type: 'info',
      title: 'Trợ lý AI (MoodBros) sẵn sàng',
      message: 'Cấu hình hoàn tất 9 API Key mới. Khả năng xử lý tăng mạnh.',
      createdAt: new Date(Date.now() - 60 * 60000), // 1 hour ago
      isRead: false,
    },
  ];
  private nextId = 4;

  getNotifications(): NotificationItem[] {
    return this.notifications;
  }

  addNotification(
    type: 'warning' | 'rotation' | 'info',
    title: string,
    message: string,
  ) {
    const item: NotificationItem = {
      id: this.nextId++,
      type,
      title,
      message,
      createdAt: new Date(),
      isRead: false,
    };
    this.notifications.unshift(item);

    // Keep max 30 items
    if (this.notifications.length > 30) {
      this.notifications = this.notifications.slice(0, 30);
    }
    return item;
  }

  markAllAsRead() {
    this.notifications = this.notifications.map((n) => ({
      ...n,
      isRead: true,
    }));
  }

  clearAll() {
    this.notifications = [];
  }
}
