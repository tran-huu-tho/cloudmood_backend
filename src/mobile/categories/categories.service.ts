import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async getCategories() {
    const categories = await this.prisma.category.findMany({
      orderBy: { id: 'asc' },
    });

    const iconMap: Record<string, number> = {
      'Nhà hàng': 0xf011c,
      'Khách sạn': 0xe32a,
      'Quán ăn': 0xe25a,
      'Cà phê': 0xe374,
      'Trung tâm thương mại': 0xf016e,
      'Công viên': 0xf0064,
      'Điểm tham quan': 0xf0244,
      'Trường học': 0xe559,
      'Bảo tàng': 0xe418,
      'Quán bar': 0xe368,
      'Check-in': 0xe131,
    };

    return categories.map((cat) => {
      let iconCode = cat.iconCode;
      if (!iconCode) {
        for (const [key, code] of Object.entries(iconMap)) {
          if (cat.name.toLowerCase().includes(key.toLowerCase())) {
            iconCode = code;
            break;
          }
        }
      }
      return {
        ...cat,
        id: cat.id.toString(),
        iconCode: iconCode || 0xe53f,
      };
    });
  }
}
