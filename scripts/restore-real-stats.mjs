import 'dotenv/config';
import { prisma } from './prisma-client.mjs';
import { fetchWithKeyRotation } from './api-key-manager.mjs';

const host = 'travel-advisor.p.rapidapi.com';
const API_DELAY_MS = 1000; // 1 second delay between calls

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Map database categories to TripAdvisor endpoints
function getDetailsEndpoint(categoryName) {
  switch (categoryName) {
    case 'Khách sạn':
      return 'hotels/get-details';
    case 'Nhà hàng':
    case 'Quán ăn':
    case 'Cà phê':
      return 'restaurants/get-details';
    case 'Điểm tham quan':
    case 'Công viên':
    case 'Trung tâm thương mại':
    default:
      return 'attractions/get-details';
  }
}

async function main() {
  console.log('=== RESTORING REAL TRIPADVISOR RATINGS & REVIEW COUNTS ===');

  const places = await prisma.place.findMany({
    include: { category: true }
  });

  console.log(`Loaded ${places.length} places to process.`);
  let updatedCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < places.length; i++) {
    const place = places[i];
    console.log(`\n[${i + 1}/${places.length}] Processing "${place.name}" [${place.category.name}]`);

    let locationId = null;
    let endpoint = getDetailsEndpoint(place.category.name);

    if (place.externalId && place.externalId.startsWith('ta_')) {
      // TripAdvisor place
      locationId = place.externalId.split('_').pop();
    } else {
      // Manually added place (e.g. Vincom, Sense City, Chùa Nam Nhã)
      // Search TripAdvisor dynamically for its ID
      console.log(`  Manual place. Searching TripAdvisor for Location ID...`);
      try {
        const searchUrl = new URL(`https://${host}/locations/search`);
        searchUrl.searchParams.set('query', `${place.name} Cần Thơ`);
        searchUrl.searchParams.set('location_id', '303942'); // Cần Thơ
        searchUrl.searchParams.set('limit', '1');
        searchUrl.searchParams.set('lang', 'vi_VN');

        const searchRes = await fetchWithKeyRotation(searchUrl, {
          method: 'GET',
          headers: { 'x-rapidapi-host': host }
        });

        if (searchRes.ok) {
          const searchData = await searchRes.json();
          const firstResult = searchData.data?.[0];
          if (firstResult) {
            locationId = firstResult.result_object?.location_id || firstResult.location_id;
            console.log(`  Found Location ID: ${locationId} for "${place.name}"`);
            
            // Map the search result type to get details endpoint
            const resType = firstResult.result_type;
            if (resType === 'lodging') endpoint = 'hotels/get-details';
            else if (resType === 'eatingout') endpoint = 'restaurants/get-details';
            else endpoint = 'attractions/get-details';
          }
        }
      } catch (searchErr) {
        console.error(`  Search failed for "${place.name}":`, searchErr.message);
      }
    }

    if (!locationId) {
      console.log(`  No TripAdvisor location ID found. Skipping.`);
      skippedCount++;
      continue;
    }

    // Call Details API
    try {
      const detailsUrl = new URL(`https://${host}/${endpoint}`);
      detailsUrl.searchParams.set('location_id', locationId);
      detailsUrl.searchParams.set('lang', 'vi_VN');

      const res = await fetchWithKeyRotation(detailsUrl, {
        method: 'GET',
        headers: { 'x-rapidapi-host': host }
      });

      if (!res.ok) {
        throw new Error(`HTTP status ${res.status}`);
      }

      const data = await res.json();
      
      // Parse rating and num_reviews
      const rawRating = data.rating;
      const rawNumReviews = data.num_reviews;

      const rating = rawRating ? parseFloat(rawRating) : null;
      const numReviews = rawNumReviews ? parseInt(rawNumReviews, 10) : 0;

      if (rating !== null) {
        await prisma.place.update({
          where: { id: place.id },
          data: {
            rating: rating,
            userRatingCount: numReviews
          }
        });
        console.log(`  => UPDATED: Rating: ${rating} ⭐ | ${numReviews} reviews`);
        updatedCount++;
      } else {
        console.log(`  => Details has no rating. Keeping existing.`);
        skippedCount++;
      }

    } catch (err) {
      console.error(`  Failed to fetch details for Location ID ${locationId}:`, err.message);
      skippedCount++;
    }

    await sleep(API_DELAY_MS);
  }

  console.log('\n==================================================');
  console.log(`Update completed: ${updatedCount} updated, ${skippedCount} skipped.`);
  console.log('==================================================');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
