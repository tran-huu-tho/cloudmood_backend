import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import pg from 'pg';
const { Pool } = pg;
import { PrismaPg } from '@prisma/adapter-pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('--- Database Place Ratings Update & Cleanup ---');

  // 1. Delete places clearly outside Cần Thơ (e.g., Ninh Thuận, Hà Nội, Đà Nẵng, etc.)
  const places = await prisma.place.findMany();
  console.log(`Current total places: ${places.length}`);

  let deletedCount = 0;
  for (const place of places) {
    const address = (place.address || '').toLowerCase();
    const name = place.name.toLowerCase();
    
    // Check if the place address matches other provinces explicitly and NOT Cần Thơ
    const isOutsideCanTho = 
      (address.includes('ninh thuận') || address.includes('ninh thuan') || 
       address.includes('nha trang') || address.includes('phú quốc') || address.includes('phu quoc') ||
       address.includes('hồ chí minh') || address.includes('hà nội') || address.includes('đà nẵng') || 
       address.includes('vũng tàu') || address.includes('vinh hy') || address.includes('phan thiết')) &&
      !(address.includes('cần thơ') || address.includes('can tho'));

    if (isOutsideCanTho) {
      console.log(`Deleting place outside Cần Thơ: "${place.name}" - Address: "${place.address}"`);
      // Delete reviews first due to foreign keys
      await prisma.review.deleteMany({ where: { placeId: place.id } });
      await prisma.placePhoto.deleteMany({ where: { placeId: place.id } });
      await prisma.place.delete({ where: { id: place.id } });
      deletedCount++;
    }
  }
  console.log(`Deleted ${deletedCount} places outside Cần Thơ.`);

  // 2. Recalculate rating and userRatingCount from the Review table
  const remainingPlaces = await prisma.place.findMany();
  console.log(`Remaining places: ${remainingPlaces.length}`);

  let updatedCount = 0;
  for (const place of remainingPlaces) {
    const reviews = await prisma.review.findMany({
      where: { placeId: place.id }
    });

    if (reviews.length > 0) {
      const totalRating = reviews.reduce((sum, r) => sum + r.rating, 0);
      const avgRating = Math.round((totalRating / reviews.length) * 10) / 10; // Round to 1 decimal place
      const count = reviews.length;

      await prisma.place.update({
        where: { id: place.id },
        data: {
          rating: avgRating,
          userRatingCount: count
        }
      });
      updatedCount++;
    } else {
      // If no reviews, set to default or 0
      await prisma.place.update({
        where: { id: place.id },
        data: {
          rating: 0,
          userRatingCount: 0
        }
      });
    }
  }

  console.log(`Recalculated and updated ratings for ${updatedCount} places.`);

  // 3. Print the new Top 5 Rated Places to verify
  const topRated = await prisma.place.findMany({
    orderBy: [
      { rating: 'desc' },
      { userRatingCount: 'desc' }
    ],
    take: 5
  });

  console.log('\nNew Top 5 Rated Places:');
  topRated.forEach((p, idx) => {
    console.log(`${idx + 1}. ${p.name} - Rating: ${p.rating} (${p.userRatingCount} reviews) - Address: ${p.address}`);
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
