import {
  Injectable,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  // 1. Dashboard & Statistics
  async getDashboardStats() {
    const [userCount, placeCount, itineraryCount, reviewCount, categoryCount, reviewAvg] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.place.count(),
        this.prisma.itinerary.count(),
        this.prisma.review.count(),
        this.prisma.category.count(),
        this.prisma.review.aggregate({
          _avg: { rating: true },
        }),
      ]);

    const recentReviews = await this.prisma.review.findMany({
      orderBy: { id: 'desc' },
      take: 3,
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            avatar: true,
          },
        },
        place: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return {
      stats: {
        userCount,
        placeCount,
        itineraryCount,
        reviewCount,
        categoryCount,
        avgReviewRating: reviewAvg._avg.rating ? Number(reviewAvg._avg.rating.toFixed(1)) : 0,
      },
      recentReviews,
    };
  }

  async getItineraries(
    limit: number = 10000,
    type?: string,
    isAi?: string,
  ) {
    const where: any = {};
    if (type === 'guide') {
      where.isGuide = true;
    } else if (type === 'trip') {
      where.OR = [{ isGuide: false }, { isGuide: null }];
    }

    if (isAi === 'true') {
      where.isAi = true;
    } else if (isAi === 'false') {
      where.isAi = false;
    }

    const itineraries = await this.prisma.itinerary.findMany({
      where,
      orderBy: { id: 'desc' },
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            avatar: true,
          },
        },
        _count: {
          select: {
            savedPlaces: true,
            details: true,
            expenses: true,
            members: true,
          },
        },
        expenses: true,
      },
    });

    const result = itineraries.map((it) => ({
      ...it,
      id: it.id.toString(),
      userId: it.userId.toString(),
      expenses: (it.expenses || []).map((e) => ({
        id: e.id.toString(),
        itineraryId: e.itineraryId.toString(),
        amount: Number(e.amount) || 0,
        currencySymbol: e.currencySymbol,
        currencyCode: e.currencyCode,
      })),
    }));

    return this.serializeBigInt(result);
  }

  private serializeBigInt(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'bigint') return Number(obj);
    if (obj instanceof Date) return obj.toISOString();
    if (Array.isArray(obj)) return obj.map((item) => this.serializeBigInt(item));
    if (typeof obj === 'object') {
      const res: any = {};
      for (const key of Object.keys(obj)) {
        res[key] = this.serializeBigInt(obj[key]);
      }
      return res;
    }
    return obj;
  }

  async getItineraryDetail(id: string) {
    try {
      const itineraryId = BigInt(id);
      let itinerary: any = null;
      try {
        itinerary = await this.prisma.itinerary.findUnique({
          where: { id: itineraryId },
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                email: true,
                avatar: true,
              },
            },
            sections: {
              orderBy: { sortOrder: 'asc' },
            },
            savedPlaces: {
              include: {
                place: {
                  include: {
                    category: true,
                    photos: true,
                  },
                },
                expense: true,
              },
              orderBy: { sortOrder: 'asc' },
            },
            details: {
              include: {
                place: {
                  include: {
                    category: true,
                    photos: true,
                  },
                },
                expense: true,
              },
              orderBy: [{ day: 'asc' }, { sortOrder: 'asc' }],
            },
          },
        });
      } catch (err: any) {
        console.error('Error fetching core itinerary record:', err);
        throw err;
      }

      if (!itinerary) {
        throw new BadRequestException('Hành trình không tồn tại.');
      }

      // Query members safely
      let members: any[] = [];
      try {
        members = await this.prisma.itineraryMember.findMany({
          where: { itineraryId },
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                email: true,
                avatar: true,
              },
            },
          },
        });
      } catch (e) {
        members = [];
      }

      // Query expenses safely
      let expenses: any[] = [];
      try {
        expenses = await this.prisma.itineraryExpense.findMany({
          where: { itineraryId },
          include: {
            savedPlace: { include: { place: true } },
            detail: { include: { place: true } },
          },
          orderBy: { id: 'desc' },
        });
      } catch (e) {
        expenses = [];
      }

      // Query settlements safely
      let formattedSettlements: any[] = [];
      try {
        const expenseIds = (expenses || []).map((e) => e.id).filter(Boolean);
        const rawSettlements = await this.prisma.itinerarySettlement.findMany({
          where: {
            OR: [
              { itineraryId },
              ...(expenseIds.length > 0 ? [{ expenseId: { in: expenseIds } }] : []),
            ],
          },
          include: {
            expense: true,
          },
          orderBy: { id: 'desc' },
        });

        formattedSettlements = rawSettlements.map((item) => ({
          id: item.id.toString(),
          itineraryId: item.itineraryId.toString(),
          expenseId: item.expenseId ? item.expenseId.toString() : null,
          fromUserId: item.fromUserId ? item.fromUserId.toString() : null,
          fromName: item.fromName,
          toUserId: item.toUserId ? item.toUserId.toString() : null,
          toName: item.toName,
          amount: Number(item.amount) || 0,
          date: item.date ? (typeof item.date === 'string' ? item.date : (item.date as any)?.toISOString?.() || String(item.date)) : null,
          createdAt: item.createdAt ? (typeof item.createdAt === 'string' ? item.createdAt : (item.createdAt as any)?.toISOString?.() || String(item.createdAt)) : null,
          expense: item.expense
            ? {
                id: item.expense.id.toString(),
                title: item.expense.title,
                amount: Number(item.expense.amount) || 0,
                category: item.expense.category,
                payer: item.expense.payer,
                share: item.expense.share,
              }
            : null,
        }));
      } catch (e) {
        formattedSettlements = [];
      }

      const fullResult = {
        ...itinerary,
        members,
        expenses,
        settlements: formattedSettlements,
      };

      return this.serializeBigInt(fullResult);
    } catch (error: any) {
      console.error('Lỗi khi lấy thông tin chi tiết chuyến đi:', error);
      throw error;
    }
  }

  async updateItinerary(id: string, body: any) {
    const itineraryId = BigInt(id);
    const existing = await this.prisma.itinerary.findUnique({
      where: { id: itineraryId },
    });
    if (!existing) {
      throw new BadRequestException('Hành trình không tồn tại.');
    }

    const data: any = {};
    if (body.coverImage !== undefined) data.coverImage = body.coverImage;
    if (body.title !== undefined) data.title = body.title;
    if (body.destination !== undefined) data.destination = body.destination;
    if (body.budget !== undefined) data.budget = body.budget ? BigInt(body.budget) : null;
    if (body.days !== undefined) data.days = body.days ? BigInt(body.days) : null;

    return this.prisma.itinerary.update({
      where: { id: itineraryId },
      data,
    });
  }


  async publishGuideToBlog(id: string, body: any) {
    const itineraryId = BigInt(id);
    const itinerary = await this.prisma.itinerary.findUnique({
      where: { id: itineraryId },
      include: {
        savedPlaces: {
          include: { place: true },
        },
      },
    });

    if (!itinerary) {
      throw new BadRequestException('Hành trình/Hướng dẫn không tồn tại.');
    }

    const title = body?.title || itinerary.title;
    const description =
      body?.description ||
      `Hướng dẫn du lịch ${itinerary.destination} vô cùng chi tiết từ CloudMood.`;
    const coverImage =
      body?.coverImage || itinerary.coverImage || '/logo-xoanen-cloudmood.png';

    const post = await this.prisma.explorePost.create({
      data: {
        title,
        description,
        coverImage,
        postType: 'GUIDE',
        authorId: itinerary.userId,
        originalItineraryId: itinerary.id,
        destination: itinerary.destination,
        status: 'PUBLISHED',
      },
    });

    if (itinerary.savedPlaces && itinerary.savedPlaces.length > 0) {
      const itemsData = itinerary.savedPlaces.map((sp, idx) => ({
        postId: post.id,
        itemType: 'PLACE',
        sortOrder: idx + 1,
        content: sp.noteText || sp.place?.description || sp.place?.name || '',
        placeId: sp.placeId,
      }));

      await this.prisma.explorePostItem.createMany({
        data: itemsData,
      });
    }

    return post;
  }
  // 1b. Explore Posts / Blog Management
  async getExplorePosts() {
    return this.prisma.explorePost.findMany({
      orderBy: { id: 'desc' },
      include: {
        author: {
          select: {
            id: true,
            fullName: true,
            email: true,
            avatar: true,
          },
        },
        originalItinerary: {
          select: {
            id: true,
            title: true,
            isGuide: true,
          },
        },
        _count: {
          select: {
            items: true,
            likes: true,
          },
        },
        items: {
          include: {
            place: true,
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
  }

  async createExplorePost(data: any) {
    if (!data.title) {
      throw new BadRequestException('Tiêu đề bài viết không được để trống.');
    }

    const post = await this.prisma.explorePost.create({
      data: {
        title: data.title,
        description: data.description || '',
        coverImage: data.coverImage || null,
        postType: data.postType || 'BLOG',
        destination: data.destination || '',
        status: data.status || 'PUBLISHED',
        authorId: data.authorId ? BigInt(data.authorId) : null,
      },
    });

    if (Array.isArray(data.items) && data.items.length > 0) {
      const itemsData = data.items.map((item: any, index: number) => ({
        postId: post.id,
        itemType: item.itemType || 'TEXT',
        sortOrder: index + 1,
        content: item.content || '',
        placeId: item.placeId ? BigInt(item.placeId) : null,
      }));
      await this.prisma.explorePostItem.createMany({ data: itemsData });
    }

    return post;
  }

  async deleteExplorePost(id: string) {
    const postId = BigInt(id);
    const post = await this.prisma.explorePost.findUnique({
      where: { id: postId },
    });
    if (!post) {
      throw new BadRequestException('Bài viết không tồn tại.');
    }

    await this.prisma.explorePostItem.deleteMany({ where: { postId } });
    await this.prisma.explorePostLike.deleteMany({ where: { postId } });
    return this.prisma.explorePost.delete({ where: { id: postId } });
  }

  // 1c. Checklist Templates Management
  async getChecklistTemplates() {
    return this.prisma.checklistTemplateCategory.findMany({
      orderBy: { id: 'asc' },
      include: {
        items: {
          orderBy: { id: 'asc' },
        },
      },
    });
  }

  async createChecklistCategory(data: any) {
    if (!data.name) {
      throw new BadRequestException('Tên danh mục không được để trống.');
    }
    return this.prisma.checklistTemplateCategory.create({
      data: {
        name: data.name,
        tabType: data.tabType || 'GENERAL',
      },
    });
  }

  async updateChecklistCategory(id: string, data: any) {
    const catId = BigInt(id);
    return this.prisma.checklistTemplateCategory.update({
      where: { id: catId },
      data: {
        name: data.name,
        tabType: data.tabType,
      },
    });
  }

  async deleteChecklistCategory(id: string) {
    const catId = BigInt(id);
    await this.prisma.checklistTemplateItem.deleteMany({
      where: { categoryId: catId },
    });
    return this.prisma.checklistTemplateCategory.delete({
      where: { id: catId },
    });
  }

  async createChecklistItem(data: any) {
    if (!data.categoryId || !data.name) {
      throw new BadRequestException(
        'Tên vật dụng và danh mục không được để trống.',
      );
    }
    return this.prisma.checklistTemplateItem.create({
      data: {
        categoryId: BigInt(data.categoryId),
        name: data.name,
      },
    });
  }

  async deleteChecklistItem(id: string) {
    const itemId = BigInt(id);
    return this.prisma.checklistTemplateItem.delete({ where: { id: itemId } });
  }

  async deleteItinerary(id: string) {
    const itineraryId = BigInt(id);
    const itinerary = await this.prisma.itinerary.findUnique({
      where: { id: itineraryId },
    });

    if (!itinerary) {
      throw new BadRequestException('Hành trình không tồn tại.');
    }

    // Find all matching explore posts (by originalItineraryId OR matching title & authorId)
    const matchingPosts = await this.prisma.explorePost.findMany({
      where: {
        OR: [
          { originalItineraryId: itineraryId },
          {
            authorId: itinerary.userId,
            title: itinerary.title,
            destination: itinerary.destination,
          },
        ],
      },
      select: { id: true },
    });

    const postIds = matchingPosts.map((p) => p.id);

    if (postIds.length > 0) {
      await this.prisma.explorePostItem.deleteMany({
        where: { postId: { in: postIds } },
      });
      await this.prisma.explorePostLike.deleteMany({
        where: { postId: { in: postIds } },
      });
      await this.prisma.explorePost.deleteMany({
        where: { id: { in: postIds } },
      });
    }

    await this.prisma.itineraryDetail.deleteMany({ where: { itineraryId } });
    await this.prisma.itinerarySavedPlace.deleteMany({ where: { itineraryId } });
    await this.prisma.itinerarySection.deleteMany({ where: { itineraryId } });
    await this.prisma.itineraryMember.deleteMany({ where: { itineraryId } });
    await this.prisma.itineraryInvite.deleteMany({ where: { itineraryId } });
    await this.prisma.itineraryExpense.deleteMany({ where: { itineraryId } });

    await this.prisma.itinerary.delete({ where: { id: itineraryId } });
    return { success: true };
  }

  // 2. User Management
  async getUsers(search?: string, page: number = 1, limit: number = 15) {
    const skip = (page - 1) * limit;

    const where: any = {};
    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { id: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    // Format BigInt values to string or number, exclude passwords
    const formattedUsers = users.map((user) => {
      const { password, ...result } = user;
      return result;
    });

    return {
      users: formattedUsers,
      total,
      pages: Math.ceil(total / limit),
    };
  }

  async createUser(data: any) {
    if (!data.email || !data.password || !data.fullName) {
      throw new BadRequestException(
        'Vui lòng cung cấp đầy đủ thông tin: Email, Mật khẩu và Họ tên.',
      );
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      throw new ConflictException(
        'Email này đã được sử dụng bởi một tài khoản khác.',
      );
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    const user = await this.prisma.user.create({
      data: {
        fullName: data.fullName,
        email: data.email,
        password: hashedPassword,
        avatar: data.avatar || '/default-avatar.svg',
        role: data.role === true,
        createdAt: new Date(),
      },
    });

    const { password, ...result } = user;
    return result;
  }

  async toggleBlockUser(id: string, isBlocked: boolean) {
    const userId = BigInt(id);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new BadRequestException('Người dùng không tồn tại.');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { isBlocked },
    });

    const { password, ...result } = updatedUser;
    return result;
  }

  // 3. Category Management
  async getCategories() {
    return this.prisma.category.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async createCategory(data: any) {
    if (!data.name) {
      throw new BadRequestException('Tên danh mục không được để trống.');
    }

    return this.prisma.category.create({
      data: {
        name: data.name,
        iconCode: data.iconCode ? Number(data.iconCode) : null,
      },
    });
  }

  async updateCategory(id: string, data: any) {
    const categoryId = BigInt(id);
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
    });
    if (!category) {
      throw new BadRequestException('Danh mục không tồn tại.');
    }

    return this.prisma.category.update({
      where: { id: categoryId },
      data: {
        name: data.name,
        iconCode: data.iconCode !== undefined ? Number(data.iconCode) : null,
      },
    });
  }

  async deleteCategory(id: string) {
    const categoryId = BigInt(id);
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
    });
    if (!category) {
      throw new BadRequestException('Danh mục không tồn tại.');
    }

    // Check if any places are linked to this category
    const placesCount = await this.prisma.place.count({
      where: { categoryId },
    });

    if (placesCount > 0) {
      throw new BadRequestException(
        `Không thể xóa danh mục này vì đang có ${placesCount} địa điểm thuộc danh mục này.`,
      );
    }

    return this.prisma.category.delete({
      where: { id: categoryId },
    });
  }

  // 4. Places & Photos Management
  async getPlaces(
    search?: string,
    categoryId?: string,
    page: number = 1,
    limit: number = 15,
    isApproved?: string,
  ) {
    const skip = (page - 1) * limit;

    const where: any = {};
    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }
    if (categoryId) {
      where.categoryId = BigInt(categoryId);
    }
    if (isApproved === 'true') {
      where.isApproved = true;
    } else if (isApproved === 'false') {
      where.isApproved = false;
    }

    const [places, total] = await Promise.all([
      this.prisma.place.findMany({
        where,
        orderBy: { id: 'desc' },
        skip,
        take: limit,
        include: {
          category: true,
          _count: {
            select: { reviews: true },
          },
        },
      }),
      this.prisma.place.count({ where }),
    ]);

    return {
      places,
      total,
      pages: Math.ceil(total / limit),
    };
  }

  async getPlaceDetails(id: string) {
    const placeId = BigInt(id);
    const place = await this.prisma.place.findUnique({
      where: { id: placeId },
      include: {
        category: true,
        photos: { orderBy: { id: 'desc' } },
        reviews: { orderBy: { id: 'desc' } },
      },
    });

    if (!place) {
      throw new BadRequestException('Địa điểm không tồn tại.');
    }

    return place;
  }

  async createPlace(data: any) {
    if (!data.name || !data.categoryId) {
      throw new BadRequestException(
        'Tên địa điểm và Danh mục không được để trống.',
      );
    }

    return this.prisma.place.create({
      data: {
        name: data.name,
        description: data.description || '',
        latitude: parseFloat(data.latitude) || 0,
        longitude: parseFloat(data.longitude) || 0,
        address: data.address || '',
        price: data.price || 'Miễn phí',
        categoryId: BigInt(data.categoryId),
        image: data.image || '',
        rating: data.rating !== undefined ? parseFloat(data.rating) : null,
        userRatingCount:
          data.userRatingCount !== undefined
            ? parseInt(data.userRatingCount)
            : null,
        phone: data.phone || null,
        website: data.website || null,
        priceLevel: data.priceLevel || null,
        tripadvisorUrl: data.tripadvisorUrl || null,
        openingHours: data.openingHours || {},
        subCategories: data.subCategories || [],
        externalId: data.externalId || null,
      },
    });
  }

  async updatePlace(id: string, data: any) {
    const placeId = BigInt(id);
    const place = await this.prisma.place.findUnique({
      where: { id: placeId },
    });
    if (!place) {
      throw new BadRequestException('Địa điểm không tồn tại.');
    }

    let image = data.image !== undefined ? data.image : place.image;
    if (typeof image === 'string' && image.startsWith('data:image/')) {
      try {
        const matches = image.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
          const base64Data = matches[2];
          const fileName = `thumb-${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`;

          const webPublicUploads = path.join(process.cwd(), '../cloudmood_web/public/uploads/places');
          if (!fs.existsSync(webPublicUploads)) {
            fs.mkdirSync(webPublicUploads, { recursive: true });
          }

          const filePath = path.join(webPublicUploads, fileName);
          fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));

          image = `/uploads/places/${fileName}`;
        }
      } catch (err) {
        console.error('Failed to save thumbnail image to file system:', err);
      }
    }

    return this.prisma.place.update({
      where: { id: placeId },
      data: {
        name: data.name,
        description:
          data.description !== undefined ? data.description : place.description,
        latitude:
          data.latitude !== undefined
            ? parseFloat(data.latitude)
            : place.latitude,
        longitude:
          data.longitude !== undefined
            ? parseFloat(data.longitude)
            : place.longitude,
        address: data.address !== undefined ? data.address : place.address,
        price: data.price !== undefined ? data.price : place.price,
        categoryId:
          data.categoryId !== undefined
            ? BigInt(data.categoryId)
            : place.categoryId,
        image,
        rating:
          data.rating !== undefined
            ? data.rating !== null
              ? parseFloat(data.rating)
              : null
            : place.rating,
        userRatingCount:
          data.userRatingCount !== undefined
            ? data.userRatingCount !== null
              ? parseInt(data.userRatingCount)
              : null
            : place.userRatingCount,
        phone: data.phone !== undefined ? data.phone : place.phone,
        website: data.website !== undefined ? data.website : place.website,
        priceLevel:
          data.priceLevel !== undefined ? data.priceLevel : place.priceLevel,
        tripadvisorUrl:
          data.tripadvisorUrl !== undefined
            ? data.tripadvisorUrl
            : place.tripadvisorUrl,
        openingHours:
          data.openingHours !== undefined
            ? data.openingHours
            : (place.openingHours ?? {}),
        subCategories:
          data.subCategories !== undefined
            ? data.subCategories
            : (place.subCategories ?? []),
        externalId:
          data.externalId !== undefined ? data.externalId : place.externalId,
        isApproved:
          data.isApproved !== undefined
            ? data.isApproved === true || data.isApproved === 'true'
            : place.isApproved,
        lastSyncedAt: new Date(),
      },
    });
  }

  async deletePlace(id: string) {
    const placeId = BigInt(id);
    const place = await this.prisma.place.findUnique({
      where: { id: placeId },
    });
    if (!place) {
      throw new BadRequestException('Địa điểm không tồn tại.');
    }

    // Delete related entities to satisfy foreign key constraints
    await this.prisma.placePhoto.deleteMany({ where: { placeId } });
    await this.prisma.review.deleteMany({ where: { placeId } });
    await this.prisma.itinerarySavedPlace.deleteMany({ where: { placeId } });
    await this.prisma.itineraryDetail.deleteMany({ where: { placeId } });

    return this.prisma.place.delete({
      where: { id: placeId },
    });
  }

  // 5. Photos Management (Automatic File Saver for Base64)
  async addPlacePhoto(placeId: string, data: any) {
    if (!data.urlOriginal) {
      throw new BadRequestException('Đường dẫn ảnh gốc không được để trống.');
    }

    let urlOriginal = data.urlOriginal;
    let urlThumbnail = data.urlThumbnail || null;

    // Handle Base64 Upload
    if (typeof urlOriginal === 'string' && urlOriginal.startsWith('data:image/')) {
      try {
        const matches = urlOriginal.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
          const base64Data = matches[2];
          const fileName = `photo-${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`;

          const webPublicUploads = path.join(process.cwd(), '../cloudmood_web/public/uploads/photos');
          if (!fs.existsSync(webPublicUploads)) {
            fs.mkdirSync(webPublicUploads, { recursive: true });
          }

          const filePath = path.join(webPublicUploads, fileName);
          fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));

          urlOriginal = `/uploads/photos/${fileName}`;
          urlThumbnail = null;
        }
      } catch (err) {
        console.error('Failed to save base64 photo to file system:', err);
      }
    }

    const created = await this.prisma.placePhoto.create({
      data: {
        placeId: BigInt(placeId),
        urlOriginal,
        urlThumbnail,
        caption: data.caption || null,
        source: data.source || 'LOCAL',
      },
    });

    return this.serializeBigInt(created);
  }

  async deletePlacePhoto(photoId: string) {
    const id = BigInt(photoId);
    const photo = await this.prisma.placePhoto.findUnique({ where: { id } });
    if (!photo) {
      throw new BadRequestException('Ảnh không tồn tại.');
    }

    const deleted = await this.prisma.placePhoto.delete({ where: { id } });
    return this.serializeBigInt(deleted);
  }

  async addPlaceReview(placeId: string, data: any) {
    const created = await this.prisma.review.create({
      data: {
        placeId: BigInt(placeId),
        rating: parseFloat(data.rating),
        comment: data.comment,
        authorName: data.authorName,
        authorAvatar: data.authorAvatar || '/default-avatar.svg',
        authorLocation: data.authorLocation || null,
        publishedDate: data.publishedDate
          ? new Date(data.publishedDate)
          : new Date(),
        source: 'LOCAL',
      },
    });

    return this.serializeBigInt(created);
  }

  // 6. Bulk Import
  async importPlaces(places: any[]) {
    if (!Array.isArray(places) || places.length === 0) {
      throw new BadRequestException('Danh sách địa điểm không hợp lệ.');
    }

    const createdPlaces: any[] = [];
    for (const item of places) {
      if (!item.name || !item.categoryId) continue;

      const placeData = {
        name: item.name,
        description: item.description || '',
        latitude: parseFloat(item.latitude) || 0,
        longitude: parseFloat(item.longitude) || 0,
        address: item.address || '',
        price: item.price || 'Miễn phí',
        categoryId: BigInt(item.categoryId),
        image: item.image || '',
        rating: item.rating !== undefined ? parseFloat(item.rating) : null,
        userRatingCount:
          item.userRatingCount !== undefined
            ? parseInt(item.userRatingCount)
            : null,
        phone: item.phone || null,
        website: item.website || null,
        priceLevel: item.priceLevel || null,
        tripadvisorUrl: item.tripadvisorUrl || null,
        openingHours: item.openingHours || {},
        subCategories: item.subCategories || [],
        externalId: item.externalId || null,
      };

      try {
        const place = await this.prisma.place.upsert({
          where: { externalId: item.externalId || 'NON-EXISTENT-ID' },
          update: placeData,
          create: placeData,
        });
        createdPlaces.push(place);
      } catch (err) {
        console.error(`Failed to import place ${item.name}:`, err.message);
      }
    }

    return {
      success: true,
      importedCount: createdPlaces.length,
    };
  }

  // 7. Weather Cache Management
  async getWeatherCache() {
    return this.prisma.weatherCache.findMany({
      orderBy: { cityName: 'asc' },
    });
  }

  async deleteWeatherCache(id: string) {
    const cacheId = BigInt(id);
    const cache = await this.prisma.weatherCache.findUnique({
      where: { id: cacheId },
    });
    if (!cache) {
      throw new BadRequestException('Thành phố giám sát không tồn tại.');
    }

    return this.prisma.weatherCache.delete({ where: { id: cacheId } });
  }

  async clearAllWeatherCache() {
    return this.prisma.weatherCache.deleteMany({});
  }
}
