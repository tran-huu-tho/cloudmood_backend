import { prisma } from './prisma-client.mjs';
import { fetchWithKeyRotation } from './api-key-manager.mjs';

const API_DELAY_MS = 1500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchTripAdvisorDetails(locationId, contentType) {
  const host = 'travel-advisor.p.rapidapi.com';
  
  let endpoint = 'restaurants/get-details';
  if (contentType === 'hotel') endpoint = 'hotels/get-details';
  else if (contentType === 'attraction') endpoint = 'attractions/get-details';

  const url = `https://${host}/${endpoint}?location_id=${locationId}&lang=vi_VN`;
  
  const res = await fetchWithKeyRotation(url, {
    headers: {
      'x-rapidapi-host': host
    }
  });

  if (!res.ok) {
    throw new Error(`TripAdvisor HTTP Error ${res.status}`);
  }

  const data = await res.json();
  return data?.web_url || null;
}

async function main() {
  console.log('Fetching all TripAdvisor places from database...');
  const places = await prisma.place.findMany({
    where: {
      externalId: {
        startsWith: 'ta_'
      }
    },
    include: {
      category: true
    }
  });

  console.log(`Found ${places.length} TripAdvisor places to process.`);

  let updatedCount = 0;
  let apiCallsCount = 0;

  for (const place of places) {
    // If it already has tripadvisorUrl, skip it
    if (place.tripadvisorUrl) {
      console.log(`- Skip Place ID ${place.id}: "${place.name}" (Already has TripAdvisor URL: ${place.tripadvisorUrl})`);
      continue;
    }

    const locationId = place.externalId.split('_').pop();
    if (!locationId || isNaN(Number(locationId))) {
      console.log(`- Skip Place ID ${place.id}: "${place.name}" (Invalid location ID in externalId: ${place.externalId})`);
      continue;
    }

    let contentType = 'restaurant';
    if (place.category.name === 'Khách sạn') contentType = 'hotel';
    else if (place.category.name === 'Điểm tham quan' || place.category.name === 'Công viên' || place.category.name === 'Trung tâm thương mại') contentType = 'attraction';

    console.log(`\nProcessing Place ID ${place.id}: "${place.name}" [${place.category.name}]`);
    console.log(`  Calling TripAdvisor details API for location ID: ${locationId} (${contentType})...`);
    
    apiCallsCount++;
    try {
      const webUrl = await fetchTripAdvisorDetails(locationId, contentType);
      if (webUrl) {
        console.log(`  -> Found web_url: ${webUrl}`);
        await prisma.place.update({
          where: { id: place.id },
          data: { tripadvisorUrl: webUrl }
        });
        console.log(`  -> Updated in database successfully!`);
        updatedCount++;
      } else {
        console.log(`  -> No web_url returned by TripAdvisor details API.`);
      }
    } catch (err) {
      console.error(`  -> Failed to fetch details:`, err.message);
    }

    await sleep(API_DELAY_MS);
  }

  console.log(`\n==================================================`);
  console.log(`TRIPADVISOR URL INGESTION COMPLETED!`);
  console.log(`- Total URLs updated in database: ${updatedCount}`);
  console.log(`- TripAdvisor API calls made: ${apiCallsCount}`);
  console.log(`==================================================`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
