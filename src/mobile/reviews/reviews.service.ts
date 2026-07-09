import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';

@Injectable()
export class ReviewsService {
  constructor(private prisma: PrismaService) {}

  async findAllByUser(userId: string) {
    return this.prisma.review.findMany({
      where: { userId: BigInt(userId) },
      include: { place: true },
      orderBy: { id: 'desc' },
    });
  }

  async create(userId: string, data: any) {
    return this.prisma.review.create({
      data: {
        rating: data.rating,
        comment: data.comment,
        userId: BigInt(userId),
        placeId: BigInt(data.placeId),
        authorName: data.authorName,
        authorAvatar: data.authorAvatar,
        publishedDate: new Date(),
        source: 'LOCAL',
      },
    });
  }
}
