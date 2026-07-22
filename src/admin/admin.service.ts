import {
  Injectable,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  // 1. Dashboard & Statistics
  async getDashboardStats() {
    const [userCount, placeCount, itineraryCount, reviewCount, categoryCount] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.place.count(),
        this.prisma.itinerary.count(),
        this.prisma.review.count(),
        this.prisma.category.count(),
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
      },
      recentReviews,
    };
  }

  async getItineraries(limit: number = 10000) {
    return this.prisma.itinerary.findMany({
      orderBy: { id: 'desc' },
      take: limit,
    });
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
        avatar: data.avatar || '/default-avatar.jpg',
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
        image: data.image !== undefined ? data.image : place.image,
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

  // 5. Photos Management
  async addPlacePhoto(placeId: string, data: any) {
    if (!data.urlOriginal) {
      throw new BadRequestException('Đường dẫn ảnh gốc không được để trống.');
    }

    return this.prisma.placePhoto.create({
      data: {
        placeId: BigInt(placeId),
        urlOriginal: data.urlOriginal,
        urlThumbnail: data.urlThumbnail || null,
        caption: data.caption || null,
        source: data.source || 'LOCAL',
      },
    });
  }

  async deletePlacePhoto(photoId: string) {
    const id = BigInt(photoId);
    const photo = await this.prisma.placePhoto.findUnique({ where: { id } });
    if (!photo) {
      throw new BadRequestException('Ảnh không tồn tại.');
    }

    return this.prisma.placePhoto.delete({ where: { id } });
  }

  async addPlaceReview(placeId: string, data: any) {
    return this.prisma.review.create({
      data: {
        placeId: BigInt(placeId),
        rating: parseFloat(data.rating),
        comment: data.comment,
        authorName: data.authorName,
        authorAvatar: data.authorAvatar || '/default-avatar.jpg',
        authorLocation: data.authorLocation || null,
        publishedDate: data.publishedDate
          ? new Date(data.publishedDate)
          : new Date(),
        source: 'LOCAL',
      },
    });
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
