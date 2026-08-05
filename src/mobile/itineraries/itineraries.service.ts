import { Injectable, OnModuleInit, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { WeatherService } from '../../shared/weather/weather.service';
import { MailService } from '../../shared/mail/mail.service';
import * as crypto from 'crypto';

import { ItinerariesGateway } from './itineraries.gateway';

@Injectable()
export class ItinerariesService implements OnModuleInit {
  constructor(
    private prisma: PrismaService,
    private weatherService: WeatherService,
    private mailService: MailService,
    private itinerariesGateway: ItinerariesGateway,
  ) { }

  async onModuleInit() {
    await this.fixDb();
  }

  async fixDb() {
    try {
      await this.prisma.$executeRawUnsafe(
        `ALTER TABLE "ItinerarySavedPlace" ADD COLUMN IF NOT EXISTS "startTime" text`,
      );
      await this.prisma.$executeRawUnsafe(
        `ALTER TABLE "ItinerarySavedPlace" ADD COLUMN IF NOT EXISTS "endTime" text`,
      );
      await this.prisma.$executeRawUnsafe(
        `ALTER TABLE "ItineraryDetail" ADD COLUMN IF NOT EXISTS "startTime" text`,
      );
      await this.prisma.$executeRawUnsafe(
        `ALTER TABLE "ItineraryDetail" ADD COLUMN IF NOT EXISTS "endTime" text`,
      );
      await this.prisma.$executeRawUnsafe(
        `ALTER TABLE "Itinerary" ADD COLUMN IF NOT EXISTS "isGuide" boolean DEFAULT false`,
      );
      await this.prisma.$executeRawUnsafe(
        `ALTER TABLE "Itinerary" ADD COLUMN IF NOT EXISTS "isAi" boolean DEFAULT false`,
      );
      await this.prisma.$executeRawUnsafe(
        `ALTER TABLE "Itinerary" ADD COLUMN IF NOT EXISTS "coverImage" text`,
      );
      await this.prisma.$executeRawUnsafe(
        `ALTER TABLE "Itinerary" ADD COLUMN IF NOT EXISTS "currencyCode" varchar DEFAULT 'VND'`,
      );
      await this.prisma.$executeRawUnsafe(
        `ALTER TABLE "Itinerary" ADD COLUMN IF NOT EXISTS "currencySymbol" varchar DEFAULT 'đ'`,
      );
      // Link ItineraryExpense to places (1-1 FK)
      await this.prisma.$executeRawUnsafe(
        `ALTER TABLE "ItineraryExpense" ADD COLUMN IF NOT EXISTS "savedPlaceId" bigint`,
      );
      await this.prisma.$executeRawUnsafe(
        `ALTER TABLE "ItineraryExpense" ADD COLUMN IF NOT EXISTS "detailId" bigint`,
      );
      // Add unique constraints if not exists
      await this.prisma.$executeRawUnsafe(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ItineraryExpense_savedPlaceId_key') THEN
            ALTER TABLE "ItineraryExpense" ADD CONSTRAINT "ItineraryExpense_savedPlaceId_key" UNIQUE ("savedPlaceId");
          END IF;
        END $$;
      `);
      await this.prisma.$executeRawUnsafe(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ItineraryExpense_detailId_key') THEN
            ALTER TABLE "ItineraryExpense" ADD CONSTRAINT "ItineraryExpense_detailId_key" UNIQUE ("detailId");
          END IF;
        END $$;
      `);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async findAllByUser(userId: string, isGuide: boolean = false) {
    try {
      await this.prisma.$executeRawUnsafe(
        `UPDATE "Itinerary" SET "isGuide" = false WHERE "isGuide" IS NULL`,
      );
    } catch (_) {}

    const userBigInt = BigInt(userId);
    const itineraries = await this.prisma.itinerary.findMany({
      where: {
        AND: [
          isGuide
            ? { isGuide: true }
            : { OR: [{ isGuide: false }, { isGuide: null }] },
          {
            OR: [
              { userId: userBigInt },
              { members: { some: { userId: userBigInt } } },
            ],
          },
        ],
      },
      include: {
        sections: true,
        details: {
          include: { place: { include: { category: true, photos: true } } },
        },
        savedPlaces: {
          include: { place: { include: { category: true, photos: true } } },
        },
        members: {
          include: {
            user: { select: { id: true, fullName: true, avatar: true, email: true } },
          },
        },
        explorePosts: {
          where: { status: 'PUBLISHED' },
          select: { id: true, coverImage: true },
        },
      },
      orderBy: { id: 'desc' },
    });

    return itineraries.map((item) => {
      const dc = (item.dayConfigs as any) || {};
      const explorePostCover = item.explorePosts?.[0]?.coverImage || null;
      const directCover = item.coverImage || null;
      const dayConfigCover = dc.coverImage || null;

      // Lọc bỏ các detail/savedPlace mà place bị xóa khỏi CSDL
      const validDetails = (item.details || []).filter((d) => d.place !== null);
      const validSavedPlaces = (item.savedPlaces || []).filter((sp) => sp.place !== null);

      let placePhotoCover: string | null = null;
      if (!directCover && !dayConfigCover && !explorePostCover) {
        for (const detail of validDetails) {
          const photo =
            detail.place?.photos?.[0]?.urlOriginal ||
            detail.place?.photos?.[0]?.urlThumbnail;
          if (photo) {
            placePhotoCover = photo;
            break;
          }
        }
        if (!placePhotoCover) {
          for (const sp of validSavedPlaces) {
            const photo =
              sp.place?.photos?.[0]?.urlOriginal ||
              sp.place?.photos?.[0]?.urlThumbnail;
            if (photo) {
              placePhotoCover = photo;
              break;
            }
          }
        }
      }

      const resolvedCover = isGuide
        ? explorePostCover || directCover || dayConfigCover || placePhotoCover
        : directCover || dayConfigCover || explorePostCover || placePhotoCover;

      return {
        ...item,
        details: validDetails,
        savedPlaces: validSavedPlaces,
        coverImage: resolvedCover,
        cover_image: resolvedCover,
        image_url: resolvedCover,
      };
    });
  }

  async findOne(id: number) {
    const itinerary = await this.prisma.itinerary.findUnique({
      where: { id: BigInt(id) },
      include: {
        sections: true,
        details: {
          include: {
            place: { include: { category: true, photos: true } },
            expense: true,
          },
        },
        savedPlaces: {
          include: {
            place: { include: { category: true, photos: true } },
            expense: true,
          },
        },
        explorePosts: {
          where: { status: 'PUBLISHED' },
          select: { id: true, coverImage: true },
        },
      },
    });

    if (!itinerary) return null;

    // Lọc bỏ các ItineraryDetail có place bị xóa khỏi CSDL (place === null)
    const validDetails = (itinerary.details || []).filter((d) => d.place !== null);
    const validSavedPlaces = (itinerary.savedPlaces || []).filter((sp) => sp.place !== null);

    // Xóa các ItineraryDetail mồ côi ra khỏi DB trong background
    const orphanDetailIds = (itinerary.details || [])
      .filter((d) => d.place === null && d.placeId !== null)
      .map((d) => d.id);
    if (orphanDetailIds.length > 0) {
      this.prisma.itineraryDetail
        .deleteMany({ where: { id: { in: orphanDetailIds } } })
        .catch(() => { }); // fire-and-forget, do not block response
    }

    let weather: any = null;
    try {
      if (itinerary.destination) {
        weather = await this.weatherService.getWeatherForCity(
          itinerary.destination,
        );
      }
    } catch (e) {
      // Ignored: do not crash itinerary fetch if weather API is unreachable
    }

    const dayConfigsObj = (itinerary.dayConfigs as any) || {};
    const isGuide = itinerary.isGuide === true;
    const explorePostCover = itinerary.explorePosts?.[0]?.coverImage || null;
    const directCover = itinerary.coverImage || null;
    const dayConfigCover = dayConfigsObj.coverImage || null;

    let placePhotoCover: string | null = null;
    if (!directCover && !dayConfigCover && !explorePostCover) {
      for (const detail of validDetails) {
        const photo =
          detail.place?.photos?.[0]?.urlOriginal ||
          detail.place?.photos?.[0]?.urlThumbnail;
        if (photo) {
          placePhotoCover = photo;
          break;
        }
      }
      if (!placePhotoCover) {
        for (const sp of validSavedPlaces) {
          const photo =
            sp.place?.photos?.[0]?.urlOriginal ||
            sp.place?.photos?.[0]?.urlThumbnail;
          if (photo) {
            placePhotoCover = photo;
            break;
          }
        }
      }
    }

    const resolvedCover = isGuide
      ? explorePostCover || directCover || dayConfigCover || placePhotoCover
      : directCover || dayConfigCover || explorePostCover || placePhotoCover;

    return {
      ...itinerary,
      details: validDetails,
      savedPlaces: validSavedPlaces,
      coverImage: resolvedCover,
      cover_image: resolvedCover,
      image_url: resolvedCover,
      weather,
    };
  }

  async create(userId: string, data: any) {
    let coverImage = data.coverImage || null;

    if (!coverImage && data.destination) {
      try {
        const dest = data.destination.toString();
        const places = await this.prisma.place.findMany({
          where: {
            OR: [
              { address: { contains: dest, mode: 'insensitive' } },
              { name: { contains: dest, mode: 'insensitive' } },
            ],
            photos: { some: {} },
          },
          include: { photos: true },
          take: 30,
        });

        const photos: string[] = [];
        for (const p of places) {
          for (const ph of p.photos) {
            const url = ph.urlOriginal || ph.urlThumbnail;
            if (url && !url.includes('via.placeholder.com')) {
              photos.push(url);
            }
          }
        }

        if (photos.length === 0) {
          const anyPlaces = await this.prisma.place.findMany({
            where: { photos: { some: {} } },
            include: { photos: true },
            take: 30,
          });
          for (const p of anyPlaces) {
            for (const ph of p.photos) {
              const url = ph.urlOriginal || ph.urlThumbnail;
              if (url && !url.includes('via.placeholder.com')) {
                photos.push(url);
              }
            }
          }
        }

        if (photos.length > 0) {
          coverImage = photos[Math.floor(Math.random() * photos.length)];
        }
      } catch (e) {
        // Ignored
      }
    }

    const itinerary = await this.prisma.itinerary.create({
      data: {
        title: data.title,
        destination: data.destination,
        startDate: new Date(data.startDate ?? new Date()),
        days: data.days != null && data.days !== 0 ? BigInt(data.days) : null,
        budget:
          data.budget != null && data.budget !== 0 ? BigInt(data.budget) : null,
        companion: data.companion || null,
        pace: data.pace || null,
        categories: data.categories ?? [],
        amenities: data.amenities ?? [],
        userId: BigInt(userId),
        isGuide: data.isGuide === true,
        isAi: data.isAi === true,
        coverImage: coverImage,
      },
    });

    // Tự động thêm người tạo chuyến đi làm OWNER trong ItineraryMember
    try {
      await this.prisma.itineraryMember.create({
        data: {
          itineraryId: itinerary.id,
          userId: BigInt(userId),
          role: 'OWNER',
        },
      });
    } catch (e) {
      // Bỏ qua nếu trùng lập
    }

    if (data.isGuide === true) {
      await this.prisma.itinerarySection.createMany({
        data: [
          {
            itineraryId: itinerary.id,
            name: 'Mẹo chung',
            colorCode: '4282057462',
            iconCode: 983363,
            sortOrder: 0,
            sectionType: 'LIST',
          },
          {
            itineraryId: itinerary.id,
            name: 'Ngày 1',
            colorCode: '4282057462',
            iconCode: 983363,
            sortOrder: 1,
            sectionType: 'ITINERARY',
          },
          {
            itineraryId: itinerary.id,
            name: 'Điểm tham quan',
            colorCode: '4282057462',
            iconCode: 983363,
            sortOrder: 2,
            sectionType: 'LIST',
          },
        ],
      });
    } else {
      await this.prisma.itinerarySection.create({
        data: {
          itineraryId: itinerary.id,
          name: 'Điểm tham quan',
          colorCode: '4282057462',
          iconCode: 983363, // corresponds to Icons.looks_one_rounded.codePoint
          sortOrder: 0,
          sectionType: 'LIST',
        },
      });
    }

    // We do not auto-save places to ItinerarySavedPlace.
    // The mobile app dynamically loads suggestions based on the destination.

    return itinerary;
  }

  async update(id: number, data: any) {
    const updateData = { ...data };
    const currencySymbol = updateData.currencySymbol;
    const currencyCode = updateData.currencyCode;
    delete updateData.currencySymbol;
    delete updateData.currencyCode;

    if (updateData.days !== undefined) {
      updateData.days = BigInt(updateData.days);
    }
    if (updateData.budget !== undefined) {
      updateData.budget = BigInt(updateData.budget);
    }

    const updated = await this.prisma.itinerary.update({
      where: { id: BigInt(id) },
      data: updateData,
    });

    if (currencySymbol !== undefined || currencyCode !== undefined) {
      if (currencySymbol !== undefined) {
        await this.prisma.$executeRawUnsafe(
          `UPDATE "Itinerary" SET "currencySymbol" = $1 WHERE id = $2`,
          currencySymbol,
          BigInt(id),
        );
      }
      if (currencyCode !== undefined) {
        await this.prisma.$executeRawUnsafe(
          `UPDATE "Itinerary" SET "currencyCode" = $1 WHERE id = $2`,
          currencyCode,
          BigInt(id),
        );
      }
    }

    if (data.coverImage !== undefined) {
      await this.prisma.explorePost.updateMany({
        where: { originalItineraryId: BigInt(id) },
        data: { coverImage: data.coverImage },
      });
    }

    this.itinerariesGateway.broadcastItineraryUpdate(id, undefined, 'UPDATE');
    return updated;
  }

  async updateDayConfigs(id: number, dayConfigs: any) {
    return this.prisma.itinerary.update({
      where: { id: BigInt(id) },
      data: { dayConfigs },
    });
  }

  async remove(id: number) {
    const itineraryId = BigInt(id);
    const itinerary = await this.prisma.itinerary.findUnique({
      where: { id: itineraryId },
    });

    if (itinerary) {
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
        await Promise.all([
          this.prisma.explorePostItem.deleteMany({ where: { postId: { in: postIds } } }),
          this.prisma.explorePostLike.deleteMany({ where: { postId: { in: postIds } } }),
        ]);
        await this.prisma.explorePost.deleteMany({
          where: { id: { in: postIds } },
        });
      }
    }

    // Execute all child cleanups concurrently in parallel for maximum speed!
    await Promise.all([
      this.prisma.explorePost.updateMany({
        where: { originalItineraryId: itineraryId },
        data: { originalItineraryId: null },
      }),
      this.prisma.itineraryMember.deleteMany({ where: { itineraryId } }),
      this.prisma.itineraryInvite.deleteMany({ where: { itineraryId } }),
      this.prisma.itineraryExpense.deleteMany({ where: { itineraryId } }),
      this.prisma.itinerarySettlement.deleteMany({ where: { itineraryId } }),
      this.prisma.itineraryDetail.deleteMany({ where: { itineraryId } }),
      this.prisma.itinerarySavedPlace.deleteMany({ where: { itineraryId } }),
      this.prisma.itinerarySection.deleteMany({ where: { itineraryId } }),
    ]);

    try {
      return await this.prisma.itinerary.delete({ where: { id: itineraryId } });
    } catch (err: any) {
      if (err?.code === 'P2025') {
        return { success: true, message: 'Lịch trình đã được xóa hoặc không tồn tại' };
      }
      throw err;
    }
  }

  async shiftDetailsDays(
    itineraryId: number,
    targetDay: number,
    offset: number,
  ) {
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

  async addDetail(data: any, updatedByUserId?: string) {
    const res = await this.prisma.itineraryDetail.create({
      data: {
        itineraryId: BigInt(data.itineraryId),
        placeId: data.placeId ? BigInt(data.placeId) : null,
        day: data.day,
        sortOrder: data.sortOrder,
        noteText: data.noteText,
        startTime: data.startTime || null,
        endTime: data.endTime || null,
      },
      include: { place: { include: { category: true, photos: true } } },
    });
    this.itinerariesGateway.broadcastItineraryUpdate(data.itineraryId.toString(), updatedByUserId, 'ADD_DETAIL');
    return res;
  }

  async addBulkDetails(itineraryId: number, detailsData: any[], updatedByUserId?: string) {
    if (!Array.isArray(detailsData) || detailsData.length === 0) return [];

    const records = detailsData.map((d) => ({
      itineraryId: BigInt(itineraryId),
      placeId: d.placeId ? BigInt(d.placeId) : null,
      day: d.day,
      sortOrder: d.sortOrder,
      noteText: d.noteText || null,
      startTime: d.startTime || null,
      endTime: d.endTime || null,
    }));

    await this.prisma.itineraryDetail.createMany({
      data: records,
    });

    this.itinerariesGateway.broadcastItineraryUpdate(itineraryId.toString(), updatedByUserId, 'ADD_BULK_DETAILS');
    return true;
  }

  async deleteDetail(id: number, updatedByUserId?: string) {
    const detail = await this.prisma.itineraryDetail.findUnique({ where: { id: BigInt(id) } });
    if (!detail) {
      console.warn(`deleteDetail skipped: record #${id} not found (already deleted).`);
      return null;
    }
    const res = await this.prisma.itineraryDetail.delete({ where: { id: BigInt(id) } });
    this.itinerariesGateway.broadcastItineraryUpdate(detail.itineraryId.toString(), updatedByUserId, 'DELETE_DETAIL');
    return res;
  }

  async updateDetail(id: number, data: any, updatedByUserId?: string) {
    try {
      const updateData = { ...data };
      const updatePayload: any = {};

      if (updateData.day !== undefined) updatePayload.day = updateData.day;
      if (updateData.sortOrder !== undefined) updatePayload.sortOrder = updateData.sortOrder;
      if (updateData.noteText !== undefined) updatePayload.noteText = updateData.noteText;
      if (updateData.startTime !== undefined) updatePayload.startTime = updateData.startTime;
      if (updateData.endTime !== undefined) updatePayload.endTime = updateData.endTime;
      if (updateData.todoItems !== undefined) updatePayload.todoItems = updateData.todoItems;
      if (updateData.reactions !== undefined) updatePayload.reactions = updateData.reactions;
      if (updateData.isCollapsed !== undefined) updatePayload.isCollapsed = updateData.isCollapsed;

      if (updateData.placeId !== undefined) {
        if (updateData.placeId !== null) {
          updatePayload.place = { connect: { id: BigInt(updateData.placeId) } };
        } else {
          updatePayload.place = { disconnect: true };
        }
      }

      console.log(`[UPDATE_DETAIL] Detail #${id} updating with payload:`, JSON.stringify(updatePayload, (key, value) => typeof value === 'bigint' ? value.toString() : value));

      const res = await this.prisma.itineraryDetail.update({
        where: { id: BigInt(id) },
        data: updatePayload,
        include: { place: { include: { category: true, photos: true } } },
      });

      console.log(`[UPDATE_DETAIL] Detail #${id} SUCCESS: new placeId = ${res.placeId}, placeName = ${res.place?.name}`);
      this.itinerariesGateway.broadcastItineraryUpdate(res.itineraryId.toString(), updatedByUserId, 'UPDATE_DETAIL');
      return res;
    } catch (err: any) {
      console.error(`[UPDATE_DETAIL] Detail #${id} Prisma update failed (${err.message}). Attempting RAW SQL update...`);
      try {
        if (data.placeId !== undefined) {
          const pid = data.placeId !== null ? BigInt(data.placeId) : null;
          await this.prisma.$executeRawUnsafe(
            `UPDATE "ItineraryDetail" SET "placeId" = $1 WHERE "id" = $2`,
            pid,
            BigInt(id),
          );
          console.log(`[UPDATE_DETAIL] Detail #${id} RAW SQL fallback placeId update SUCCESS!`);
          const refreshed = await this.prisma.itineraryDetail.findUnique({
            where: { id: BigInt(id) },
            include: { place: { include: { category: true, photos: true } } },
          });
          if (refreshed) {
            this.itinerariesGateway.broadcastItineraryUpdate(refreshed.itineraryId.toString(), updatedByUserId, 'UPDATE_DETAIL');
            return refreshed;
          }
        }
      } catch (rawErr: any) {
        console.error(`[UPDATE_DETAIL] Detail #${id} RAW SQL FAILED:`, rawErr.message || rawErr);
      }
      throw err;
    }
  }

  async addSavedPlace(data: any, updatedByUserId?: string) {
    let sortOrder = data.sortOrder;
    if (sortOrder === undefined || sortOrder === null) {
      const last = await this.prisma.itinerarySavedPlace.findFirst({
        where: { itineraryId: BigInt(data.itineraryId), section: data.section },
        orderBy: { sortOrder: 'desc' },
      });
      sortOrder = last ? last.sortOrder + 1 : 0;
    }

    const res = await this.prisma.itinerarySavedPlace.create({
      data: {
        itineraryId: BigInt(data.itineraryId),
        placeId: data.placeId ? BigInt(data.placeId) : null,
        section: data.section,
        noteText: data.noteText,
        sortOrder,
      },
      include: { place: { include: { category: true, photos: true } } },
    });
    this.itinerariesGateway.broadcastItineraryUpdate(data.itineraryId.toString(), updatedByUserId, 'ADD_SAVED_PLACE');
    return res;
  }

  async updateSavedPlace(id: number, data: any, updatedByUserId?: string) {
    try {
      const updateData = { ...data };
      const updatePayload: any = {};

      if (updateData.section !== undefined) updatePayload.section = updateData.section;
      if (updateData.sortOrder !== undefined) updatePayload.sortOrder = updateData.sortOrder;
      if (updateData.noteText !== undefined) updatePayload.noteText = updateData.noteText;

      if (updateData.placeId !== undefined) {
        if (updateData.placeId !== null) {
          updatePayload.place = { connect: { id: BigInt(updateData.placeId) } };
        } else {
          updatePayload.place = { disconnect: true };
        }
      }

      const res = await this.prisma.itinerarySavedPlace.update({
        where: { id: BigInt(id) },
        data: updatePayload,
        include: { place: { include: { category: true, photos: true } } },
      });
      this.itinerariesGateway.broadcastItineraryUpdate(res.itineraryId.toString(), updatedByUserId, 'UPDATE_SAVED_PLACE');
      return res;
    } catch (err: any) {
      console.error(`[UPDATE_SAVED_PLACE] SavedPlace #${id} Prisma update failed (${err.message}). Attempting RAW SQL update...`);
      try {
        if (data.placeId !== undefined) {
          const pid = data.placeId !== null ? BigInt(data.placeId) : null;
          await this.prisma.$executeRawUnsafe(
            `UPDATE "ItinerarySavedPlace" SET "placeId" = $1 WHERE "id" = $2`,
            pid,
            BigInt(id),
          );
          console.log(`[UPDATE_SAVED_PLACE] SavedPlace #${id} RAW SQL fallback placeId update SUCCESS!`);
          const refreshed = await this.prisma.itinerarySavedPlace.findUnique({
            where: { id: BigInt(id) },
            include: { place: { include: { category: true, photos: true } } },
          });
          if (refreshed) {
            this.itinerariesGateway.broadcastItineraryUpdate(refreshed.itineraryId.toString(), updatedByUserId, 'UPDATE_SAVED_PLACE');
            return refreshed;
          }
        }
      } catch (rawErr: any) {
        console.error(`[UPDATE_SAVED_PLACE] SavedPlace #${id} RAW SQL FAILED:`, rawErr.message || rawErr);
      }
      throw err;
    }
  }

  async deleteSavedPlace(id: number, updatedByUserId?: string) {
    const item = await this.prisma.itinerarySavedPlace.findUnique({ where: { id: BigInt(id) } });
    if (!item) {
      console.warn(`deleteSavedPlace skipped: record #${id} not found (already deleted).`);
      return null;
    }
    const res = await this.prisma.itinerarySavedPlace.delete({
      where: { id: BigInt(id) },
    });
    this.itinerariesGateway.broadcastItineraryUpdate(item.itineraryId.toString(), updatedByUserId, 'DELETE_SAVED_PLACE');
    return res;
  }

  async deleteSavedPlacesBySection(itineraryId: number, section: string, updatedByUserId?: string) {
    const res = await this.prisma.itinerarySavedPlace.deleteMany({
      where: { itineraryId: BigInt(itineraryId), section },
    });
    this.itinerariesGateway.broadcastItineraryUpdate(itineraryId.toString(), updatedByUserId, 'DELETE_SECTION_PLACES');
    return res;
  }

  async deleteMultipleSavedPlaces(ids: number[], updatedByUserId?: string) {
    if (ids.length === 0) return { count: 0 };
    const first = await this.prisma.itinerarySavedPlace.findFirst({ where: { id: BigInt(ids[0]) } });
    const res = await this.prisma.itinerarySavedPlace.deleteMany({
      where: { id: { in: ids.map((id) => BigInt(id)) } },
    });
    if (first) {
      this.itinerariesGateway.broadcastItineraryUpdate(first.itineraryId.toString(), updatedByUserId, 'DELETE_MULTIPLE_SAVED');
    }
    return res;
  }

  async upsertSection(data: any, updatedByUserId?: string) {
    const existing = await this.prisma.itinerarySection.findFirst({
      where: { itineraryId: BigInt(data.itineraryId), name: data.name },
    });
    let res: any;
    if (existing) {
      res = await this.prisma.itinerarySection.update({
        where: { id: existing.id },
        data: {
          colorCode: data.colorCode,
          iconCode: data.iconCode,
          sortOrder: data.sortOrder,
          sectionType: data.sectionType,
        },
      });
    } else {
      res = await this.prisma.itinerarySection.create({
        data: {
          itineraryId: BigInt(data.itineraryId),
          name: data.name,
          colorCode: data.colorCode,
          iconCode: data.iconCode,
          sortOrder: data.sortOrder || 0,
          sectionType: data.sectionType || 'LIST',
        },
      });
    }
    this.itinerariesGateway.broadcastItineraryUpdate(data.itineraryId.toString(), updatedByUserId, 'UPSERT_SECTION');
    return res;
  }

  async deleteSection(itineraryId: number, name: string, updatedByUserId?: string) {
    const res = await this.prisma.itinerarySection.deleteMany({
      where: { itineraryId: BigInt(itineraryId), name },
    });
    this.itinerariesGateway.broadcastItineraryUpdate(itineraryId.toString(), updatedByUserId, 'DELETE_SECTION');
    return res;
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
        data: { name: 'Đồ dùng cá nhân', tabType: 'PACKING' },
      });
      await this.prisma.checklistTemplateItem.createMany({
        data: [
          { categoryId: packingCat.id, name: 'Bàn chải & Kem đánh răng' },
          { categoryId: packingCat.id, name: 'Quần áo dự phòng' },
          { categoryId: packingCat.id, name: 'Sạc điện thoại / Sạc dự phòng' },
          { categoryId: packingCat.id, name: 'Đồ lót' },
          { categoryId: packingCat.id, name: 'Khăn tắm' },
        ],
      });

      const prepCat = await this.prisma.checklistTemplateCategory.create({
        data: { name: 'Giấy tờ & Thủ tục', tabType: 'PRE_TRIP' },
      });
      await this.prisma.checklistTemplateItem.createMany({
        data: [
          { categoryId: prepCat.id, name: 'Hộ chiếu / CCCD' },
          { categoryId: prepCat.id, name: 'Vé máy bay / Xe' },
          { categoryId: prepCat.id, name: 'Tiền mặt & Thẻ tín dụng' },
          { categoryId: prepCat.id, name: 'Xác nhận đặt phòng khách sạn' },
        ],
      });

      categories = await this.prisma.checklistTemplateCategory.findMany({
        include: {
          items: true,
        },
      });
    }

    return categories;
  }

  // --- QUẢN LÝ PHÂN QUYỀN & CHIA SẺ CHUYẾN ĐÍ ---

  async getUserRoleInItinerary(itineraryId: number, userId: string): Promise<string | null> {
    const userBigInt = BigInt(userId);
    const itinBigInt = BigInt(itineraryId);

    const itinerary = await this.prisma.itinerary.findUnique({
      where: { id: itinBigInt },
      select: { userId: true },
    });

    if (!itinerary) return null;

    if (itinerary.userId === userBigInt) {
      return 'OWNER';
    }

    const member = await this.prisma.itineraryMember.findUnique({
      where: {
        itineraryId_userId: {
          itineraryId: itinBigInt,
          userId: userBigInt,
        },
      },
    });

    return member ? member.role : null;
  }

  // Mời qua Email
  async inviteByEmail(itineraryId: number, currentUserId: string, email: string, customRole?: string) {
    const role = await this.getUserRoleInItinerary(itineraryId, currentUserId);
    if (role !== 'OWNER' && role !== 'EDITOR') {
      throw new ForbiddenException('Bạn không có quyền mời thành viên vào chuyến đi này.');
    }

    const itinerary = await this.prisma.itinerary.findUnique({
      where: { id: BigInt(itineraryId) },
    });
    if (!itinerary) throw new NotFoundException('Chuyến đi không tồn tại.');

    const currentUser = await this.prisma.user.findUnique({
      where: { id: BigInt(currentUserId) },
    });

    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 ngày

    const assignedRole = (customRole === 'VIEWER' || customRole === 'Chỉ xem') ? 'VIEWER' : 'EDITOR';

    await this.prisma.itineraryInvite.create({
      data: {
        itineraryId: BigInt(itineraryId),
        invitedByUserId: BigInt(currentUserId),
        email: email.trim().toLowerCase(),
        role: assignedRole,
        token,
        expiresAt,
      },
    });

    // Gửi Mail
    const sent = await this.mailService.sendItineraryInvite(
      email.trim(),
      currentUser?.fullName || 'Một người bạn',
      itinerary.title,
      token,
    );

    return { success: true, message: 'Đã gửi lời mời tới email ' + email, emailSent: sent };
  }

  // Tạo / Lấy link chia sẻ qua Mạng xã hội (Quyền VIEWER)
  async getShareLink(itineraryId: number, currentUserId: string) {
    const role = await this.getUserRoleInItinerary(itineraryId, currentUserId);
    if (!role) {
      throw new ForbiddenException('Bạn không có quyền xem thông tin chuyến đi này.');
    }

    const itinBigInt = BigInt(itineraryId);
    let existingInvite = await this.prisma.itineraryInvite.findFirst({
      where: {
        itineraryId: itinBigInt,
        email: null,
        role: 'VIEWER',
        status: 'PENDING',
        expiresAt: { gt: new Date() },
      },
    });

    if (!existingInvite) {
      const token = crypto.randomBytes(24).toString('hex');
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 ngày
      existingInvite = await this.prisma.itineraryInvite.create({
        data: {
          itineraryId: itinBigInt,
          invitedByUserId: BigInt(currentUserId),
          email: null,
          role: 'VIEWER', // Luôn là VIEWER khi chia sẻ qua Link/Social
          token,
          expiresAt,
        },
      });
    }

    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const shareUrl = `${appUrl}/itineraries/accept-invite?token=${existingInvite.token}`;

    return {
      success: true,
      token: existingInvite.token,
      shareUrl,
      role: 'VIEWER',
    };
  }

  // Xác nhận lời mời (Dành cho cả Email & Link)
  async acceptInvite(token: string, currentUserId?: string) {
    const invite = await this.prisma.itineraryInvite.findUnique({
      where: { token },
      include: { itinerary: true },
    });

    if (!invite) throw new NotFoundException('Mã lời mời không hợp lệ hoặc đã bị hủy.');
    if (invite.expiresAt < new Date()) {
      throw new BadRequestException('Lời mời này đã hết hạn.');
    }

    let joinedUser: any = null;

    // 1. Tìm user theo Email nếu lời mời có đính kèm Email
    if (invite.email) {
      joinedUser = await this.prisma.user.findUnique({
        where: { email: invite.email },
      });
    }

    // 2. Hoặc theo currentUserId (từ JWT Token nếu có)
    if (!joinedUser && currentUserId) {
      joinedUser = await this.prisma.user.findUnique({
        where: { id: BigInt(currentUserId) },
      });
    }

    if (joinedUser) {
      const userBigInt = joinedUser.id;

      // Thêm vào danh sách thành viên chuyến đi
      const existingMember = await this.prisma.itineraryMember.findUnique({
        where: {
          itineraryId_userId: {
            itineraryId: invite.itineraryId,
            userId: userBigInt,
          },
        },
      });

      if (!existingMember) {
        await this.prisma.itineraryMember.create({
          data: {
            itineraryId: invite.itineraryId,
            userId: userBigInt,
            role: invite.role, // 'EDITOR' hoặc 'VIEWER'
          },
        });
      }

      // Đánh dấu trạng thái lời mời đã được chấp nhận
      await this.prisma.itineraryInvite.update({
        where: { id: invite.id },
        data: { status: 'ACCEPTED' },
      });

      return {
        success: true,
        message: `Chúc mừng ${joinedUser.fullName}! Bạn đã tham gia chuyến đi "${invite.itinerary.title}" thành công.`,
        itineraryTitle: invite.itinerary.title,
        role: invite.role,
        isJoined: true,
      };
    }

    // Nếu chưa đăng nhập / chưa có tài khoản
    return {
      success: true,
      message: `Vui lòng mở ứng dụng Cloudmood và Đăng nhập bằng Email: ${invite.email} để tham gia chuyến đi "${invite.itinerary.title}".`,
      itineraryTitle: invite.itinerary.title,
      email: invite.email,
      role: invite.role,
      isJoined: false,
    };
  }

  // Lấy danh sách thành viên của chuyến đi
  async getMembers(itineraryId: number, currentUserId: string) {
    const role = await this.getUserRoleInItinerary(itineraryId, currentUserId);
    if (!role) throw new ForbiddenException('Bạn không thể xem danh sách thành viên chuyến đi này.');

    const itinerary = await this.prisma.itinerary.findUnique({
      where: { id: BigInt(itineraryId) },
      select: {
        userId: true,
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

    const members = await this.prisma.itineraryMember.findMany({
      where: { itineraryId: BigInt(itineraryId) },
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
      orderBy: { joinedAt: 'asc' },
    });

    let resultMembers = members.map((m) => ({
      id: m.id.toString(),
      userId: m.userId.toString(),
      fullName: m.user.fullName,
      email: m.user.email,
      avatar: m.user.avatar,
      role: m.role,
      joinedAt: m.joinedAt,
    }));

    // Nếu người tạo (Owner) chưa có trong bảng ItineraryMember (chuyến đi cũ)
    if (itinerary && itinerary.user) {
      const ownerInMembers = resultMembers.find(
        (m) => m.userId === itinerary.userId.toString(),
      );
      if (!ownerInMembers) {
        // Tự động thêm owner vào bảng ItineraryMember để lưu bền vững
        try {
          await this.prisma.itineraryMember.create({
            data: {
              itineraryId: BigInt(itineraryId),
              userId: itinerary.userId,
              role: 'OWNER',
            },
          });
        } catch (e) {
          // Bỏ qua nếu lỗi
        }

        resultMembers.unshift({
          id: 'owner',
          userId: itinerary.userId.toString(),
          fullName: itinerary.user.fullName,
          email: itinerary.user.email,
          avatar: itinerary.user.avatar,
          role: 'OWNER',
          joinedAt: new Date(),
        });
      }
    }

    return {
      currentRole: role,
      members: resultMembers,
    };
  }

  // Thay đổi quyền hạn thành viên (Chỉ OWNER)
  async updateMemberRole(itineraryId: number, currentUserId: string, targetUserId: string, newRole: string) {
    const role = await this.getUserRoleInItinerary(itineraryId, currentUserId);
    if (role !== 'OWNER') {
      throw new ForbiddenException('Chỉ chủ sở hữu chuyến đi mới có quyền sửa vai trò thành viên.');
    }

    if (newRole !== 'EDITOR' && newRole !== 'VIEWER') {
      throw new BadRequestException('Quyền hạn chỉ có thể là EDITOR hoặc VIEWER.');
    }

    const itinBigInt = BigInt(itineraryId);
    const targetUserBigInt = BigInt(targetUserId);

    const updated = await this.prisma.itineraryMember.update({
      where: {
        itineraryId_userId: {
          itineraryId: itinBigInt,
          userId: targetUserBigInt,
        },
      },
      data: { role: newRole },
    });

    return { success: true, updatedRole: updated.role };
  }

  // Xóa thành viên khỏi chuyến đi (Chỉ OWNER)
  async removeMember(itineraryId: number, currentUserId: string, targetUserId: string) {
    const role = await this.getUserRoleInItinerary(itineraryId, currentUserId);
    if (role !== 'OWNER') {
      throw new ForbiddenException('Chỉ chủ sở hữu chuyến đi mới có quyền xóa thành viên.');
    }

    const itinBigInt = BigInt(itineraryId);
    const targetUserBigInt = BigInt(targetUserId);

    await this.prisma.itineraryMember.delete({
      where: {
        itineraryId_userId: {
          itineraryId: itinBigInt,
          userId: targetUserBigInt,
        },
      },
    });

    return { success: true, message: 'Đã xóa thành viên khỏi chuyến đi.' };
  }

  // Sao chép chuyến đi (Duplicate) dành cho VIEWER / Người muốn clone
  async duplicateItinerary(itineraryId: number, currentUserId: string) {
    const original = await this.prisma.itinerary.findUnique({
      where: { id: BigInt(itineraryId) },
      include: {
        sections: true,
        details: true,
        savedPlaces: true,
      },
    });

    if (!original) throw new NotFoundException('Chuyến đi gốc không tồn tại.');

    const userBigInt = BigInt(currentUserId);

    // 1. Tạo chuyến đi mới cho user
    const cloned = await this.prisma.itinerary.create({
      data: {
        title: `${original.title} (Bản sao)`,
        destination: original.destination,
        startDate: original.startDate,
        days: original.days,
        budget: original.budget,
        companion: original.companion,
        pace: original.pace,
        categories: original.categories,
        amenities: original.amenities,
        dayConfigs: original.dayConfigs || {},
        coverImage: original.coverImage,
        userId: userBigInt,
      },
    });

    // Add owner
    await this.prisma.itineraryMember.create({
      data: {
        itineraryId: cloned.id,
        userId: userBigInt,
        role: 'OWNER',
      },
    });

    // 2. Clone Sections
    if (original.sections.length > 0) {
      await this.prisma.itinerarySection.createMany({
        data: original.sections.map((s) => ({
          itineraryId: cloned.id,
          name: s.name,
          colorCode: s.colorCode,
          iconCode: s.iconCode,
          sortOrder: s.sortOrder,
          subTitle: s.subTitle,
          sectionType: s.sectionType,
        })),
      });
    }

    // 3. Clone Details
    if (original.details.length > 0) {
      await this.prisma.itineraryDetail.createMany({
        data: original.details.map((d) => ({
          itineraryId: cloned.id,
          day: d.day,
          sortOrder: d.sortOrder,
          placeId: d.placeId,
          noteText: d.noteText,
          todoItems: d.todoItems || [],
          reactions: d.reactions || [],
          isCollapsed: d.isCollapsed,
          startTime: d.startTime,
          endTime: d.endTime,
        })),
      });
    }

    // 4. Clone SavedPlaces
    if (original.savedPlaces.length > 0) {
      await this.prisma.itinerarySavedPlace.createMany({
        data: original.savedPlaces.map((sp) => ({
          itineraryId: cloned.id,
          placeId: sp.placeId,
          section: sp.section,
          noteText: sp.noteText,
          reactions: sp.reactions || [],
          isCollapsed: sp.isCollapsed,
          sortOrder: sp.sortOrder,
          todoItems: sp.todoItems || [],
          startTime: sp.startTime,
          endTime: sp.endTime,
        })),
      });
    }

    return {
      success: true,
      message: 'Đã sao chép chuyến đi thành công!',
      newItineraryId: cloned.id.toString(),
    };
  }

  // --- QUẢN LÝ CHI PHÍ CHUYẾN ĐI (EXPENSES) ---

  async getExpenses(itineraryId: number) {
    const expenses = await this.prisma.itineraryExpense.findMany({
      where: { itineraryId: BigInt(itineraryId) },
      orderBy: { createdAt: 'desc' },
    });
    return expenses.map((e) => ({
      id: e.id.toString(),
      itineraryId: e.itineraryId.toString(),
      title: e.title,
      amount: e.amount,
      category: e.category,
      payer: e.payer,
      share: e.share,
      date: e.date,
      currencySymbol: e.currencySymbol,
      currencyCode: e.currencyCode,
      savedPlaceId: e.savedPlaceId ? e.savedPlaceId.toString() : null,
      detailId: e.detailId ? e.detailId.toString() : null,
      createdAt: e.createdAt,
    }));
  }

  async addExpense(itineraryId: number, data: any) {
    // Upsert: nếu savedPlaceId hoặc detailId đã tồn tại, update thay vì tạo mới
    const savedPlaceId = data.savedPlaceId ? BigInt(data.savedPlaceId) : null;
    const detailId = data.detailId ? BigInt(data.detailId) : null;

    // Check if an expense already exists for this place
    let existing: any = null;
    if (savedPlaceId) {
      existing = await this.prisma.itineraryExpense.findUnique({ where: { savedPlaceId } });
    } else if (detailId) {
      existing = await this.prisma.itineraryExpense.findUnique({ where: { detailId } });
    }

    const expenseData = {
      itineraryId: BigInt(itineraryId),
      title: data.title || 'Chi phí',
      amount: Number(data.amount) || 0,
      category: data.category || 'Khác',
      payer: data.payer || 'Bạn',
      share: data.share || 'Không chia sẻ',
      date: data.date || new Date().toISOString().substring(0, 10),
      currencySymbol: data.currencySymbol || 'đ',
      currencyCode: data.currencyCode || 'VND',
      savedPlaceId,
      detailId,
    };

    let expense: any;
    if (existing) {
      expense = await this.prisma.itineraryExpense.update({
        where: { id: existing.id },
        data: expenseData,
      });
    } else {
      expense = await this.prisma.itineraryExpense.create({ data: expenseData });
    }

    return {
      id: expense.id.toString(),
      itineraryId: expense.itineraryId.toString(),
      title: expense.title,
      amount: expense.amount,
      category: expense.category,
      payer: expense.payer,
      share: expense.share,
      date: expense.date,
      currencySymbol: expense.currencySymbol,
      currencyCode: expense.currencyCode,
      savedPlaceId: expense.savedPlaceId ? expense.savedPlaceId.toString() : null,
      detailId: expense.detailId ? expense.detailId.toString() : null,
      createdAt: expense.createdAt,
    };
  }

  async deleteExpense(expenseId: number) {
    const expense = await this.prisma.itineraryExpense.findUnique({
      where: { id: BigInt(expenseId) },
    });

    if (expense) {
      // 1. Delete settlements linked to this expenseId
      await this.prisma.itinerarySettlement.deleteMany({
        where: { expenseId: BigInt(expenseId) },
      });

      // 2. Delete the expense
      await this.prisma.itineraryExpense.delete({
        where: { id: BigInt(expenseId) },
      });

      // 3. If no remaining expenses exist for this itinerary, clear all settlements for this itinerary
      const remainingCount = await this.prisma.itineraryExpense.count({
        where: { itineraryId: expense.itineraryId },
      });
      if (remainingCount === 0) {
        await this.prisma.itinerarySettlement.deleteMany({
          where: { itineraryId: expense.itineraryId },
        });
      }
    }

    return { success: true };
  }

  async updateExpense(expenseId: number, data: any) {
    const savedPlaceId = data.savedPlaceId ? BigInt(data.savedPlaceId) : undefined;
    const detailId = data.detailId ? BigInt(data.detailId) : undefined;

    const expense = await this.prisma.itineraryExpense.update({
      where: { id: BigInt(expenseId) },
      data: {
        title: data.title,
        amount: data.amount ? Number(data.amount) : undefined,
        category: data.category,
        payer: data.payer,
        share: data.share,
        date: data.date,
        currencySymbol: data.currencySymbol,
        currencyCode: data.currencyCode,
        ...(savedPlaceId !== undefined ? { savedPlaceId } : {}),
        ...(detailId !== undefined ? { detailId } : {}),
      },
    });
    return {
      id: expense.id.toString(),
      itineraryId: expense.itineraryId.toString(),
      title: expense.title,
      amount: expense.amount,
      category: expense.category,
      payer: expense.payer,
      share: expense.share,
      date: expense.date,
      currencySymbol: expense.currencySymbol,
      currencyCode: expense.currencyCode,
      savedPlaceId: expense.savedPlaceId ? expense.savedPlaceId.toString() : null,
      detailId: expense.detailId ? expense.detailId.toString() : null,
      createdAt: expense.createdAt,
    };
  }

  // --- SETTLEMENT METHODS ---
  async getSettlements(itineraryId: number) {
    const list = await this.prisma.itinerarySettlement.findMany({
      where: { itineraryId: BigInt(itineraryId) },
      orderBy: { createdAt: 'desc' },
    });
    return list.map((st) => ({
      id: st.id.toString(),
      itineraryId: st.itineraryId.toString(),
      expenseId: st.expenseId ? st.expenseId.toString() : null,
      fromUserId: st.fromUserId ? st.fromUserId.toString() : null,
      fromName: st.fromName,
      toUserId: st.toUserId ? st.toUserId.toString() : null,
      toName: st.toName,
      amount: st.amount,
      date: st.date.toISOString(),
      createdAt: st.createdAt.toISOString(),
    }));
  }

  async addSettlement(itineraryId: number, data: any) {
    const settlement = await this.prisma.itinerarySettlement.create({
      data: {
        itineraryId: BigInt(itineraryId),
        expenseId: data.expenseId ? BigInt(data.expenseId) : null,
        fromUserId: data.fromUserId ? BigInt(data.fromUserId) : null,
        fromName: data.fromName,
        toUserId: data.toUserId ? BigInt(data.toUserId) : null,
        toName: data.toName,
        amount: Number(data.amount),
        date: data.date ? new Date(data.date) : new Date(),
      },
    });
    return {
      id: settlement.id.toString(),
      itineraryId: settlement.itineraryId.toString(),
      expenseId: settlement.expenseId ? settlement.expenseId.toString() : null,
      fromUserId: settlement.fromUserId ? settlement.fromUserId.toString() : null,
      fromName: settlement.fromName,
      toUserId: settlement.toUserId ? settlement.toUserId.toString() : null,
      toName: settlement.toName,
      amount: settlement.amount,
      date: settlement.date.toISOString(),
      createdAt: settlement.createdAt.toISOString(),
    };
  }

  async deleteSettlement(settlementId: number) {
    try {
      await this.prisma.itinerarySettlement.deleteMany({
        where: { id: BigInt(settlementId) },
      });
      return { success: true };
    } catch (e) {
      return { success: false, error: (e as any)?.message };
    }
  }

  private cachedRates: { rates: Record<string, number>; updatedAt: string } | null = null;

  async getCurrencyRates() {
    const NOW = new Date();
    if (this.cachedRates && (NOW.getTime() - new Date(this.cachedRates.updatedAt).getTime()) < 6 * 3600 * 1000) {
      return this.cachedRates;
    }

    const defaultRates: Record<string, number> = {
      VND: 1.0,
      USD: 26320.01,
      EUR: 28500.0,
      JPY: 165.0,
      KRW: 19.5,
      CNY: 3620.0,
      GBP: 33500.0,
      SGD: 19400.0,
      THB: 720.0,
      AUD: 17100.0,
      CAD: 18800.0,
      TWD: 810.0,
    };

    try {
      const response = await fetch('https://open.er-api.com/v6/latest/USD');
      if (response.ok) {
        const data = await response.json();
        if (data && data.rates && data.rates.VND) {
          const usdToVnd = Number(data.rates.VND);
          const computedRates: Record<string, number> = { VND: 1.0 };

          Object.keys(defaultRates).forEach((code) => {
            if (code === 'VND') {
              computedRates['VND'] = 1.0;
            } else if (data.rates[code]) {
              const codeRateToUsd = Number(data.rates[code]);
              computedRates[code] = Math.round((usdToVnd / codeRateToUsd) * 100) / 100;
            } else {
              computedRates[code] = defaultRates[code];
            }
          });

          this.cachedRates = {
            rates: computedRates,
            updatedAt: NOW.toISOString(),
          };
          return this.cachedRates;
        }
      }
    } catch (e) {
      console.log('Using default currency rates fallback:', e);
    }

    this.cachedRates = {
      rates: defaultRates,
      updatedAt: NOW.toISOString(),
    };
    return this.cachedRates;
  }
}
