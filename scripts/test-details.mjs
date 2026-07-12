import 'dotenv/config';
import { fetchWithKeyRotation } from './api-key-manager.mjs';
import { prisma } from './prisma-client.mjs';

async function testDetails() {
  const host = 'travel-advisor.p.rapidapi.com';
  
  // Find Victoria Resort
  const place = await prisma.place.findFirst({
    where: {
      name: { contains: 'Victoria' }
    }
  });

  if (!place) {
    console.log('No TripAdvisor restaurant found in DB');
    return;
  }

  const locationId = place.externalId.split('_').pop();
  console.log(`Testing details for Place "${place.name}" (Location ID: ${locationId})`);

  const url = new URL(`https://${host}/restaurants/get-details`);
  url.searchParams.set('location_id', locationId);
  url.searchParams.set('lang', 'vi_VN');

  const res = await fetchWithKeyRotation(url, {
    method: 'GET',
    headers: {
      'x-rapidapi-host': host
    }
  });

  console.log('HTTP Status:', res.status);
  const data = await res.json();
  console.log('Response Keys:', Object.keys(data));
  console.log('Sample Data (rating, num_reviews):', {
    rating: data.rating,
    num_reviews: data.num_reviews,
    name: data.name
  });
}

testDetails()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
