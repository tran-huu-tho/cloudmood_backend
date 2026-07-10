import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('--- USER TABLE COUNT ---');
  const userCount = await prisma.user.count();
  console.log('Users:', userCount);

  console.log('--- WEATHER CACHE COUNT ---');
  const cacheCount = await prisma.weatherCache.count();
  console.log('Weather Cache records:', cacheCount);

  console.log('--- WEATHER CACHE DATA ---');
  const cache = await prisma.weatherCache.findMany();
  console.log(JSON.stringify(cache, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
