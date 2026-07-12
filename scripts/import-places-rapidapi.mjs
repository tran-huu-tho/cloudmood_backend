import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from './prisma-client.mjs';
import { v2 as cloudinary } from 'cloudinary';
import { fetchWithKeyRotation } from './api-key-manager.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, 'import-places-rapidapi-state.json');

// Verify Env Vars
const {
  RAPIDAPI_HOST,
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET
} = process.env;

if (!RAPIDAPI_HOST) {
  console.error('Error: RAPIDAPI_HOST is missing in .env');
  process.exit(1);
}

if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
  console.error('Error: Cloudinary credentials are missing in .env');
  process.exit(1);
}

// Configure Cloudinary
cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET
});

// Configure constants
const LOCATIONS = ['Cần Thơ'];

// Set a very high default limit so we fetch all available places from Google
const LIMIT_PLACES_PER_GROUP = Number(process.env.LIMIT_PLACES_PER_GROUP ?? 60);
const SLEEP_MS = 1000; // Sleep between calls to respect rate limit

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function timeOnly(hh, mm) {
  return new Date(Date.UTC(1970, 0, 1, hh, mm, 0));
}

// Helpers to load and save state
function loadState() {
  if (fs.existsSync(STATE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    } catch {
      // Ignore parse error
    }
  }
  return { completedGroups: [], processedPlaceIds: [] };
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

// Helper to upload image buffer to Cloudinary
function uploadImageBuffer(buffer) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: 'cloudmood_places' },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    uploadStream.end(buffer);
  });
}

// Call RapidAPI Place TextSearch (New) with Pagination support
async function searchPlaces(query) {
  let allPlaces = [];
  let nextPageToken = null;
  let pageCount = 0;

  console.log(`  Searching Google Places for query: "${query}"...`);

  do {
    const url = new URL('https://google-map-places-new-v2.p.rapidapi.com/v1/places:searchText');
    const body = {
      textQuery: query,
      languageCode: 'vi'
    };
    if (nextPageToken) {
      body.pageToken = nextPageToken;
    }

    console.log(`    Fetching page ${pageCount + 1}...`);
    const res = await fetchWithKeyRotation(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.photos,nextPageToken',
        'x-rapidapi-host': RAPIDAPI_HOST
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      throw new Error(`RapidAPI TextSearch error ${res.status}: ${await res.text()}`);
    }

    const data = await res.json();
    const places = data.places ?? [];
    allPlaces.push(...places);

    console.log(`    Received ${places.length} places on this page. Cumulative: ${allPlaces.length}`);

    nextPageToken = data.nextPageToken;
    pageCount++;

    if (nextPageToken && pageCount < 3) {
      // Sleep a bit before fetching next page (Google takes ~2s to activate next page token)
      await sleep(2500);
    }
  } while (nextPageToken && pageCount < 3); // Max 3 pages supported by Google (60 results)

  return allPlaces;
}

// Call RapidAPI Place Details (New)
async function getPlaceDetails(placeId) {
  const url = new URL(`https://google-map-places-new-v2.p.rapidapi.com/v1/places/${placeId}`);

  const res = await fetchWithKeyRotation(url, {
    method: 'GET',
    headers: {
      'X-Goog-FieldMask': 'reviews,regularOpeningHours,nationalPhoneNumber,websiteUri,priceLevel',
      'x-rapidapi-host': RAPIDAPI_HOST
    }
  });

  if (!res.ok) {
    throw new Error(`RapidAPI PlaceDetails error ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  return data ?? {};
}

// Call RapidAPI Place Photo (New)
async function getPlacePhotoBuffer(photoName) {
  const url = new URL(`https://google-map-places-new-v2.p.rapidapi.com/v1/${photoName}/media`);
  url.searchParams.set('maxHeightPx', '800');
  url.searchParams.set('maxWidthPx', '800');
  url.searchParams.set('skipHttpRedirect', 'false');

  const res = await fetchWithKeyRotation(url, {
    method: 'GET',
    headers: {
      'x-rapidapi-host': RAPIDAPI_HOST
    }
  });

  if (!res.ok) {
    throw new Error(`RapidAPI PlacePhoto error ${res.status}: ${await res.text()}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// Main execution block
async function main() {
  console.log('Fetching categories and users from DB...');
  const categories = await prisma.category.findMany({});
  const users = await prisma.user.findMany({});
  
  if (categories.length === 0) {
    console.error('No categories found. Run seed script first.');
    process.exit(1);
  }
  if (users.length === 0) {
    console.error('No users found. Please seed users first.');
    process.exit(1);
  }

  const state = loadState();
  const completedGroups = new Set(state.completedGroups);
  const processedPlaceIds = new Set(state.processedPlaceIds);

  console.log(`State loaded: ${completedGroups.size} groups done, ${processedPlaceIds.size} places imported.`);

  for (const location of LOCATIONS) {
    for (const category of categories) {
      const groupKey = `${location}:${category.name}`;
      if (completedGroups.has(groupKey)) {
        console.log(`Skipping completed group: ${groupKey}`);
        continue;
      }

      console.log(`\n========================================`);
      console.log(`Processing group: ${groupKey}`);
      console.log(`========================================`);

      const query = `${category.name} nổi tiếng tại ${location}`;
      let results = [];
      try {
        results = await searchPlaces(query);
        await sleep(SLEEP_MS);
      } catch (err) {
        if (err.message === 'QUOTA_EXCEEDED') {
          console.warn('API Limit reached on textSearch. Aborting...');
          return;
        }
        console.error(`Error searching places for ${groupKey}:`, err.message);
        continue;
      }

      // Filter: must have rating and at least 5 reviews to ensure quality, and sort by rating desc
      const qualityPlaces = results
        .filter((r) => r.rating && r.userRatingCount && r.rating >= 4.0 && r.userRatingCount >= 5)
        .sort((a, b) => b.rating - a.rating);

      console.log(`Found ${results.length} total, ${qualityPlaces.length} passed quality filters.`);

      // Take the top places up to the limit
      const placesToImport = qualityPlaces.slice(0, LIMIT_PLACES_PER_GROUP);
      let countImported = 0;

      for (const place of placesToImport) {
        const placeName = place.displayName?.text || 'Không tên';
        
        // Check if place already exists in DB by externalId or state
        const existingInDb = await prisma.place.findUnique({
          where: { externalId: place.id }
        });
        if (existingInDb || processedPlaceIds.has(place.id)) {
          console.log(`- Place already processed or exists in DB: ${placeName}`);
          processedPlaceIds.add(place.id);
          continue;
        }

        console.log(`- Importing: ${placeName} (Rating: ${place.rating}, Ratings count: ${place.userRatingCount})`);

        let detail = {};
        try {
          detail = await getPlaceDetails(place.id);
          await sleep(SLEEP_MS);
        } catch (err) {
          if (err.message === 'QUOTA_EXCEEDED') {
            console.warn('API Limit reached on details. Aborting...');
            return;
          }
          console.error(`  Failed to fetch details for ${placeName}:`, err.message);
        }

        // Upload photos to Cloudinary if available (up to 3 photos)
        let imageUrl = '';
        const uploadedPhotos = [];
        if (place.photos && place.photos.length > 0) {
          const maxPhotos = Math.min(place.photos.length, 3);
          for (let i = 0; i < maxPhotos; i++) {
            try {
              console.log(`  Downloading and uploading photo ${i + 1}/${maxPhotos} to Cloudinary...`);
              const photoBuffer = await getPlacePhotoBuffer(place.photos[i].name);
              const uploadResult = await uploadImageBuffer(photoBuffer);
              const secureUrl = uploadResult.secure_url;
              uploadedPhotos.push({
                urlOriginal: secureUrl,
                urlThumbnail: secureUrl,
                caption: place.photos[i].authorAttributions?.[0]?.displayName || null,
                source: 'GOOGLE'
              });
              if (i === 0) {
                imageUrl = secureUrl;
              }
              console.log(`  Uploaded photo ${i + 1} to Cloudinary: ${secureUrl}`);
              await sleep(SLEEP_MS);
            } catch (err) {
              if (err.message === 'QUOTA_EXCEEDED') {
                console.warn('API Limit reached on photo. Aborting...');
                return;
              }
              console.error(`  Failed to process photo ${i + 1}:`, err.message);
            }
          }
        }

        // Parse open/close hours from detail, or fallback to default
        let openingHours = { open: "08:00", close: "22:00" };
        if (detail.regularOpeningHours && detail.regularOpeningHours.periods && detail.regularOpeningHours.periods.length > 0) {
          const firstPeriod = detail.regularOpeningHours.periods[0];
          if (firstPeriod.open && firstPeriod.close) {
            const oh = String(firstPeriod.open.hour ?? 8).padStart(2, '0');
            const om = String(firstPeriod.open.minute ?? 0).padStart(2, '0');
            const ch = String(firstPeriod.close.hour ?? 22).padStart(2, '0');
            const cm = String(firstPeriod.close.minute ?? 0).padStart(2, '0');
            openingHours = { open: `${oh}:${om}`, close: `${ch}:${cm}` };
          }
        }

        try {
          // Create the Place row with new schema fields
          const createdPlace = await prisma.place.create({
            data: {
              name: placeName.slice(0, 255),
              description: `${category.name} chất lượng cao tại ${location}.`,
              latitude: place.location.latitude,
              longitude: place.location.longitude,
              address: (place.formattedAddress || '').slice(0, 255),
              price: 'Đang cập nhật',
              openingHours,
              categoryId: category.id,
              image: imageUrl,
              rating: place.rating,
              userRatingCount: place.userRatingCount,
              externalId: place.id,
              phone: detail.nationalPhoneNumber || null,
              website: detail.websiteUri || null,
              priceLevel: detail.priceLevel || null,
              subCategories: [],
              lastSyncedAt: new Date(),
              photos: {
                create: uploadedPhotos
              }
            }
          });

          // Insert reviews if available with new fields
          if (detail.reviews && detail.reviews.length > 0) {
            for (let i = 0; i < detail.reviews.length; i++) {
              const rev = detail.reviews[i];
              const commentText = rev.text?.text || rev.originalText?.text || '';
              await prisma.review.create({
                data: {
                  rating: rev.rating,
                  comment: commentText,
                  placeId: createdPlace.id,
                  externalReviewId: rev.name || null,
                  authorName: rev.authorAttribution?.displayName || 'Ẩn danh',
                  authorAvatar: rev.authorAttribution?.photoUri || null,
                  publishedDate: rev.publishTime ? new Date(rev.publishTime) : null,
                  source: 'GOOGLE',
                  userId: null
                }
              });
            }
            console.log(`  Seeded ${detail.reviews.length} reviews successfully.`);
          }

          processedPlaceIds.add(place.id);
          countImported++;
        } catch (dbErr) {
          console.error(`  Failed to save place ${placeName} to DB:`, dbErr.message);
        }
      }

      // Mark group completed
      completedGroups.add(groupKey);
      saveState({
        completedGroups: [...completedGroups],
        processedPlaceIds: [...processedPlaceIds]
      });

      console.log(`Group ${groupKey} completed. Imported ${countImported} places.`);
    }
  }

  console.log('Pipeline run finished successfully!');
}

main()
  .catch((err) => {
    console.error('Fatal Pipeline error:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
