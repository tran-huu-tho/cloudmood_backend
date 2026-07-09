import 'dotenv/config';
import { prisma } from './prisma-client.mjs';

// Verify Env Variables
const { RAPIDAPI_KEY } = process.env;
const host = 'travel-advisor.p.rapidapi.com';

if (!RAPIDAPI_KEY) {
  console.error('Error: RAPIDAPI_KEY is missing in .env');
  process.exit(1);
}

// Sleep helper
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Helper to check if a name or address is junk
function isJunkPlace(name, address) {
  const cleanName = name.toLowerCase().trim();
  const cleanAddress = address ? address.toLowerCase().trim() : '';

  const junkKeywords = [
    'unnamed', 'chưa đặt tên', 'toilet', 'wc', 'atm'
  ];

  for (const kw of junkKeywords) {
    if (cleanName.includes(kw) || cleanAddress.includes(kw)) {
      return true;
    }
  }

  if (!/[a-zA-ZÀ-ỹ]/.test(name)) {
    return true;
  }

  return false;
}

// Helper to format price to VNĐ
function formatPriceToVnd(rawPrice, categoryName) {
  if (!rawPrice || rawPrice.trim() === '') {
    switch (categoryName) {
      case 'Khách sạn':
        return '600.000 đ - 2.500.000 đ';
      case 'Nhà hàng':
        return '150.000 đ - 600.000 đ';
      case 'Quán ăn':
        return '35.000 đ - 120.000 đ';
      case 'Cà phê':
        return '25.000 đ - 65.000 đ';
      case 'Trung tâm thương mại':
        return 'Miễn phí vào cửa';
      case 'Công viên':
        return 'Miễn phí';
      case 'Điểm tham quan':
        return 'Miễn phí';
      default:
        return 'Đang cập nhật';
    }
  }

  const clean = rawPrice.toLowerCase();
  if (clean.includes('đ') || clean.includes('vnd') || clean.includes('đồng') || clean.includes('đông')) {
    return rawPrice;
  }

  const dollarNumbers = rawPrice.match(/\d+[\.,]?\d*/g);
  if (!dollarNumbers || dollarNumbers.length === 0) {
    return rawPrice;
  }

  const exchangeRate = 25400;
  const vndPrices = dollarNumbers.map(numStr => {
    const num = parseFloat(numStr.replace(',', ''));
    if (isNaN(num)) return null;
    const vndVal = num * exchangeRate;
    
    if (vndVal >= 1000000) {
      return `${(vndVal / 1000000).toFixed(1)} triệu`;
    } else {
      return `${Math.round(vndVal / 1000).toLocaleString('vi-VN')}k`;
    }
  }).filter(Boolean);

  if (vndPrices.length === 2) {
    return `${vndPrices[0]} - ${vndPrices[1]} đ`;
  } else if (vndPrices.length === 1) {
    return `${vndPrices[0]} đ`;
  }

  return rawPrice;
}

// Generate highly polished, real descriptions in Vietnamese
function generateDescription(name, categoryName) {
  const clean = name.toLowerCase();
  
  if (clean.includes('cái răng')) return 'Chợ nổi Cái Răng là nét văn hóa đặc trưng sông nước miền Tây, nơi giao thương nông sản, trái cây nhộn nhịp vào buổi sáng sớm trên sông Cần Thơ.';
  if (clean.includes('bình thủy')) return 'Ngôi nhà cổ hơn 100 năm tuổi mang kiến trúc Pháp cổ kính xen lẫn phong cách Á Đông, là bối cảnh của nhiều bộ phim điện ảnh nổi tiếng.';
  if (clean.includes('trúc lâm')) return 'Ngôi thiền viện lớn nhất miền Tây Nam Bộ với kiến trúc thời Lý - Trần độc đáo, mang lại cảm giác thanh tịnh và yên bình cho du khách.';
  if (clean.includes('ninh kiều')) {
    if (clean.includes('khách sạn')) return 'Khách sạn sở hữu tầm nhìn đắt giá hướng ra ngã ba sông Hậu và bến Ninh Kiều, đầy đủ tiện nghi hiện đại.';
    return 'Biểu tượng du lịch của Tây Đô, tọa lạc bên bờ sông Hậu hiền hòa, điểm ngắm cảnh và dạo mát lý tưởng về đêm.';
  }
  if (clean.includes('cầu cần thơ')) return 'Cầu dây văng có nhịp chính dài nhất Đông Nam Á tại thời điểm hoàn thành, nối liền hai bờ sông Hậu nối liền Cần Thơ và Vĩnh Long.';
  if (clean.includes('chùa ông')) return 'Ngôi chùa cổ kính độc đáo của người Hoa tại bến Ninh Kiều, nổi tiếng với kiến trúc chạm khắc tinh xảo và sự linh thiêng.';
  if (clean.includes('bảo tàng')) return 'Nơi lưu giữ và trưng bày hàng nghìn hiện vật lịch sử, văn hóa độc đáo của con người Cần Thơ qua các thời kỳ phát triển.';
  if (clean.includes('mười cương')) return 'Khu vườn ca cao organic đầu tiên tại Cần Thơ, nơi du khách được tìm hiểu quy trình chế biến sô-cô-la thủ công truyền thống.';
  if (clean.includes('ông đề')) return 'Khu du lịch sinh thái đậm chất Nam Bộ với các trò chơi dân gian sông nước sôi động và ẩm thực đồng quê phong phú.';
  if (clean.includes('sheraton')) return 'Khách sạn 5 sao cao nhất khu vực Đồng bằng sông Cửu Long, mang lại dịch vụ nghỉ dưỡng cao cấp quốc tế.';
  if (clean.includes('victoria')) return 'Khu nghỉ dưỡng mang đậm phong cách Pháp cổ điển ven sông Hậu, mang lại không gian yên bình và thư thái.';
  if (clean.includes('ttc')) return 'Khách sạn hiện đại nằm ngay bến Ninh Kiều, thuận tiện cho việc tham quan và trải nghiệm cuộc sống thành phố về đêm.';
  if (clean.includes('mường thanh')) return 'Khách sạn quy mô lớn tọa lạc tại cồn Cái Khế, dịch vụ lưu trú chuyên nghiệp tiêu chuẩn 5 sao.';
  if (clean.includes('cồn khương')) return 'Resort sinh thái ven sông thơ mộng với kiến trúc phòng hình đó hoa sen độc đáo và không gian xanh mát.';
  if (clean.includes('nesta')) return 'Khách sạn sát sông Hậu lộng gió, không gian yên tĩnh thích hợp cho chuyến đi thư giãn.';
  if (clean.includes('rustic')) return 'Mô hình nghỉ dưỡng homestay sinh thái miệt vườn đậm chất Tây Đô, gần gũi với thiên nhiên sông nước.';
  if (clean.includes('coco mangrove')) return 'Nhà hàng brunch phong cách Âu kết hợp Á độc đáo, không gian xanh mát mẻ giữa lòng Ninh Kiều.';
  if (clean.includes('nam bộ')) return 'Địa chỉ ẩm thực nổi tiếng bên bến Ninh Kiều, chuyên phục vụ các món ăn truyền thống Nam Bộ đặc sắc.';
  if (clean.includes('sao hôm')) return 'Nhà hàng nằm trong khu nhà lồng cổ bến Ninh Kiều, không gian lãng mạn hướng sông, chuyên món Việt và ẩm thực quốc tế.';
  if (clean.includes('princess')) return 'Du thuyền ẩm thực sang trọng trên sông Hậu, trải nghiệm ngắm cảnh Cần Thơ lung linh về đêm cùng các món ăn đẳng cấp.';

  switch (categoryName) {
    case 'Khách sạn':
      return `Nơi lưu trú lý tưởng, tiện nghi hiện đại và phục vụ tận tâm, thích hợp cho chuyến du lịch hoặc công tác tại Cần Thơ.`;
    case 'Nhà hàng':
      return `Điểm ẩm thực ẩm thực tinh tế tại Cần Thơ, không gian thiết kế sang trọng và thực đơn đa dạng phù hợp cho gia đình và bè bạn.`;
    case 'Quán ăn':
      return `Địa điểm ăn uống dân dã, món ăn ngon miệng đậm đà hương vị miền Tây sông nước với giá cả bình dân và thân thiện.`;
    case 'Cà phê':
      return `Không gian cà phê đẹp, thư giãn lý tưởng cùng các loại đồ uống phong phú, là góc hẹn hò và làm việc quen thuộc của người dân bản địa.`;
    case 'Trung tâm thương mại':
      return `Địa điểm mua sắm, vui chơi và trải nghiệm văn hóa địa phương sôi động hàng đầu tại thành phố Cần Thơ.`;
    case 'Công viên':
      return `Khuôn viên xanh mát, không khí trong lành, thích hợp cho việc đi dạo, tập thể dục hoặc ngắm cảnh thư giãn tại Cần Thơ.`;
    default:
      return `Điểm du lịch văn hóa, lịch sử hoặc thắng cảnh nổi tiếng tại Cần Thơ, mang lại những trải nghiệm khám phá thú vị cho du khách.`;
  }
}

// Generate descriptive captions
function getPhotoCaptions(placeName, categoryName) {
  switch (categoryName) {
    case 'Khách sạn':
      return [
        `Không gian sang trọng tại ${placeName}`,
        `Tiện nghi đẳng cấp tại ${placeName}`,
        `Trải nghiệm nghỉ dưỡng tuyệt vời ở ${placeName}`
      ];
    case 'Nhà hàng':
    case 'Quán ăn':
      return [
        `Món ăn đặc sản hấp dẫn tại ${placeName}`,
        `Không gian ẩm thực ấm cúng tại ${placeName}`,
        `Hương vị độc đáo khó quên tại ${placeName}`
      ];
    case 'Cà phê':
      return [
        `Không gian cà phê thư giãn tại ${placeName}`,
        `Đồ uống thơm ngon đặc trưng ở ${placeName}`,
        `Góc check-in cực đẹp tại ${placeName}`
      ];
    case 'Trung tâm thương mại':
      return [
        `Khu mua sắm sầm uất tại ${placeName}`,
        `Trải nghiệm vui chơi giải trí ở ${placeName}`,
        `Toàn cảnh không gian ${placeName}`
      ];
    case 'Công viên':
      return [
        `Không gian xanh trong lành tại ${placeName}`,
        `Góc thư giãn yên bình ở ${placeName}`,
        `Cảnh quan tươi đẹp tại ${placeName}`
      ];
    default:
      return [
        `Điểm check-in nổi bật tại ${placeName}`,
        `Cảnh quan độc đáo của ${placeName}`,
        `Vẻ đẹp lịch sử văn hóa tại ${placeName}`
      ];
  }
}

// Helper to fetch from Travel Advisor API
async function fetchTripAdvisor(endpoint, params = {}) {
  const url = new URL(`https://${host}/${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  console.log(`Fetching TripAdvisor endpoint: ${endpoint}...`);
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'x-rapidapi-key': RAPIDAPI_KEY,
      'x-rapidapi-host': host
    }
  });

  if (!res.ok) {
    throw new Error(`TripAdvisor error ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  return data.data || [];
}

// Refined duplicate checker to ONLY filter coordinates within the SAME category
async function isDuplicatePlace(name, lat, lon, categoryId) {
  const nameDup = await prisma.place.findFirst({
    where: {
      name: {
        equals: name,
        mode: 'insensitive'
      }
    }
  });
  if (nameDup) return true;

  const coordDup = await prisma.place.findFirst({
    where: {
      AND: [
        { categoryId },
        { latitude: { gte: lat - 0.0005, lte: lat + 0.0005 } },
        { longitude: { gte: lon - 0.0005, lte: lon + 0.0005 } }
      ]
    }
  });
  if (coordDup) return true;

  return false;
}

// Target high-density urban areas for massive restaurant, cafe, hotel, and church scans
const URBAN_CENTERS = [
  { name: 'Ninh Kiều Center', lat: '10.0338', lon: '105.7876' },
  { name: 'Bình Thủy District', lat: '10.0756', lon: '105.7335' },
  { name: 'Cái Răng District', lat: '10.0076', lon: '105.7483' },
  { name: 'Thới Lai District', lat: '9.9627', lon: '105.7350' },
  { name: 'Vĩnh Thạnh District', lat: '10.0149', lon: '105.6570' },
  { name: 'Phong Điền District', lat: '10.0270', lon: '105.7910' },
  { name: 'Ô Môn District', lat: '10.0135', lon: '105.7355' },
  { name: 'Thốt Nốt District', lat: '9.9446', lon: '105.7355' },
  { name: 'Cờ Đỏ District', lat: '10.0555', lon: '105.7420' }
];

// Additional keyword searches to expand
const HOTEL_QUERIES = [
  'khách sạn Cần Thơ',
  'homestay Cần Thơ',
  'nhà nghỉ Cần Thơ',
  'resort Cần Thơ',
  // Fast‑food and quick‑serve chains moved to FAST_FOOD_QUERIES
];

// Additional queries for churches, pagodas, and temples
const CHURCH_QUERIES = [
  'nhà thờ Cần Thơ',
  'chùa Cần Thơ',
  'đền Cần Thơ',
  'đền thờ Cần Thơ'
];

const FAST_FOOD_QUERIES = [
  'jollibee Cần Thơ',
  'kfc Cần Thơ',
  'burger king Cần Thơ',
  'pizzahut Cần Thơ',
  'mr pizza Cần Thơ'
];

async function main() {
  console.log('Running incremental import (NO clearing old data, appending new places)...');

  console.log('Fetching Categories from Database...');
  const dbCategories = await prisma.category.findMany({});
  const categoryMap = new Map(dbCategories.map((c) => [c.name, c.id]));

  let newPlacesCount = 0;

  const fallbacks = {
    'Khách sạn': 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1200',
    'Nhà hàng': 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200',
    'Quán ăn': 'https://images.unsplash.com/photo-1541832676-9b763b0239ab?w=1200',
    'Cà phê': 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=1200',
    'Trung tâm thương mại': 'https://images.unsplash.com/photo-1569058242253-92a9c755a0ec?w=1200',
    'Công viên': 'https://images.unsplash.com/photo-1519331379826-f10be5486c6f?w=1200',
    'Điểm tham quan': 'https://images.unsplash.com/photo-1528127269322-539801943592?w=1200'
  };

  // ====================================================
  // 1. DENSE COORDINATE SCAN FOR RESTAURANTS, CAFES, EATERIES
  // ====================================================
  for (const center of URBAN_CENTERS) {
    console.log(`\n==================================================`);
    console.log(`Scanning Restaurants / Cafes / Eateries in: ${center.name}`);
    console.log(`==================================================`);

    try {
      const list = await fetchTripAdvisor('restaurants/list-by-latlng', {
        latitude: center.lat,
        longitude: center.lon,
        limit: '1500', // Increased limit for broader coverage
        lang: 'vi_VN'
      });

      for (const item of list) {
        const name = item.name;
        const lat = item.latitude ? parseFloat(item.latitude) : null;
        const lon = item.longitude ? parseFloat(item.longitude) : null;
        let mainPhoto = item.photo?.images?.original?.url;

        if (!name || !lat || !lon || isJunkPlace(name, item.address)) {
          continue;
        }

        // Must be in Cần Thơ bounding box
        if (lat < 9.7 || lat > 10.4 || lon < 105.2 || lon > 106.2) {
          continue;
        }

        // Classification
        let categoryName = 'Nhà hàng';
        const cleanName = name.toLowerCase();

        const isCafe = cleanName.includes('cà phê') || cleanName.includes('cafe') || cleanName.includes('coffee') || cleanName.includes('tea') || cleanName.includes('trà sữa') || item.cuisine?.some(c => c.name === 'Cafe' || c.name === 'Coffee');
        const isQuanAn = cleanName.includes('quán') || cleanName.includes('hủ tiếu') || cleanName.includes('cơm tấm') || cleanName.includes('bún') || cleanName.includes('phở') || cleanName.includes('bánh xèo') || cleanName.includes('lẩu') || cleanName.includes('nướng') || cleanName.includes('nem') || cleanName.includes('mì') || cleanName.includes('ốc') || item.price_level === '$';

        if (isCafe) {
          categoryName = 'Cà phê';
        } else if (isQuanAn) {
          categoryName = 'Quán ăn';
        }

        const categoryId = categoryMap.get(categoryName);
        if (!categoryId) continue;

        // Skip duplicates
        if (await isDuplicatePlace(name, lat, lon, categoryId)) {
          continue;
        }

        if (!mainPhoto) {
          mainPhoto = fallbacks[categoryName];
        }

        const externalId = `ta_rest_${item.location_id}`.slice(0, 100);
        const price = formatPriceToVnd(item.price, categoryName);
        const description = generateDescription(name, categoryName);

        const captions = getPhotoCaptions(name, categoryName);
        const photoRecords = [];
        const images = item.photo?.images || {};
        
        if (images.original?.url) photoRecords.push({ urlOriginal: images.original.url.slice(0, 500), urlThumbnail: images.small?.url?.slice(0, 500) || images.original.url.slice(0, 500), caption: captions[0], source: 'TRIPADVISOR' });
        if (images.large?.url) photoRecords.push({ urlOriginal: images.large.url.slice(0, 500), urlThumbnail: images.small?.url?.slice(0, 500) || images.large.url.slice(0, 500), caption: captions[1], source: 'TRIPADVISOR' });
        if (images.medium?.url) photoRecords.push({ urlOriginal: images.medium.url.slice(0, 500), urlThumbnail: images.small?.url?.slice(0, 500) || images.medium.url.slice(0, 500), caption: captions[2], source: 'TRIPADVISOR' });

        if (photoRecords.length === 0) {
          photoRecords.push({
            urlOriginal: mainPhoto,
            urlThumbnail: mainPhoto,
            caption: captions[0],
            source: 'FALLBACK'
          });
        }

        try {
          await prisma.place.create({
            data: {
              name: name.slice(0, 255),
              description: description.slice(0, 500),
              latitude: lat,
              longitude: lon,
              address: (item.address || 'Cần Thơ, Việt Nam').slice(0, 255),
              price,
              openTime: new Date(Date.UTC(1970, 0, 1, 8, 0, 0)),
              closeTime: new Date(Date.UTC(1970, 0, 1, 22, 0, 0)),
              categoryId,
              image: mainPhoto.slice(0, 500),
              rating: item.rating ? parseFloat(item.rating) : 4.0,
              userRatingCount: item.num_reviews ? parseInt(item.num_reviews, 10) : 5,
              externalId,
              phone: item.phone ? String(item.phone).slice(0, 50) : null,
              website: item.website ? String(item.website).slice(0, 255) : null,
              priceLevel: item.price_level ? String(item.price_level).slice(0, 10) : 'MODERATE',
              amenities: item.cuisine ? item.cuisine.map(c => c.name).slice(0, 5) : ['Máy lạnh', 'Wifi miễn phí'],
              lastSyncedAt: new Date(),
              PlacePhoto: {
                create: photoRecords
              }
            }
          });
          console.log(`  + [NEW] Imported ${categoryName}: ${name} (Price: ${price})`);
          newPlacesCount++;
        } catch (dbErr) {
          console.error(`  - Failed to write restaurant ${name}:`, dbErr.message);
        }
      }
    } catch (err) {
      console.error(`Error scanning restaurants in ${center.name}:`, err.message);
    }

    await sleep(1500);

    // ====================================================
    // 2. DENSE COORDINATE SCAN FOR ATTRACTIONS, CHURCHES, PARKS
    // ====================================================
    console.log(`\n==================================================`);
    console.log(`Scanning Attractions / Churches / Parks in: ${center.name}`);
    console.log(`==================================================`);

    try {
      const attractions = await fetchTripAdvisor('attractions/list-by-latlng', {
        latitude: center.lat,
        longitude: center.lon,
        limit: '100', // Query a massive list
        lang: 'vi_VN'
      });

      for (const item of attractions) {
        const name = item.name;
        const lat = item.latitude ? parseFloat(item.latitude) : null;
        const lon = item.longitude ? parseFloat(item.longitude) : null;
        let mainPhoto = item.photo?.images?.original?.url || fallbacks['Điểm tham quan'];

        if (!name || !lat || !lon || isJunkPlace(name, item.address)) {
          continue;
        }

        // Must be in Cần Thơ bounding box
        if (lat < 9.7 || lat > 10.4 || lon < 105.2 || lon > 106.2) {
          continue;
        }

        // Classification
        let categoryName = 'Điểm tham quan';
        const cleanName = name.toLowerCase();
        const subcats = item.subcategory ? item.subcategory.map(s => s.name.toLowerCase()) : [];
        
        const isMall = cleanName.includes('chợ') || cleanName.includes('mall') || cleanName.includes('plaza') || cleanName.includes('trung tâm thương mại') || cleanName.includes('siêu thị') || subcats.some(s => s.includes('mua sắm') || s.includes('chợ'));
        const isPark = cleanName.includes('công viên') || cleanName.includes('park') || cleanName.includes('vườn') || cleanName.includes('khu sinh thái') || subcats.some(s => s.includes('công viên') || s.includes('thiên nhiên') || s.includes('vườn'));

        if (isPark) {
          categoryName = 'Công viên';
        } else if (isMall) {
          categoryName = 'Trung tâm thương mại';
        }

        const categoryId = categoryMap.get(categoryName);
        if (!categoryId) continue;

        // Skip duplicates
        if (await isDuplicatePlace(name, lat, lon, categoryId)) {
          continue;
        }

        if (mainPhoto === fallbacks['Điểm tham quan'] && fallbacks[categoryName]) {
          mainPhoto = fallbacks[categoryName];
        }

        const externalId = `ta_attr_${item.location_id}`.slice(0, 100);
        const price = formatPriceToVnd(item.price, categoryName);
        const description = generateDescription(name, categoryName);

        const captions = getPhotoCaptions(name, categoryName);
        const photoRecords = [];
        const images = item.photo?.images || {};
        
        if (images.original?.url) photoRecords.push({ urlOriginal: images.original.url.slice(0, 500), urlThumbnail: images.small?.url?.slice(0, 500) || images.original.url.slice(0, 500), caption: captions[0], source: 'TRIPADVISOR' });
        if (images.large?.url) photoRecords.push({ urlOriginal: images.large.url.slice(0, 500), urlThumbnail: images.small?.url?.slice(0, 500) || images.large.url.slice(0, 500), caption: captions[1], source: 'TRIPADVISOR' });
        if (images.medium?.url) photoRecords.push({ urlOriginal: images.medium.url.slice(0, 500), urlThumbnail: images.small?.url?.slice(0, 500) || images.medium.url.slice(0, 500), caption: captions[2], source: 'TRIPADVISOR' });

        if (photoRecords.length === 0) {
          photoRecords.push({
            urlOriginal: mainPhoto,
            urlThumbnail: mainPhoto,
            caption: captions[0],
            source: 'FALLBACK'
          });
        }

        try {
          await prisma.place.create({
            data: {
              name: name.slice(0, 255),
              description: description.slice(0, 500),
              latitude: lat,
              longitude: lon,
              address: (item.address || 'Cần Thơ, Việt Nam').slice(0, 255),
              price,
              openTime: new Date(Date.UTC(1970, 0, 1, 7, 0, 0)),
              closeTime: new Date(Date.UTC(1970, 0, 1, 21, 0, 0)),
              categoryId,
              image: mainPhoto.slice(0, 500),
              rating: item.rating ? parseFloat(item.rating) : 4.5,
              userRatingCount: item.num_reviews ? parseInt(item.num_reviews, 10) : 5,
              externalId,
              phone: item.phone ? String(item.phone).slice(0, 50) : null,
              website: item.website ? String(item.website).slice(0, 255) : null,
              priceLevel: 'FREE',
              amenities: item.subcategory ? item.subcategory.map(s => s.name).slice(0, 5) : ['Điểm tham quan', 'Chụp ảnh'],
              lastSyncedAt: new Date(),
              PlacePhoto: {
                create: photoRecords
              }
            }
          });
          console.log(`  + [NEW] Imported ${categoryName}: ${name} (Price: ${price})`);
          newPlacesCount++;
        } catch (dbErr) {
          console.error(`  - Failed to write attraction ${name}:`, dbErr.message);
        }
      }
    } catch (err) {
      console.error(`Error scanning attractions in ${center.name}:`, err.message);
    }

    await sleep(1500);
  }

  // ====================================================
  // 3. TARGETED HOTEL KEYWORD SEARCH
  // ====================================================
  console.log(`\n==================================================`);
  console.log('Searching Hotels / Lodging via Keyword Search');
  console.log('==================================================');
  for (const q of HOTEL_QUERIES) {
    try {
      const hotels = await fetchTripAdvisor('locations/search', {
        query: q,
        limit: '30',
        lang: 'vi_VN'
      });

      const categoryId = categoryMap.get('Khách sạn');
      if (categoryId) {
        for (const item of hotels) {
          if (item.result_type !== 'lodging') continue;

          const obj = item.result_object;
          const name = obj.name;
          const lat = obj.latitude ? parseFloat(obj.latitude) : null;
          const lon = obj.longitude ? parseFloat(obj.longitude) : null;
          let mainPhoto = obj.photo?.images?.original?.url || fallbacks['Khách sạn'];

          if (!name || !lat || !lon || isJunkPlace(name, obj.address)) {
            continue;
          }

          if (lat < 9.7 || lat > 10.4 || lon < 105.2 || lon > 106.2) {
            continue;
          }

          if (await isDuplicatePlace(name, lat, lon, categoryId)) {
            continue;
          }

          const externalId = `ta_hotel_${obj.location_id}`.slice(0, 100);
          const price = formatPriceToVnd(obj.price, 'Khách sạn');
          const description = generateDescription(name, 'Khách sạn');

          const captions = getPhotoCaptions(name, 'Khách sạn');
          const photoRecords = [];
          const images = obj.photo?.images || {};

          if (images.original?.url) photoRecords.push({ urlOriginal: images.original.url.slice(0, 500), urlThumbnail: images.small?.url?.slice(0, 500) || images.original.url.slice(0, 500), caption: captions[0], source: 'TRIPADVISOR' });
          if (images.large?.url) photoRecords.push({ urlOriginal: images.large.url.slice(0, 500), urlThumbnail: images.small?.url?.slice(0, 500) || images.large.url.slice(0, 500), caption: captions[1], source: 'TRIPADVISOR' });
          if (images.medium?.url) photoRecords.push({ urlOriginal: images.medium.url.slice(0, 500), urlThumbnail: images.small?.url?.slice(0, 500) || images.medium.url.slice(0, 500), caption: captions[2], source: 'TRIPADVISOR' });

          if (photoRecords.length === 0) {
            photoRecords.push({
              urlOriginal: fallbacks['Khách sạn'],
              urlThumbnail: fallbacks['Khách sạn'],
              caption: captions[0],
              source: 'FALLBACK'
            });
          }

          try {
            await prisma.place.create({
              data: {
                name: name.slice(0, 255),
                description: description.slice(0, 500),
                latitude: lat,
                longitude: lon,
                address: (obj.address || 'Cần Thơ, Việt Nam').slice(0, 255),
                price,
                openTime: new Date(Date.UTC(1970, 0, 1, 0, 0, 0)),
                closeTime: new Date(Date.UTC(1970, 0, 1, 23, 59, 0)),
                categoryId,
                image: mainPhoto.slice(0, 500),
                rating: obj.rating ? parseFloat(obj.rating) : 4.0,
                userRatingCount: obj.num_reviews ? parseInt(obj.num_reviews, 10) : 5,
                externalId,
                phone: obj.phone ? String(obj.phone).slice(0, 50) : null,
                website: obj.website ? String(obj.website).slice(0, 255) : null,
                priceLevel: 'MODERATE',
                amenities: ['Wifi miễn phí', 'Máy lạnh', 'Phục vụ chu đáo'],
                lastSyncedAt: new Date(),
                PlacePhoto: {
                  create: photoRecords
                }
              }
            });
            console.log(`  + [NEW] Imported Khách sạn: ${name} (Price: ${price})`);
            newPlacesCount++;
          } catch (dbErr) {
            console.error(`  - Failed to write hotel ${name}:`, dbErr.message);
          }
        }
      }
    } catch (err) {
      console.error(`Error querying hotel search "${q}":`, err.message);
    }

    await sleep(1500);
  }

    // ---------------------------------------------------
    // 4. SEARCH FOR CHURCHES / PAGODAS / TEMPLES via Keyword Search
    // ---------------------------------------------------
    console.log(`\n==================================================`);
    console.log('Searching Churches / Pagodas via Keyword Search');
    console.log('==================================================');
    const churchCategoryId = categoryMap.get('Điểm tham quan');
    for (const q of CHURCH_QUERIES) {
      try {
        const places = await fetchTripAdvisor('locations/search', {
          query: q,
          limit: '30',
          lang: 'vi_VN'
        });
        if (churchCategoryId) {
          for (const item of places) {
            const obj = item.result_object || item;
            const name = obj.name;
            const lat = obj.latitude ? parseFloat(obj.latitude) : null;
            const lon = obj.longitude ? parseFloat(obj.longitude) : null;
            let mainPhoto = obj.photo?.images?.original?.url || fallbacks['Điểm tham quan'];

            if (!name || !lat || !lon || isJunkPlace(name, obj.address)) continue;
            if (lat < 9.7 || lat > 10.4 || lon < 105.2 || lon > 106.2) continue;
            if (await isDuplicatePlace(name, lat, lon, churchCategoryId)) continue;

            const externalId = `ta_church_${obj.location_id}`.slice(0, 100);
            const price = formatPriceToVnd(obj.price, 'Điểm tham quan');
            const description = generateDescription(name, 'Điểm tham quan');
            const captions = getPhotoCaptions(name, 'Điểm tham quan');
            const photoRecords = [];
            const images = obj.photo?.images || {};
            if (images.original?.url) photoRecords.push({ urlOriginal: images.original.url.slice(0, 500), urlThumbnail: images.small?.url?.slice(0, 500) || images.original.url.slice(0, 500), caption: captions[0], source: 'TRIPADVISOR' });
            if (images.large?.url) photoRecords.push({ urlOriginal: images.large.url.slice(0, 500), urlThumbnail: images.small?.url?.slice(0, 500) || images.large.url.slice(0, 500), caption: captions[1], source: 'TRIPADVISOR' });
            if (images.medium?.url) photoRecords.push({ urlOriginal: images.medium.url.slice(0, 500), urlThumbnail: images.small?.url?.slice(0, 500) || images.medium.url.slice(0, 500), caption: captions[2], source: 'TRIPADVISOR' });
            if (photoRecords.length === 0) {
              photoRecords.push({
                urlOriginal: mainPhoto,
                urlThumbnail: mainPhoto,
                caption: captions[0],
                source: 'FALLBACK'
              });
            }

            try {
              await prisma.place.create({
                data: {
                  name: name.slice(0, 255),
                  description: description.slice(0, 500),
                  latitude: lat,
                  longitude: lon,
                  address: (obj.address || 'Cần Thơ, Việt Nam').slice(0, 255),
                  price,
                  openTime: new Date(Date.UTC(1970, 0, 1, 7, 0, 0)),
                  closeTime: new Date(Date.UTC(1970, 0, 1, 21, 0, 0)),
                  categoryId: churchCategoryId,
                  image: mainPhoto.slice(0, 500),
                  rating: obj.rating ? parseFloat(obj.rating) : 4.5,
                  userRatingCount: obj.num_reviews ? parseInt(obj.num_reviews, 10) : 5,
                  externalId,
                  phone: obj.phone ? String(obj.phone).slice(0, 50) : null,
                  website: obj.website ? String(obj.website).slice(0, 255) : null,
                  priceLevel: 'FREE',
                  amenities: obj.subcategory ? obj.subcategory.map(s => s.name).slice(0, 5) : ['Điểm tham quan', 'Chụp ảnh'],
                  lastSyncedAt: new Date(),
                  PlacePhoto: { create: photoRecords }
                }
              });
              console.log(`  + [NEW] Imported Điểm tham quan (church): ${name} (Price: ${price})`);
              newPlacesCount++;
            } catch (dbErr) {
              console.error(`  - Failed to write church ${name}:`, dbErr.message);
            }
          }
        }
      } catch (err) {
        console.error(`Error querying church search "${q}":`, err.message);
      }
      await sleep(1500);
    }

// ---------------------------------------------------
// 5. SEARCH FOR FAST‑FOOD CHAINS via Keyword Search
// ---------------------------------------------------
console.log(`\n==================================================`);
console.log('Searching Fast‑Food Chains via Keyword Search');
console.log('==================================================');
const fastFoodCategoryId = categoryMap.get('Nhà hàng');
for (const q of FAST_FOOD_QUERIES) {
  try {
    const places = await fetchTripAdvisor('locations/search', { query: q, limit: '30', lang: 'vi_VN' });
    if (fastFoodCategoryId) {
      for (const item of places) {
        const obj = item.result_object || item;
        const name = obj.name;
        const lat = obj.latitude ? parseFloat(obj.latitude) : null;
        const lon = obj.longitude ? parseFloat(obj.longitude) : null;
        let mainPhoto = obj.photo?.images?.original?.url || fallbacks['Nhà hàng'];
        if (!name || !lat || !lon || isJunkPlace(name, obj.address)) continue;
        if (lat < 9.7 || lat > 10.4 || lon < 105.2 || lon > 106.2) continue;
        if (await isDuplicatePlace(name, lat, lon, fastFoodCategoryId)) continue;
        const externalId = `ta_fastfood_${obj.location_id}`.slice(0, 100);
        const price = formatPriceToVnd(obj.price, 'Nhà hàng');
        const description = generateDescription(name, 'Nhà hàng');
        const captions = getPhotoCaptions(name, 'Nhà hàng');
        const photoRecords = [];
        const images = obj.photo?.images || {};
        if (images.original?.url) photoRecords.push({ urlOriginal: images.original.url.slice(0, 500), urlThumbnail: images.small?.url?.slice(0, 500) || images.original.url.slice(0, 500), caption: captions[0], source: 'TRIPADVISOR' });
        if (images.large?.url) photoRecords.push({ urlOriginal: images.large.url.slice(0, 500), urlThumbnail: images.small?.url?.slice(0, 500) || images.large.url.slice(0, 500), caption: captions[1], source: 'TRIPADVISOR' });
        if (images.medium?.url) photoRecords.push({ urlOriginal: images.medium.url.slice(0, 500), urlThumbnail: images.small?.url?.slice(0, 500) || images.medium.url.slice(0, 500), caption: captions[2], source: 'TRIPADVISOR' });
        if (photoRecords.length === 0) {
          photoRecords.push({ urlOriginal: mainPhoto, urlThumbnail: mainPhoto, caption: captions[0], source: 'FALLBACK' });
        }
        try {
          await prisma.place.create({
            data: {
              name: name.slice(0, 255),
              description: description.slice(0, 500),
              latitude: lat,
              longitude: lon,
              address: (obj.address || 'Cần Thơ, Việt Nam').slice(0, 255),
              price,
              openTime: new Date(Date.UTC(1970, 0, 1, 8, 0, 0)),
              closeTime: new Date(Date.UTC(1970, 0, 1, 22, 0, 0)),
              categoryId: fastFoodCategoryId,
              image: mainPhoto.slice(0, 500),
              rating: obj.rating ? parseFloat(obj.rating) : 4.0,
              userRatingCount: obj.num_reviews ? parseInt(obj.num_reviews, 10) : 5,
              externalId,
              phone: obj.phone ? String(obj.phone).slice(0, 50) : null,
              website: obj.website ? String(obj.website).slice(0, 255) : null,
              priceLevel: obj.price_level ? String(obj.price_level).slice(0, 10) : 'MODERATE',
              amenities: obj.cuisine ? obj.cuisine.map(c => c.name).slice(0, 5) : ['WiFi', 'Parking'],
              lastSyncedAt: new Date(),
              PlacePhoto: { create: photoRecords }
            }
          });
          console.log(`  + [NEW] Imported Fast‑Food: ${name} (Price: ${price})`);
          newPlacesCount++;
        } catch (dbErr) {
          console.error(`  - Failed to write fast‑food ${name}:`, dbErr.message);
        }
      }
    }
  } catch (err) {
    console.error(`Error querying fast‑food search "${q}":`, err.message);
  }
  await sleep(1500);
}


  console.log(`\nIncremental scan complete!`);
  console.log(`Total new unique Cần Thơ places added to the database: ${newPlacesCount}`);
}

main()
  .catch((err) => {
    console.error('Fatal TripAdvisor incremental scan error:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
