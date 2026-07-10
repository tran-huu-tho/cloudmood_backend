import 'dotenv/config';
import { prisma } from './prisma-client.mjs';
import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary
const {
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET,
  RAPIDAPI_KEY
} = process.env;

if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
  console.error('Error: Cloudinary credentials missing in .env');
  process.exit(1);
}

if (!RAPIDAPI_KEY) {
  console.error('Error: RAPIDAPI_KEY is missing in .env');
  process.exit(1);
}

cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET
});

const GOOGLE_HOST = 'google-map-places-new-v2.p.rapidapi.com';
const API_DELAY_MS = 1200; // Delay between Google API calls to avoid rate limiting
const MAX_PHOTOS_PER_PLACE = 2; // Up to 2 real photos to stay within API/Cloudinary limits safely

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Upload buffer to Cloudinary
function uploadImageBuffer(buffer) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: 'cloudmood_places_real' },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    uploadStream.end(buffer);
  });
}

// Search place on Google Maps
async function searchGooglePlace(query) {
  const url = `https://${GOOGLE_HOST}/v1/places:searchText`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.photos',
      'x-rapidapi-key': RAPIDAPI_KEY,
      'x-rapidapi-host': GOOGLE_HOST
    },
    body: JSON.stringify({
      textQuery: query,
      languageCode: 'vi'
    })
  });

  if (!res.ok) {
    throw new Error(`Google Search HTTP error ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  return data.places || [];
}

// Download image buffer from Google Place Photo
async function downloadGooglePhoto(photoName) {
  const url = new URL(`https://${GOOGLE_HOST}/v1/${photoName}/media`);
  url.searchParams.set('maxHeightPx', '800');
  url.searchParams.set('maxWidthPx', '800');
  url.searchParams.set('skipHttpRedirect', 'false');

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'x-rapidapi-key': RAPIDAPI_KEY,
      'x-rapidapi-host': GOOGLE_HOST
    }
  });

  if (!res.ok) {
    throw new Error(`Google Photo HTTP error ${res.status}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function main() {
  console.log('Fetching all places from the database...');
  const places = await prisma.place.findMany({});
  console.log(`Loaded ${places.length} places to process.`);

  let updatedPlacesCount = 0;
  let totalPhotosUploaded = 0;

  for (const place of places) {
    console.log(`\n--------------------------------------------------`);
    console.log(`Processing Place ID ${place.id}: "${place.name}"`);
    console.log(`Address: "${place.address}"`);

    // Clean up existing photos first, set image to empty to guarantee 100% real data
    await prisma.placePhoto.deleteMany({
      where: { placeId: place.id }
    });
    await prisma.place.update({
      where: { id: place.id },
      data: { image: "" }
    });

    let googlePlaces = [];
    
    // 1. Try search with name and full address
    let query = `${place.name}, ${place.address}`;
    try {
      console.log(`  Searching Google Maps for: "${query}"...`);
      googlePlaces = await searchGooglePlace(query);
      await sleep(API_DELAY_MS);
    } catch (err) {
      console.warn(`  Search failed: ${err.message}`);
    }

    // 2. Fallback search with name only if first query returned no results
    if (googlePlaces.length === 0) {
      query = place.name;
      try {
        console.log(`  Fallback searching Google Maps for: "${query}"...`);
        googlePlaces = await searchGooglePlace(query);
        await sleep(API_DELAY_MS);
      } catch (err) {
        console.warn(`  Fallback search failed: ${err.message}`);
      }
    }

    if (googlePlaces.length === 0) {
      console.log(`  x Place not found on Google Maps. Left blank.`);
      continue;
    }

    const gPlace = googlePlaces[0];
    console.log(`  Found matching place: "${gPlace.displayName?.text}" at "${gPlace.formattedAddress}"`);
    
    const photos = gPlace.photos || [];
    if (photos.length === 0) {
      console.log(`  No photos found for this place on Google Maps. Left blank.`);
      continue;
    }

    console.log(`  Found ${photos.length} real photos on Google Maps. Processing up to ${MAX_PHOTOS_PER_PLACE}...`);

    // Download, upload and save photos
    const uploadedUrls = [];
    const limit = Math.min(photos.length, MAX_PHOTOS_PER_PLACE);

    for (let i = 0; i < limit; i++) {
      const photoName = photos[i].name;
      console.log(`  - Processing photo ${i + 1}/${limit}: ${photoName}`);
      try {
        const buffer = await downloadGooglePhoto(photoName);
        console.log(`    Downloaded photo successfully. Uploading to Cloudinary...`);
        const uploadResult = await uploadImageBuffer(buffer);
        uploadedUrls.push(uploadResult.secure_url);
        console.log(`    Uploaded to Cloudinary: ${uploadResult.secure_url}`);
        await sleep(API_DELAY_MS);
      } catch (err) {
        console.error(`    Failed to process photo ${i + 1}: ${err.message}`);
      }
    }

    if (uploadedUrls.length > 0) {
      // 1. Insert new real photos into PlacePhoto
      for (let i = 0; i < uploadedUrls.length; i++) {
        const url = uploadedUrls[i];
        await prisma.placePhoto.create({
          data: {
            placeId: place.id,
            urlOriginal: url,
            urlThumbnail: url,
            caption: `Hình ảnh thực tế tại ${place.name}`,
            source: 'GOOGLE'
          }
        });
        totalPhotosUploaded++;
      }

      // 3. Update the main image of the Place
      const mainImageUrl = uploadedUrls[0];
      await prisma.place.update({
        where: { id: place.id },
        data: { image: mainImageUrl }
      });

      console.log(`  + Successfully updated place image and saved ${uploadedUrls.length} real photos.`);
      updatedPlacesCount++;
    } else {
      console.log(`  x No photos were successfully downloaded and uploaded.`);
    }
  }

  console.log(`\n==================================================`);
  console.log(`REAL PHOTOS POPULATION COMPLETED!`);
  console.log(`- Total places successfully updated with real photos: ${updatedPlacesCount}`);
  console.log(`- Total photos uploaded and saved: ${totalPhotosUploaded}`);
  console.log(`==================================================`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
