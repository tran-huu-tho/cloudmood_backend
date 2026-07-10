import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

import * as bcrypt from 'bcrypt';

async function main() {
  console.log('--- WIPING OUT ALL PLACES AND REVIEWS ---');
  
  const reviewDel = await prisma.review.deleteMany({});
  console.log(`Deleted all ${reviewDel.count} reviews.`);

  const photoDel = await prisma.placePhoto.deleteMany({});
  console.log(`Deleted all ${photoDel.count} photos.`);

  const savedPlaceUpdate = await prisma.itinerarySavedPlace.updateMany({
    data: { placeId: null }
  });
  console.log(`Updated all ${savedPlaceUpdate.count} itinerary saved places to NULL.`);

  const detailUpdate = await prisma.itineraryDetail.updateMany({
    data: { placeId: null }
  });
  console.log(`Updated all ${detailUpdate.count} itinerary details to NULL.`);

  const placeDel = await prisma.place.deleteMany({});
  console.log(`Deleted all ${placeDel.count} places from the database.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
