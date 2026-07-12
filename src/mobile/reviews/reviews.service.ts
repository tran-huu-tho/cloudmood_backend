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

  async delete(id: string) {
    return this.prisma.review.delete({
      where: { id: BigInt(id) },
      select: {
        id: true,
        rating: true,
        comment: true,
        placeId: true,
        externalReviewId: true,
        authorName: true,
        authorAvatar: true,
        authorLocation: true,
        publishedDate: true,
        source: true,
      },
    });
  }

  async findByPlace(placeId: string) {
    const reviews = await this.prisma.review.findMany({
      where: { placeId: BigInt(placeId) },
      orderBy: { publishedDate: 'desc' },
    });
    return reviews.map((r) => ({
      ...r,
      id: r.id.toString(),
      placeId: r.placeId?.toString(),
    }));
  }
}
