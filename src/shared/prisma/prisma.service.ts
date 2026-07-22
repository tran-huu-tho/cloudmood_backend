import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const adapter = new PrismaPg(pool);
    super({ adapter });
  }

  async onModuleInit() {
    try {
      await this.$connect();
      try {
        await this.$executeRawUnsafe(
          `ALTER TABLE "Itinerary" ADD COLUMN IF NOT EXISTS "isGuide" boolean DEFAULT false`,
        );

        // Add routing columns and section type columns
        await this.$executeRawUnsafe(
          `ALTER TABLE "ItinerarySection" ADD COLUMN IF NOT EXISTS "sectionType" text DEFAULT 'LIST'`,
        );
        await this.$executeRawUnsafe(
          `ALTER TABLE "ItinerarySection" ADD COLUMN IF NOT EXISTS "subTitle" text`,
        );

        // Add isApproved to Place table dynamically
        await this.$executeRawUnsafe(
          `ALTER TABLE "Place" ADD COLUMN IF NOT EXISTS "isApproved" boolean DEFAULT true`,
        );

        console.log('Successfully added dynamic columns');
      } catch (e) {
        console.log('Columns already exist or error:', e.message);
      }
    } catch (e) {
      console.warn(
        '⚠️ Cảnh báo: Không thể kết nối cơ sở dữ liệu. Ứng dụng vẫn sẽ chạy nhưng các tính năng liên quan đến DB có thể không hoạt động.',
        e.message,
      );
    }
  }

  async onModuleDestroy() {
    try {
      await this.$disconnect();
    } catch (e) {
      // Ignored
    }
  }
}
