import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { WeatherService } from '../../shared/weather/weather.service';

@Injectable()
export class ItinerariesService {
  constructor(
    private prisma: PrismaService,
    private weatherService: WeatherService,
  ) {}

  async fixDb() {
    try {
      await this.prisma.$executeRawUnsafe(`ALTER TABLE "ItinerarySavedPlace" ADD COLUMN IF NOT EXISTS "startTime" text`);
      await this.prisma.$executeRawUnsafe(`ALTER TABLE "ItinerarySavedPlace" ADD COLUMN IF NOT EXISTS "endTime" text`);
      await this.prisma.$executeRawUnsafe(`ALTER TABLE "ItineraryDetail" ADD COLUMN IF NOT EXISTS "startTime" text`);
      await this.prisma.$executeRawUnsafe(`ALTER TABLE "ItineraryDetail" ADD COLUMN IF NOT EXISTS "endTime" text`);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async findAllByUser(userId: string) {
    return this.prisma.itinerary.findMany({
      where: { userId: BigInt(userId) },
      include: {
        sections: true,
        details: { include: { place: { include: { category: true } } } },
        savedPlaces: { include: { place: { include: { category: true } } } },
      },
      orderBy: { id: 'desc' },
    });
  }

  async findOne(id: number) {
    const itinerary = await this.prisma.itinerary.findUnique({
      where: { id: BigInt(id) },
      include: {
        sections: true,
        details: { include: { place: { include: { category: true } } } },
        savedPlaces: { include: { place: { include: { category: true } } } },
      },
    });

    if (!itinerary) return null;

    let weather: any = null;
    try {
      if (itinerary.destination) {
        weather = await this.weatherService.getWeatherForCity(itinerary.destination);
      }
    } catch (e) {
      // Ignored: do not crash itinerary fetch if weather API is unreachable
    }

    return {
      ...itinerary,
      weather,
    };
  }


  async create(userId: string, data: any) {
    const itinerary = await this.prisma.itinerary.create({
      data: {
        title: data.title,
        destination: data.destination,
        startDate: new Date(data.startDate),
        days: BigInt(data.days),
        budget: BigInt(data.budget),
        companion: data.companion,
        pace: data.pace,
        categories: data.categories,
        amenities: data.amenities,
        userId: BigInt(userId),
      },
    });

    await this.prisma.itinerarySection.create({
      data: {
        itineraryId: itinerary.id,
        name: 'Địa điểm tham quan',
        colorCode: '4282057462',
        iconCode: 983363, // corresponds to Icons.looks_one_rounded.codePoint
        sortOrder: 0,
      },
    });

    return itinerary;
  }

  async update(id: number, data: any) {
    return this.prisma.itinerary.update({
      where: { id: BigInt(id) },
      data,
    });
  }

  async updateDayConfigs(id: number, dayConfigs: any) {
    return this.prisma.itinerary.update({
      where: { id: BigInt(id) },
      data: { dayConfigs },
    });
  }

  async shiftDetailsDays(itineraryId: number, targetDay: number, offset: number) {
    const details = await this.prisma.itineraryDetail.findMany({
      where: { itineraryId: BigInt(itineraryId), day: { gt: targetDay } },
    });
    for (const d of details) {
      await this.prisma.itineraryDetail.update({
        where: { id: d.id },
        data: { day: d.day + offset },
      });
    }
    return true;
  }

  async deleteDetailsForDay(itineraryId: number, day: number) {
    return this.prisma.itineraryDetail.deleteMany({
      where: { itineraryId: BigInt(itineraryId), day },
    });
  }

  async addDetail(data: any) {
    return this.prisma.itineraryDetail.create({
      data: {
        itineraryId: BigInt(data.itineraryId),
        placeId: data.placeId ? BigInt(data.placeId) : null,
        day: data.day,
        sortOrder: data.sortOrder,
        noteText: data.noteText,
      },
      include: { place: { include: { category: true } } },
    });
  }

  async deleteDetail(id: number) {
    return this.prisma.itineraryDetail.delete({ where: { id: BigInt(id) } });
  }

  async updateDetail(id: number, data: any) {
    return this.prisma.itineraryDetail.update({
      where: { id: BigInt(id) },
      data,
    });
  }

  async addSavedPlace(data: any) {
    let sortOrder = data.sortOrder;
    if (sortOrder === undefined || sortOrder === null) {
      const last = await this.prisma.itinerarySavedPlace.findFirst({
        where: { itineraryId: BigInt(data.itineraryId), section: data.section },
        orderBy: { sortOrder: 'desc' },
      });
      sortOrder = last ? last.sortOrder + 1 : 0;
    }

    return this.prisma.itinerarySavedPlace.create({
      data: {
        itineraryId: BigInt(data.itineraryId),
        placeId: data.placeId ? BigInt(data.placeId) : null,
        section: data.section,
        noteText: data.noteText,
        sortOrder,
      },
      include: { place: { include: { category: true } } },
    });
  }

  async updateSavedPlace(id: number, data: any) {
    return this.prisma.itinerarySavedPlace.update({
      where: { id: BigInt(id) },
      data,
    });
  }

  async deleteSavedPlace(id: number) {
    return this.prisma.itinerarySavedPlace.delete({ where: { id: BigInt(id) } });
  }

  async deleteSavedPlacesBySection(itineraryId: number, section: string) {
    return this.prisma.itinerarySavedPlace.deleteMany({
      where: { itineraryId: BigInt(itineraryId), section },
    });
  }

  async deleteMultipleSavedPlaces(ids: number[]) {
    return this.prisma.itinerarySavedPlace.deleteMany({
      where: { id: { in: ids.map(id => BigInt(id)) } },
    });
  }

  async upsertSection(data: any) {
    const existing = await this.prisma.itinerarySection.findFirst({
      where: { itineraryId: BigInt(data.itineraryId), name: data.name },
    });
    if (existing) {
      return this.prisma.itinerarySection.update({
        where: { id: existing.id },
        data: {
          colorCode: data.colorCode,
          iconCode: data.iconCode,
          sortOrder: data.sortOrder,
        },
      });
    }
    return this.prisma.itinerarySection.create({
      data: {
        itineraryId: BigInt(data.itineraryId),
        name: data.name,
        colorCode: data.colorCode,
        iconCode: data.iconCode,
        sortOrder: data.sortOrder || 0,
      },
    });
  }

  async deleteSection(itineraryId: number, name: string) {
    return this.prisma.itinerarySection.deleteMany({
      where: { itineraryId: BigInt(itineraryId), name },
    });
  }

  async getChecklistTemplates() {
    let categories = await this.prisma.checklistTemplateCategory.findMany({
      include: {
        items: true,
      },
    });

    if (categories.length === 0) {
      // Seed some default templates if empty
      const packingCat = await this.prisma.checklistTemplateCategory.create({
        data: { name: 'Đồ dùng cá nhân', tabType: 'PACKING' }
      });
      await this.prisma.checklistTemplateItem.createMany({
        data: [
          { categoryId: packingCat.id, name: 'Bàn chải & Kem đánh răng' },
          { categoryId: packingCat.id, name: 'Quần áo dự phòng' },
          { categoryId: packingCat.id, name: 'Sạc điện thoại / Sạc dự phòng' },
          { categoryId: packingCat.id, name: 'Đồ lót' },
          { categoryId: packingCat.id, name: 'Khăn tắm' },
        ]
      });

      const prepCat = await this.prisma.checklistTemplateCategory.create({
        data: { name: 'Giấy tờ & Thủ tục', tabType: 'PRE_TRIP' }
      });
      await this.prisma.checklistTemplateItem.createMany({
        data: [
          { categoryId: prepCat.id, name: 'Hộ chiếu / CCCD' },
          { categoryId: prepCat.id, name: 'Vé máy bay / Xe' },
          { categoryId: prepCat.id, name: 'Tiền mặt & Thẻ tín dụng' },
          { categoryId: prepCat.id, name: 'Xác nhận đặt phòng khách sạn' },
        ]
      });

      categories = await this.prisma.checklistTemplateCategory.findMany({
        include: {
          items: true,
        },
      });
    }

    return categories.map((cat: any) => ({
      ...cat,
      id: Number(cat.id),
      items: cat.items.map((item: any) => ({
        ...item,
        id: Number(item.id),
        categoryId: Number(item.categoryId),
      })),
    }));
  }
}
