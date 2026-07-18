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
      where: { id: BigInt(id) },
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

  async create(data: any, userId: number) {
    return this.prisma.explorePost.create({
      data: {
        title: data.title,
        description: data.description || null,
        destination: data.destination || null,
        coverImage: data.coverImage || null,
        postType: data.postType || 'USER_GUIDE',
        status: data.status || 'DRAFT',
        authorId: BigInt(userId),
        items: {
          create: (data.items || []).map((item: any, index: number) => ({
            itemType: item.itemType,
            sortOrder: item.sortOrder ?? index,
            content: item.content || null,
            placeId: item.placeId ? BigInt(item.placeId) : null,
          })),
        },
      },
      include: {
        items: true,
      }
    });
  }
}
