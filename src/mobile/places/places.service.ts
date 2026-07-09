import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';

@Injectable()
export class PlacesService {
  constructor(private prisma: PrismaService) {}

  async findAll(categoryName?: string) {
    if (categoryName) {
      const category = await this.prisma.category.findFirst({
        where: { name: categoryName },
      });
      if (category) {
        return this.prisma.place.findMany({
          where: { categoryId: category.id },
          include: { category: true },
        });
      }
    }
    return this.prisma.place.findMany({
      include: { category: true },
    });
  }

  async isDestinationSupported(cityName: string) {
    const place = await this.prisma.place.findFirst({
      where: {
        OR: [
          { address: { contains: cityName, mode: 'insensitive' } },
          { name: { contains: cityName, mode: 'insensitive' } },
        ],
      },
    });
    return !!place;
  }
}
