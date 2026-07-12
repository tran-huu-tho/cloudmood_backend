import 'dotenv/config';
import { prisma } from './prisma-client.mjs';

async function main() {
  console.log('=== CALCULATING PRECISE RATINGS FROM LOCAL REVIEWS ===');

  const places = await prisma.place.findMany({
    include: { reviews: true }
  });

  console.log(`Loaded ${places.length} places.`);
  let updatedCount = 0;

  for (const place of places) {
    if (place.reviews.length > 0) {
      const totalRating = place.reviews.reduce((sum, r) => sum + r.rating, 0);
      // Calculate precise average to 1 decimal place (e.g., 4.75 -> 4.8)
      const avgRating = Math.round((totalRating / place.reviews.length) * 10) / 10;

      await prisma.place.update({
        where: { id: place.id },
        data: {
          rating: avgRating
        }
      });
      console.log(`Updated "${place.name}": Rating recalculated to ${avgRating} ⭐ (from ${place.reviews.length} local reviews, TripAdvisor total: ${place.userRatingCount})`);
      updatedCount++;
    }
  }

  // Print top 10 rated places to verify
  const topRated = await prisma.place.findMany({
    where: {
      userRatingCount: { gte: 15 }
    },
    orderBy: [
      { rating: 'desc' },
      { userRatingCount: 'desc' }
    ],
    take: 10
  });

  console.log('\nNew Top Rated Places (with at least 15 reviews):');
  topRated.forEach((p, idx) => {
    console.log(`${idx + 1}. ${p.name} - Rating: ${p.rating} ⭐ - TripAdvisor reviews count: ${p.userRatingCount}`);
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
