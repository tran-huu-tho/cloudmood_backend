import 'dotenv/config';
import { prisma } from './prisma-client.mjs';

// Verify Env Variables
const { GEOAPIFY_API_KEY, UNSPLASH_ACCESS_KEY } = process.env;

if (!GEOAPIFY_API_KEY) {
  console.error('Error: GEOAPIFY_API_KEY is missing in .env');
  process.exit(1);
}

if (!UNSPLASH_ACCESS_KEY) {
  console.error('Error: UNSPLASH_ACCESS_KEY is missing in .env');
  process.exit(1);
}

// Category Mapping (DB Category -> Geoapify categories query)
const CATEGORY_MAPPING = [
  { dbName: 'Nhà hàng', geoQuery: 'catering.restaurant', searchKeyword: 'vietnam restaurant food' },
  { dbName: 'Khách sạn', geoQuery: 'accommodation.hotel', searchKeyword: 'vietnam hotel resort room' },
  { dbName: 'Quán ăn', geoQuery: 'catering.fast_food,catering.restaurant.vietnamese', searchKeyword: 'vietnamese street food dish' },
  { dbName: 'Cà phê', geoQuery: 'catering.cafe', searchKeyword: 'vietnam cafe coffee shop' },
  { dbName: 'Trung tâm thương mại', geoQuery: 'commercial.shopping_mall', searchKeyword: 'shopping mall modern' },
  { dbName: 'Công viên', geoQuery: 'leisure.park', searchKeyword: 'vietnam park green garden' },
  { dbName: 'Điểm tham quan', geoQuery: 'tourism.attraction,tourism.sights', searchKeyword: 'vietnam travel landmark attraction' }
];

// Cities list from South to North
const CITIES = [
  { name: 'Cần Thơ', lat: 10.0371, lon: 105.7883 },
  { name: 'TP. Hồ Chí Minh', lat: 10.7769, lon: 106.7009 },
  { name: 'Vũng Tàu', lat: 10.3460, lon: 107.0843 },
  { name: 'An Giang', lat: 10.3736, lon: 105.4371 },
  { name: 'Phú Quốc', lat: 10.2186, lon: 103.9607 },
  { name: 'Đà Lạt', lat: 11.9404, lon: 108.4383 },
  { name: 'Nha Trang', lat: 12.2388, lon: 109.1967 },
  { name: 'Đà Nẵng', lat: 16.0544, lon: 108.2022 },
  { name: 'Huế', lat: 16.4637, lon: 107.5908 },
  { name: 'Hà Nội', lat: 21.0285, lon: 105.8542 },
  { name: 'Hải Phòng', lat: 20.8449, lon: 106.6881 },
  { name: 'Sa Pa', lat: 22.3364, lon: 103.8438 }
];

// Fallback Photos if Unsplash rate limit or API fails
const FALLBACK_PHOTOS = {
  'Nhà hàng': [
    'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800',
    'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800',
    'https://images.unsplash.com/photo-1544025162-d76694265947?w=800'
  ],
  'Khách sạn': [
    'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800',
    'https://images.unsplash.com/photo-1582719508461-905c673771fd?w=800',
    'https://images.unsplash.com/photo-1590490360182-c33d57733427?w=800'
  ],
  'Quán ăn': [
    'https://images.unsplash.com/photo-1596797038530-2c107229654b?w=800',
    'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=800',
    'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=800'
  ],
  'Cà phê': [
    'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800',
    'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=800',
    'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=800'
  ],
  'Trung tâm thương mại': [
    'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800',
    'https://images.unsplash.com/photo-1567401893930-7beb7b28dbb3?w=800',
    'https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=800'
  ],
  'Công viên': [
    'https://images.unsplash.com/photo-1519331379826-f10be5486c6f?w=800',
    'https://images.unsplash.com/photo-1448375240586-882707db888b?w=800',
    'https://images.unsplash.com/photo-1502082553048-f009c37129b9?w=800'
  ],
  'Điểm tham quan': [
    'https://images.unsplash.com/photo-1528127269322-539801943592?w=800',
    'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=800',
    'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800'
  ]
};

// Sleep helper
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Fetch photos from Unsplash
async function fetchUnsplashPhotos(keyword) {
  try {
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(keyword)}&client_id=${UNSPLASH_ACCESS_KEY}&per_page=30`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Unsplash status ${res.status}`);
    }
    const data = await res.json();
    if (data.results && data.results.length > 0) {
      return data.results.map((img) => ({
        urlOriginal: img.urls.regular,
        urlThumbnail: img.urls.small || img.urls.thumb,
        caption: img.alt_description || img.description || 'Góc chụp đẹp',
        source: 'UNSPLASH'
      }));
    }
  } catch (err) {
    console.warn(`[Unsplash] Failed to fetch for "${keyword}", using fallback photos. Error:`, err.message);
  }
  return null;
}

// Parse Open/Close Hours
function parseOpeningHours(openingHoursStr) {
  let openH = 8, openM = 0;
  let closeH = 22, closeM = 0;

  if (openingHoursStr) {
    const match = openingHoursStr.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
    if (match) {
      openH = parseInt(match[1], 10);
      openM = parseInt(match[2], 10);
      closeH = parseInt(match[3], 10);
      closeM = parseInt(match[4], 10);
    }
  }

  const openTime = new Date(Date.UTC(1970, 0, 1, openH, openM, 0));
  const closeTime = new Date(Date.UTC(1970, 0, 1, closeH === 0 ? 23 : closeH, closeH === 0 ? 59 : closeM, 0));
  return { openTime, closeTime };
}

// Validate if Place Name or Address is generic/junk
function isJunkPlace(name, address) {
  const cleanName = name.toLowerCase().trim();
  const cleanAddress = address.toLowerCase().trim();

  // Junk lists
  const genericKeywords = [
    'restaurant', 'restaurant vietnamese', 'nhà hàng', 'quán ăn', 'cà phê', 'cafe', 
    'hotel', 'khách sạn', 'fast food', 'fast_food', 'mall', 'shopping mall', 'park',
    'công viên', 'tourism', 'attraction', 'sights', 'cinema', 'atm', 'toilet', 'wc',
    'chưa đặt tên', 'unnamed', 'unknown'
  ];

  // If name matches exactly generic keywords
  if (genericKeywords.includes(cleanName) || cleanName.length < 3) {
    return true;
  }

  // Address must be somewhat descriptive
  if (cleanAddress.length < 5 || cleanAddress.includes('unnamed road') || cleanAddress.includes('đường không tên')) {
    return true;
  }

  // Must contain at least one alphabet character
  if (!/[a-zA-ZÀ-ỹ]/.test(name)) {
    return true;
  }

  return false;
}

async function main() {
  console.log('Fetching Categories from Database...');
  const dbCategories = await prisma.category.findMany({});
  const categoryMap = new Map(dbCategories.map((c) => [c.name, c.id]));

  if (dbCategories.length === 0) {
    console.error('No categories found. Run seed categories first.');
    process.exit(1);
  }

  // Pre-fetch Unsplash photos for each category (7 calls total to be safe with rate limit)
  console.log('Fetching image assets from Unsplash...');
  const categoryPhotos = {};
  for (const cat of CATEGORY_MAPPING) {
    console.log(`- Fetching photos for "${cat.dbName}" (keyword: "${cat.searchKeyword}")...`);
    const photos = await fetchUnsplashPhotos(cat.searchKeyword);
    if (photos && photos.length > 0) {
      categoryPhotos[cat.dbName] = photos;
      console.log(`  Fetched ${photos.length} photos.`);
    } else {
      categoryPhotos[cat.dbName] = FALLBACK_PHOTOS[cat.dbName].map((url) => ({
        urlOriginal: url,
        urlThumbnail: url,
        caption: `Không gian đẹp`,
        source: 'LOCAL'
      }));
      console.log(`  Using ${categoryPhotos[cat.dbName].length} fallback photos.`);
    }
    await sleep(1500); // respects API rate-limiting
  }

  console.log('\nStarting Geoapify Places Import...');
  let totalImported = 0;

  for (const city of CITIES) {
    console.log(`\n==================================================`);
    console.log(`Processing City: ${city.name}`);
    console.log(`==================================================`);

    for (const cat of CATEGORY_MAPPING) {
      const categoryId = categoryMap.get(cat.dbName);
      if (!categoryId) {
        console.warn(`Category "${cat.dbName}" not found in DB. Skipping...`);
        continue;
      }

      console.log(`\nCategory: [${cat.dbName}]`);
      const url = `https://api.geoapify.com/v2/places?categories=${cat.geoQuery}&filter=circle:${city.lon},${city.lat},10000&limit=15&apiKey=${GEOAPIFY_API_KEY}`;
      
      let data;
      try {
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`Geoapify status ${res.status}`);
        }
        data = await res.json();
      } catch (err) {
        console.error(`  Failed to fetch from Geoapify for ${city.name} - ${cat.dbName}:`, err.message);
        continue;
      }

      const features = data.features || [];
      console.log(`  Found ${features.length} raw points.`);

      let groupImported = 0;
      let placeIndex = 0;

      for (const feature of features) {
        // Limit to 2 valid places per category per city to keep DB size neat
        if (groupImported >= 2) break;

        const props = feature.properties;
        if (!props) continue;

        const name = props.name || props.datasource?.raw?.name;
        const address = props.formatted || props.address_line2 || '';

        // Filter out junk
        if (!name || isJunkPlace(name, address)) {
          continue;
        }

        // Must be in Vietnam
        if (props.country_code !== 'vn' && !address.toLowerCase().includes('vietnam')) {
          continue;
        }

        const externalId = props.place_id ? String(props.place_id).slice(0, 100) : null;

        // Check if duplicate place in DB
        const duplicate = await prisma.place.findUnique({
          where: { externalId }
        });
        if (duplicate) {
          console.log(`  - Place already exists: ${name}`);
          groupImported++;
          continue;
        }

        placeIndex++;
        const lat = feature.geometry?.coordinates[1] || props.lat;
        const lon = feature.geometry?.coordinates[0] || props.lon;
        let phone = props.contact?.phone || props.datasource?.raw?.phone || null;
        if (phone) phone = String(phone);
        const website = props.website || props.datasource?.raw?.website || null;
        const { openTime, closeTime } = parseOpeningHours(props.opening_hours || props.datasource?.raw?.opening_hours);

        // Price Level
        let priceLevel = 'MODERATE';
        if (props.datasource?.raw?.price_level) {
          const rawLvl = String(props.datasource.raw.price_level);
          priceLevel = rawLvl.length <= 10 ? rawLvl : rawLvl.slice(0, 10);
        }

        // Amenities
        const amenities = props.categories ? props.categories.slice(0, 5) : [];

        // Distribute photos uniquely from our list
        const listPhotos = categoryPhotos[cat.dbName];
        const selectedPhotos = [];
        const mainImage = listPhotos[placeIndex % listPhotos.length].urlOriginal;

        for (let i = 0; i < 3; i++) {
          const p = listPhotos[(placeIndex + i) % listPhotos.length];
          selectedPhotos.push({
            urlOriginal: p.urlOriginal.slice(0, 500),
            urlThumbnail: p.urlThumbnail ? p.urlThumbnail.slice(0, 500) : null,
            caption: (p.caption || `Ảnh đẹp về ${name}`).slice(0, 255),
            source: p.source
          });
        }

        try {
          await prisma.place.create({
            data: {
              name: name.slice(0, 255),
              description: `${cat.dbName} thật tại ${city.name}.`,
              latitude: lat,
              longitude: lon,
              address: address.slice(0, 255),
              price: 'Đang cập nhật',
              openTime,
              closeTime,
              categoryId,
              image: mainImage,
              rating: props.stars ? parseFloat(props.stars) : (4.0 + Math.random() * 1.0),
              userRatingCount: Math.floor(10 + Math.random() * 500),
              externalId,
              phone: phone ? phone.slice(0, 50) : null,
              website: website ? website.slice(0, 255) : null,
              priceLevel,
              subCategories: amenities,
              lastSyncedAt: new Date(),
              PlacePhoto: {
                create: selectedPhotos
              }
            }
          });
          console.log(`  + Imported: ${name} (${address})`);
          groupImported++;
          totalImported++;
        } catch (dbErr) {
          console.error(`  - Failed to write ${name} to DB:`, dbErr.message);
        }
      }

      await sleep(1000); // respect Geoapify rate limits
    }
  }

  console.log(`\nImport completed! Successfully imported ${totalImported} real places across Vietnam.`);
}

main()
  .catch((err) => {
    console.error('Fatal import error:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
