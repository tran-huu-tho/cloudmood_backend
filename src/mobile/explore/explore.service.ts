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
        { destination: { contains: searchKeyword, mode: 'insensitive' } },
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
          },
        },
        likes: {
          select: { userId: true },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: number) {
    // Increment viewCount before fetching
    await this.prisma.explorePost.update({
      where: { id: BigInt(id) },
      data: { viewCount: { increment: 1 } },
    });

    const post = await this.prisma.explorePost.findUnique({
      where: { id: BigInt(id) },
      include: {
        author: {
          select: {
            id: true,
            email: true,
            fullName: true,
            avatar: true,
          },
        },
        originalItinerary: {
          include: {
            sections: true,
          },
        },
        likes: {
          select: { userId: true },
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
                  },
                },
              },
            },
            featuredReview: true,
          },
        },
      },
    });

    if (!post) {
      throw new NotFoundException(`ExplorePost with ID ${id} not found`);
    }

    return post;
  }

  async searchImages(query: string, page: number = 1) {
    if (!query) {
      return { results: [] };
    }

    const pageSize = 20;
    const skip = (page - 1) * pageSize;

    // Only scenic/landmark/attraction categories - exact names from Category table
    // Allowed scenic categories: Công viên (31), Điểm tham quan (32), Sights & Landmarks (40)
    const SCENIC_CATEGORY_IDS = [31, 32, 40];

    const searchKeyword = query.split(',')[0].trim();

    const photos = await this.prisma.placePhoto.findMany({
      where: {
        place: {
          AND: [
            {
              OR: [
                { name: { contains: searchKeyword, mode: 'insensitive' } },
                { address: { contains: searchKeyword, mode: 'insensitive' } },
              ],
            },
            {
              // Only include places from scenic categories
              categoryId: { in: SCENIC_CATEGORY_IDS.map((id) => BigInt(id)) },
            },
          ],
        },
      },
      include: {
        place: {
          select: {
            name: true,
            subCategories: true,
            category: { select: { name: true } },
          },
        },
      },
      take: pageSize * 3, // fetch more to allow client-side filtering
      skip: skip,
    });

    // Additionally filter by subCategories JSON - keep only scenic types
    const SCENIC_TYPES = [
      'tourist_attraction',
      'natural_feature',
      'park',
      'point_of_interest',
      'establishment',
      'landmark',
      'monument',
      'place_of_worship',
      'museum',
      'amusement_park',
      'aquarium',
      'art_gallery',
      'zoo',
      'stadium',
      'campground',
      'rv_park',
      'cemetery',
      'church',
      'hindu_temple',
      'mosque',
      'synagogue',
      'travel_agency',
    ];

    const EXCLUDED_TYPES = [
      'restaurant',
      'food',
      'bar',
      'cafe',
      'bakery',
      'meal_delivery',
      'meal_takeaway',
      'lodging',
      'hotel',
      'motel',
      'shopping_mall',
      'store',
      'supermarket',
      'grocery_or_supermarket',
      'hospital',
      'school',
      'university',
      'bank',
      'atm',
      'gas_station',
    ];

    const filtered = photos.filter((photo) => {
      const sub = photo.place?.subCategories;
      if (!sub) return true; // if no subCategories, include by default

      const types = (
        Array.isArray(sub)
          ? sub
          : typeof sub === 'object'
            ? Object.values(sub as any).flat()
            : []
      ) as string[];

      const hasExcluded = types.some((t) => EXCLUDED_TYPES.includes(t));
      if (hasExcluded) return false;

      // If has scenic types, definitely include
      const hasScenic = types.some((t) => SCENIC_TYPES.includes(t));
      return hasScenic || types.length === 0;
    });

    const paged = filtered.slice(0, pageSize);

    return {
      results: paged.map((p) => ({
        url: p.urlOriginal || p.urlThumbnail,
        name: p.place?.name,
      })),
      page,
      hasMore: filtered.length > pageSize,
    };
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
      },
    });
  }

  async publishItinerary(itineraryId: number, data: any, userId: number) {
    let post = await this.prisma.explorePost.findFirst({
      where: { originalItineraryId: BigInt(itineraryId) },
    });

    if (post) {
      await this.prisma.explorePostItem.deleteMany({
        where: { postId: post.id },
      });
      post = await this.prisma.explorePost.update({
        where: { id: post.id },
        data: {
          title: data.title,
          description: data.description || null,
          destination: data.destination || null,
          coverImage: data.coverImage || null,
          status: 'PUBLISHED',
          items: {
            create: (data.items || []).map((item: any, index: number) => ({
              itemType: item.itemType,
              sortOrder: item.sortOrder ?? index,
              content: item.content || null,
              placeId: item.placeId ? BigInt(item.placeId) : null,
            })),
          },
        },
      });
    } else {
      post = await this.prisma.explorePost.create({
        data: {
          title: data.title,
          description: data.description || null,
          destination: data.destination || null,
          coverImage: data.coverImage || null,
          postType: data.postType || 'USER_GUIDE',
          status: 'PUBLISHED',
          authorId: BigInt(userId),
          originalItineraryId: BigInt(itineraryId),
          items: {
            create: (data.items || []).map((item: any, index: number) => ({
              itemType: item.itemType,
              sortOrder: item.sortOrder ?? index,
              content: item.content || null,
              placeId: item.placeId ? BigInt(item.placeId) : null,
            })),
          },
        },
      });
    }

    return post;
  }

  async unpublishItinerary(itineraryId: number) {
    const post = await this.prisma.explorePost.findFirst({
      where: { originalItineraryId: BigInt(itineraryId) },
    });

    if (post) {
      return this.prisma.explorePost.update({
        where: { id: post.id },
        data: { status: 'DRAFT' },
      });
    }

    return { success: true, message: 'Not found or already unpublished' };
  }

  async likePost(postId: number, userId: number) {
    const pId = BigInt(postId);
    const uId = BigInt(userId);
    const existing = await this.prisma.explorePostLike.findUnique({
      where: { postId_userId: { postId: pId, userId: uId } },
    });

    if (!existing) {
      await this.prisma.explorePostLike.create({
        data: { postId: pId, userId: uId },
      });
      await this.prisma.explorePost.update({
        where: { id: pId },
        data: { likeCount: { increment: 1 } },
      });
    }
    return { success: true };
  }

  async unlikePost(postId: number, userId: number) {
    const pId = BigInt(postId);
    const uId = BigInt(userId);
    const existing = await this.prisma.explorePostLike.findUnique({
      where: { postId_userId: { postId: pId, userId: uId } },
    });

    if (existing) {
      await this.prisma.explorePostLike.delete({
        where: { postId_userId: { postId: pId, userId: uId } },
      });
      await this.prisma.explorePost.update({
        where: { id: pId },
        data: { likeCount: { decrement: 1 } },
      });
    }
    return { success: true };
  }

  async findByPlaceId(placeId: number) {
    return this.prisma.explorePost.findMany({
      where: {
        status: 'PUBLISHED',
        items: {
          some: {
            placeId: BigInt(placeId),
          },
        },
      },
      include: {
        author: {
          select: {
            id: true,
            email: true,
            fullName: true,
            avatar: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async removeExplorePost(id: number) {
    const postId = BigInt(id);
    await this.prisma.explorePostItem.deleteMany({ where: { postId } });
    await this.prisma.explorePostLike.deleteMany({ where: { postId } });
    return this.prisma.explorePost.delete({ where: { id: postId } });
  }
}
