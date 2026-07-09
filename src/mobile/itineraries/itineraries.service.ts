import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';

@Injectable()
export class ItinerariesService {
  constructor(private prisma: PrismaService) {}

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
    return this.prisma.itinerary.findUnique({
      where: { id: BigInt(id) },
      include: {
        sections: true,
        details: { include: { place: { include: { category: true } } } },
        savedPlaces: { include: { place: { include: { category: true } } } },
      },
    });
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
        arrivalTime: new Date(`1970-01-01T${data.arrivalTime.split('+')[0]}Z`), // simplified time parse
        leaveTime: new Date(`1970-01-01T${data.leaveTime.split('+')[0]}Z`),
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
}
