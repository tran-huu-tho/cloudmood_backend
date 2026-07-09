import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';

@Injectable()
export class ReviewsService {
  constructor(private prisma: PrismaService) {}

  async findAllByUser(userId: string) {
    // Cannot filter by user since userId is removed from Review
    return [];
  }

  async create(userId: string, data: any) {
    return this.prisma.review.create({
      data: {
        rating: data.rating,
        comment: data.comment,
        placeId: BigInt(data.placeId),
        authorName: data.authorName,
        authorAvatar: data.authorAvatar,
        publishedDate: new Date(),
        source: 'LOCAL',
      },
    });
  }
}
