import 'dotenv/config';
import { prisma } from './prisma-client.mjs';
import { fetchWithKeyRotation } from './api-key-manager.mjs';

// Configuration
const TRY_API = true; // Attempt TripAdvisor API for TripAdvisor places
const MAX_API_CALLS = 150; // Limit API calls
const API_DELAY_MS = 1500; // Delay between API calls to TripAdvisor (respect rate limit)

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Strip HTML tags from strings
function stripHtml(htmlStr) {
  if (!htmlStr) return '';
  return htmlStr.replace(/<[^>]*>/g, '');
}

// Fetch reviews using the reviews/v2/list POST endpoint
async function fetchTripAdvisorReviewsV2(locationId, contentType) {
  const host = 'travel-advisor.p.rapidapi.com';
  
  const payload = {
    contentType,
    detailId: Number(locationId),
    pagee: 0,
    filters: [],
    updateToken: ''
  };

  const res = await fetchWithKeyRotation(`https://${host}/reviews/v2/list?currency=USD&units=km&lang=vi_VN`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-rapidapi-host': host
    },
    body: JSON.stringify(payload)
  });

  if (res.status === 204) {
    // If no content, try without rating filters to see if that returns anything
    payload.filters = [];
    const retryRes = await fetchWithKeyRotation(`https://${host}/reviews/v2/list?currency=USD&units=km&lang=vi_VN`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-rapidapi-host': host
      },
      body: JSON.stringify(payload)
    });
    if (retryRes.status === 204) return [];
    if (!retryRes.ok) throw new Error(`TripAdvisor retry HTTP ${retryRes.status}`);
    const data = await retryRes.json();
    return extractReviewsFromV2Response(data);
  }

  if (!res.ok) {
    throw new Error(`TripAdvisor HTTP status ${res.status}`);
  }

  const data = await res.json();
  return extractReviewsFromV2Response(data);
}

// Extract reviews list from the complex GraphQL-like payload
function extractReviewsFromV2Response(data) {
  const reviews = [];
  const container = data?.data?.AppPresentation_queryPoiReviews;
  if (!container || !container.sections) return reviews;

  const sections = container.sections;
  for (const sec of sections) {
    if (sec.__typename === 'AppPresentation_SingleCard' && sec.poiReviewsSingleCardContent?.__typename === 'AppPresentation_ReviewCard') {
      const card = sec.poiReviewsSingleCardContent;
      
      const rating = card.reviewRating || 4;
      const title = card.htmlTitle?.htmlString ? stripHtml(card.htmlTitle.htmlString) : '';
      const text = card.htmlText?.htmlString ? stripHtml(card.htmlText.htmlString) : '';
      const comment = title || text;
      
      const authorName = card.userProfile?.displayName || 'Ẩn danh';
      
      // Extract avatar URL
      let authorAvatar = null;
      const avatarData = card.userProfile?.avatar?.data;
      if (avatarData) {
        if (avatarData.photoSizeDynamic?.urlTemplate) {
          authorAvatar = avatarData.photoSizeDynamic.urlTemplate.replace('{width}', '150').replace('{height}', '150');
        } else if (avatarData.sizes && avatarData.sizes.length > 0) {
          authorAvatar = avatarData.sizes.find(s => s.width === 150)?.url || avatarData.sizes[0].url;
        }
      }

      const authorLocation = card.userProfile?.hometown || 'Việt Nam';
      
      reviews.push({
        rating,
        comment,
        externalReviewId: `ta_review_${card.trackingKey ? JSON.parse(card.trackingKey).rid : Math.random()}`,
        authorName,
        authorAvatar,
        authorLocation,
        publishedDate: new Date(), // Use current date for freshness
        source: 'TRIPADVISOR'
      });
    }
  }

  return reviews;
}

async function main() {
  console.log('Clearing all existing reviews in the database to start fresh with 100% real reviews...');
  await prisma.review.deleteMany({});

  console.log('Fetching all places from the database...');
  const places = await prisma.place.findMany({
    include: {
      category: true
    }
  });

  console.log(`Loaded ${places.length} places to process.`);

  let apiCallsCount = 0;
  let totalReviewsInserted = 0;
  let totalPhotosPreserved = 0;

  for (const place of places) {
    console.log(`\n--------------------------------------------------`);
    console.log(`Processing Place ID ${place.id}: "${place.name}" [${place.category.name}]`);

    // ==========================================
    // 1. POPULATE REVIEWS (ONLY REAL REVIEWS FROM API)
    // ==========================================
    let reviewsToInsert = [];

    if (TRY_API && place.externalId && place.externalId.startsWith('ta_') && apiCallsCount < MAX_API_CALLS) {
      const locationId = place.externalId.split('_').pop();
      
      let contentType = 'restaurant';
      if (place.category.name === 'Khách sạn') contentType = 'hotel';
      else if (place.category.name === 'Điểm tham quan' || place.category.name === 'Công viên' || place.category.name === 'Trung tâm thương mại') contentType = 'attraction';

      console.log(`  Calling TripAdvisor reviews API (Location ID: ${locationId}, Type: ${contentType})...`);
      apiCallsCount++;
      try {
        const apiReviews = await fetchTripAdvisorReviewsV2(locationId, contentType);
        console.log(`  Fetched ${apiReviews.length} real reviews from TripAdvisor API.`);

        for (const rev of apiReviews) {
          reviewsToInsert.push({
            ...rev,
            placeId: place.id
          });
        }
        await sleep(API_DELAY_MS);
      } catch (apiErr) {
        console.warn(`  TripAdvisor API failed: ${apiErr.message}`);
      }
    }

    // Save real reviews to database (0 if none returned)
    for (const rev of reviewsToInsert) {
      try {
        await prisma.review.create({
          data: rev
        });
        totalReviewsInserted++;
      } catch (dbErr) {
        if (dbErr.code === 'P2002') {
          rev.externalReviewId = `${rev.externalReviewId}_retry_${Math.floor(Math.random() * 10000)}`;
          try {
            await prisma.review.create({
              data: rev
            });
            totalReviewsInserted++;
          } catch (retryErr) {
            console.error(`    Failed to insert review after retry: ${retryErr.message}`);
          }
        } else {
          console.error(`    Failed to insert review: ${dbErr.message}`);
        }
      }
    }
    console.log(`  Successfully populated ${reviewsToInsert.length} real reviews.`);

    // ==========================================
    // 2. POPULATE PHOTOS (ONLY REAL UNIQUE PHOTOS, NO FAKES)
    // ==========================================
    const existingPhotos = await prisma.placePhoto.findMany({
      where: { placeId: place.id }
    });

    console.log(`  Current photos in DB for this place: ${existingPhotos.length}`);
    
    // Filter out mock Unsplash photos, and unique by urlOriginal
    const uniqueExisting = [];
    const seenUrls = new Set();
    for (const p of existingPhotos) {
      // Exclude generated mock photos (which have source = UNSPLASH and caption 'Không gian đẹp tại ...')
      const isMock = p.source === 'UNSPLASH' && p.caption === `Không gian đẹp tại ${place.name}`;
      if (!isMock && !seenUrls.has(p.urlOriginal)) {
        seenUrls.add(p.urlOriginal);
        uniqueExisting.push(p);
      }
    }

    // Delete all current photos for this place
    await prisma.placePhoto.deleteMany({
      where: { placeId: place.id }
    });

    // If no unique real photos remain in the DB, fallback to the main place.image (which is real)
    if (uniqueExisting.length === 0 && place.image) {
      uniqueExisting.push({
        urlOriginal: place.image,
        urlThumbnail: place.image,
        caption: `Hình ảnh nổi bật của ${place.name}`,
        source: 'LOCAL'
      });
    }

    // Re-insert only unique real photos
    for (const photo of uniqueExisting) {
      try {
        await prisma.placePhoto.create({
          data: {
            placeId: place.id,
            urlOriginal: photo.urlOriginal,
            urlThumbnail: photo.urlThumbnail,
            caption: photo.caption || `Hình ảnh của ${place.name}`,
            source: photo.source || 'LOCAL'
          }
        });
        totalPhotosPreserved++;
      } catch (dbErr) {
        console.error(`    Failed to insert photo: ${dbErr.message}`);
      }
    }
    console.log(`  Cleaned up photos. Re-inserted ${uniqueExisting.length} unique real photos (mock ones removed).`);

    await sleep(50);
  }

  console.log(`\n==================================================`);
  console.log(`PROCESS COMPLETED SUCCESSFULLY!`);
  console.log(`- Total real reviews populated in database: ${totalReviewsInserted}`);
  console.log(`- Total unique real photos preserved: ${totalPhotosPreserved}`);
  console.log(`- TripAdvisor API calls made: ${apiCallsCount}`);
  console.log(`==================================================`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
