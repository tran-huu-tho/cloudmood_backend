import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';

@Injectable()
export class ExploreService {
  constructor(private prisma: PrismaService) {}

  async findAll(destination?: string) {
    const whereClause: any = {
      status: 'PUBLISHED',
    };
    if (destination) {
      // Clean up the destination string (e.g. split comma and take the first part like "Cần Thơ, Việt Nam" -> "Cần Thơ")
      const searchKeyword = destination.split(',')[0].trim();
      whereClause.OR = [
        { title: { contains: searchKeyword, mode: 'insensitive' } },
        { destination: { contains: searchKeyword, mode: 'insensitive' } }
      ];
    }

    return this.prisma.explorePost.findMany({
      where: whereClause,
      include: {
        author: {
          select: {
            id: true,
            email: true,
            fullName: true,
            avatar: true,
          }
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: number) {
    const post = await this.prisma.explorePost.findUnique({
      where: { id },
      include: {
        author: {
          select: {
            id: true,
            email: true,
            fullName: true,
            avatar: true,
          }
        },
        items: {
          orderBy: {
            sortOrder: 'asc',
          },
          include: {
            place: {
              include: {
                category: true,
                reviews: {
                  take: 5,
                  orderBy: {
                    publishedDate: 'desc',
                  }
                },
              }
            },
            featuredReview: true,
          }
        }
      }
    });

    if (!post) {
      throw new NotFoundException(`ExplorePost with ID ${id} not found`);
    }

    return post;
  }
}
