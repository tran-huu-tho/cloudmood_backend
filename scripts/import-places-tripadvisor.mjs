import 'dotenv/config';
import { prisma } from './prisma-client.mjs';
import { fetchWithKeyRotation } from './api-key-manager.mjs';

const host = 'travel-advisor.p.rapidapi.com';

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
  if (clean.includes('vincom')) return 'Trung tâm thương mại hiện đại sầm uất hàng đầu Cần Thơ, tích hợp mua sắm, vui chơi giải trí và ẩm thực đa dạng.';
  if (clean.includes('lotte')) return 'Khu phức hợp siêu thị, trung tâm thương mại và rạp chiếu phim hiện đại, điểm vui chơi mua sắm phổ biến tại Cần Thơ.';
  if (clean.includes('sense city')) return 'Trung tâm thương mại lớn ngay Ninh Kiều, biểu tượng mua sắm và vui chơi giải trí quen thuộc của người dân Cần Thơ.';
  if (clean.includes('go!')) return 'Đại siêu thị và trung tâm thương mại lớn ở Cái Răng, địa điểm mua sắm nhu yếu phẩm và ẩm thực phong phú.';

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

// Helper to generate descriptive captions
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
  const res = await fetchWithKeyRotation(url, {
    method: 'GET',
    headers: {
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

// Target areas for coordinate scans
const URBAN_CENTERS = [
  { name: 'Ninh Kiều Center', lat: '10.0338', lon: '105.7876' },
  { name: 'Bình Thủy District', lat: '10.0756', lon: '105.7335' },
  { name: 'Cái Răng District', lat: '10.0076', lon: '105.7483' },
  { name: 'Phong Điền Town', lat: '10.0067', lon: '105.6983' },
  { name: 'Ô Môn District Center', lat: '10.1256', lon: '105.6335' },
  { name: 'Thốt Nốt District Center', lat: '10.2756', lon: '105.5335' }
];

// Targeted Queries for Malls, Pagodas, Cafes, and Eateries to fill database accurately
const TARGETED_MALL_QUERIES = [
  'Vincom Plaza Xuân Khánh Cần Thơ',
  'Vincom Plaza Hùng Vương Cần Thơ',
  'Sense City Cần Thơ',
  'Lotte Mart Cần Thơ',
  'GO Cần Thơ',
  'Big C Cần Thơ'
];

const TARGETED_RELIGIOUS_QUERIES = [
  'Chùa Ông Cần Thơ',
  'Chùa Phật Học Cần Thơ',
  'Thiền Viện Trúc Lâm Phương Nam Cần Thơ',
  'Chùa Nam Nhã Cần Thơ',
  'Chùa Munirangsyaram Cần Thơ',
  'Chùa Khánh Quang Cần Thơ',
  'Nhà thờ Chính tòa Cần Thơ'
];

const TARGETED_CAFE_QUERIES = [
  'Highlands Coffee Cần Thơ',
  'Phúc Long Cần Thơ',
  'The Coffee House Cần Thơ',
  'Trung Nguyên Legend Cần Thơ',
  'Tiệm Trà Cỏ Ngọt Cần Thơ',
  'Infini T Can Tho',
  'Góc Phố Cafe Cần Thơ',
  'Amia Coffee Cần Thơ',
  'Cà phê Vợt Cần Thơ'
];

const TARGETED_EATERY_QUERIES = [
  'Nem Nướng Thanh Vân Cần Thơ',
  'Lẩu Mắm Dạ Lý Cần Thơ',
  'Lẩu Mắm Cần Thơ',
  'Bánh Xèo 7 Tới Cần Thơ',
  'Pizza 4Ps Cần Thơ',
  'Vịt Nấu Chao Thành Giao Cần Thơ',
  'Quán Hồi Đó Cần Thơ',
  'Cơm Tấm Thu Vân Cần Thơ',
  'Bún Mắm 173 Cần Thơ'
];

const TARGETED_HOTEL_QUERIES = [
  'Sheraton Can Tho',
  'Muong Thanh Luxury Can Tho',
  'TTC Hotel Can Tho',
  'Ninh Kieu Riverside Hotel',
  'Victoria Can Tho Resort',
  'Can Tho Ecolodge',
  'Legacy Mekong Can Tho'
];

const DISCOVERY_QUERIES = [
  { category: 'Cà phê', queries: ['cà phê Cần Thơ', 'cafe đẹp Cần Thơ', 'tiệm trà Cần Thơ', 'trà sữa Cần Thơ'] },
  { category: 'Quán ăn', queries: ['lẩu mắm Cần Thơ', 'bánh xèo Cần Thơ', 'hủ tiếu Cần Thơ', 'nem nướng Cần Thơ', 'cơm tấm Cần Thơ', 'vịt nấu chao Cần Thơ', 'bún mắm Cần Thơ', 'lẩu dê Cần Thơ', 'hải sản Cần Thơ'] },
  { category: 'Nhà hàng', queries: ['nhà hàng ngon Cần Thơ', 'nhà hàng ven sông Cần Thơ', 'nhà hàng chay Cần Thơ', 'buffet Cần Thơ'] },
  { category: 'Điểm tham quan', queries: ['chùa Cần Thơ', 'khu du lịch sinh thái Cần Thơ', 'điểm check-in Cần Thơ'] },
  { category: 'Công viên', queries: ['công viên Cần Thơ'] }
];

async function main() {
  console.log('Running incremental import (NO clearing old data, appending new places)...');

  console.log('Fetching Categories from Database...');
  const dbCategories = await prisma.category.findMany({});
  const categoryMap = new Map(dbCategories.map((c) => [c.name, c.id]));

  let newPlacesCount = 0;

  // Reusable import function for queries
  async function importByQueries(queries, categoryName, defaultOpen = "08:00", defaultClose = "22:00") {
    const categoryId = categoryMap.get(categoryName);
    if (!categoryId) return;

    console.log(`\n--------------------------------------------------`);
    console.log(`Searching and importing for category: ${categoryName}`);
    console.log(`--------------------------------------------------`);

    for (const q of queries) {
      console.log(`Querying: "${q}"...`);
      try {
        const places = await fetchTripAdvisor('locations/search', {
          query: q,
          location_id: '303942',
          limit: '10',
          lang: 'vi_VN'
        });

        for (const item of places) {
          const obj = item.result_object || item;
          if (!obj || item.result_type === 'geos') continue;

          const name = obj.name;
          const lat = obj.latitude ? parseFloat(obj.latitude) : null;
          const lon = obj.longitude ? parseFloat(obj.longitude) : null;
          
          // No placeholder images
          let mainPhoto = obj.photo?.images?.original?.url || "";

          if (!name || !lat || !lon || isJunkPlace(name, obj.address)) continue;

          // Bounding box filter for Cần Thơ
          if (lat < 9.7 || lat > 10.4 || lon < 105.2 || lon > 106.2) continue;

          if (await isDuplicatePlace(name, lat, lon, categoryId)) {
            console.log(`  - Skipping duplicate: ${name}`);
            continue;
          }

          const externalId = `ta_search_${categoryName.replace(/\s+/g, '_')}_${obj.location_id}`.slice(0, 100);
          const price = formatPriceToVnd(obj.price, categoryName);
          const description = generateDescription(name, categoryName);
          const captions = getPhotoCaptions(name, categoryName);
          const photoRecords = [];
          const images = obj.photo?.images || {};

          if (images.original?.url) photoRecords.push({ urlOriginal: images.original.url.slice(0, 500), urlThumbnail: images.small?.url?.slice(0, 500) || images.original.url.slice(0, 500), caption: captions[0], source: 'TRIPADVISOR' });
          if (images.large?.url) photoRecords.push({ urlOriginal: images.large.url.slice(0, 500), urlThumbnail: images.small?.url?.slice(0, 500) || images.large.url.slice(0, 500), caption: captions[1], source: 'TRIPADVISOR' });
          if (images.medium?.url) photoRecords.push({ urlOriginal: images.medium.url.slice(0, 500), urlThumbnail: images.small?.url?.slice(0, 500) || images.medium.url.slice(0, 500), caption: captions[2], source: 'TRIPADVISOR' });

          const opHrs = {
            monday: [defaultOpen, defaultClose],
            tuesday: [defaultOpen, defaultClose],
            wednesday: [defaultOpen, defaultClose],
            thursday: [defaultOpen, defaultClose],
            friday: [defaultOpen, defaultClose],
            saturday: [defaultOpen, defaultClose],
            sunday: [defaultOpen, defaultClose]
          };

          try {
            await prisma.place.create({
              data: {
                name: name.slice(0, 255),
                description: description.slice(0, 500),
                latitude: lat,
                longitude: lon,
                address: (obj.address || 'Cần Thơ, Việt Nam').slice(0, 255),
                price,
                openingHours: opHrs,
                categoryId,
                image: mainPhoto.slice(0, 500),
                rating: obj.rating ? parseFloat(obj.rating) : 4.5,
                userRatingCount: obj.num_reviews ? parseInt(obj.num_reviews, 10) : 5,
                externalId,
                phone: obj.phone ? String(obj.phone).slice(0, 50) : null,
                website: obj.website ? String(obj.website).slice(0, 255) : null,
                priceLevel: obj.price_level ? String(obj.price_level).slice(0, 10) : 'MODERATE',
                subCategories: obj.subcategory ? obj.subcategory.map(s => s.name).slice(0, 5) : [categoryName],
                lastSyncedAt: new Date(),
                photos: { create: photoRecords }
              }
            });
            console.log(`  + [NEW] Imported ${categoryName}: ${name} (Price: ${price})`);
            newPlacesCount++;
          } catch (dbErr) {
            console.error(`  - Failed to write ${categoryName} ${name}:`, dbErr.message);
          }
        }
      } catch (err) {
        console.error(`Error querying search "${q}":`, err.message);
      }
      await sleep(1500);
    }
  }

  // ====================================================
  // 1. RUN TARGETED IMPORTS FOR SPECIFIC MISSING PLACES
  // ====================================================
  await importByQueries(TARGETED_MALL_QUERIES, 'Trung tâm thương mại', '09:00', '22:00');
  await importByQueries(TARGETED_RELIGIOUS_QUERIES, 'Điểm tham quan', '07:00', '21:00');
  await importByQueries(TARGETED_CAFE_QUERIES, 'Cà phê', '07:00', '22:30');
  await importByQueries(TARGETED_EATERY_QUERIES, 'Quán ăn', '10:00', '22:00');
  await importByQueries(TARGETED_HOTEL_QUERIES, 'Khách sạn', '00:00', '23:59');

  // ====================================================
  // 1.5 RUN DISCOVERY QUERIES FOR MASSIVE PLACE POPULATION
  // ====================================================
  for (const group of DISCOVERY_QUERIES) {
    await importByQueries(group.queries, group.category, '08:00', '22:00');
  }

  // ====================================================
  // 2. COORDINATE SCAN FOR GENERAL RESTAURANTS, CAFES, EATERIES
  // ====================================================
  for (const center of URBAN_CENTERS) {
    console.log(`\n==================================================`);
    console.log(`Scanning Restaurants / Cafes / Eateries in: ${center.name}`);
    console.log(`==================================================`);

    try {
      const list = await fetchTripAdvisor('restaurants/list-by-latlng', {
        latitude: center.lat,
        longitude: center.lon,
        limit: '1500',
        lang: 'vi_VN'
      });

      for (const item of list) {
        const name = item.name;
        const lat = item.latitude ? parseFloat(item.latitude) : null;
        const lon = item.longitude ? parseFloat(item.longitude) : null;
        
        // No placeholder images
        let mainPhoto = item.photo?.images?.original?.url || "";

        if (!name || !lat || !lon || isJunkPlace(name, item.address)) {
          continue;
        }

        if (lat < 9.7 || lat > 10.4 || lon < 105.2 || lon > 106.2) {
          continue;
        }

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

        if (await isDuplicatePlace(name, lat, lon, categoryId)) {
          continue;
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

        const opHrs = {
          monday: ["08:00", "22:00"],
          tuesday: ["08:00", "22:00"],
          wednesday: ["08:00", "22:00"],
          thursday: ["08:00", "22:00"],
          friday: ["08:00", "22:00"],
          saturday: ["08:00", "22:00"],
          sunday: ["08:00", "22:00"]
        };

        try {
          await prisma.place.create({
            data: {
              name: name.slice(0, 255),
              description: description.slice(0, 500),
              latitude: lat,
              longitude: lon,
              address: (item.address || 'Cần Thơ, Việt Nam').slice(0, 255),
              price,
              openingHours: opHrs,
              categoryId,
              image: mainPhoto.slice(0, 500),
              rating: item.rating ? parseFloat(item.rating) : 4.0,
              userRatingCount: item.num_reviews ? parseInt(item.num_reviews, 10) : 5,
              externalId,
              phone: item.phone ? String(item.phone).slice(0, 50) : null,
              website: item.website ? String(item.website).slice(0, 255) : null,
              priceLevel: item.price_level ? String(item.price_level).slice(0, 10) : 'MODERATE',
              subCategories: item.cuisine ? item.cuisine.map(c => c.name).slice(0, 5) : ['Máy lạnh', 'Wifi miễn phí'],
              lastSyncedAt: new Date(),
              photos: {
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
    // 3. COORDINATE SCAN FOR GENERAL ATTRACTIONS, PARKS
    // ====================================================
    console.log(`\n==================================================`);
    console.log(`Scanning Attractions / Parks in: ${center.name}`);
    console.log(`==================================================`);

    try {
      const attractions = await fetchTripAdvisor('attractions/list-by-latlng', {
        latitude: center.lat,
        longitude: center.lon,
        limit: '100',
        lang: 'vi_VN'
      });

      for (const item of attractions) {
        const name = item.name;
        const lat = item.latitude ? parseFloat(item.latitude) : null;
        const lon = item.longitude ? parseFloat(item.longitude) : null;
        
        // No placeholder images
        let mainPhoto = item.photo?.images?.original?.url || "";

        if (!name || !lat || !lon || isJunkPlace(name, item.address)) {
          continue;
        }

        if (lat < 9.7 || lat > 10.4 || lon < 105.2 || lon > 106.2) {
          continue;
        }

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

        if (await isDuplicatePlace(name, lat, lon, categoryId)) {
          continue;
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

        const opHrs = {
          monday: ["07:00", "21:00"],
          tuesday: ["07:00", "21:00"],
          wednesday: ["07:00", "21:00"],
          thursday: ["07:00", "21:00"],
          friday: ["07:00", "21:00"],
          saturday: ["07:00", "21:00"],
          sunday: ["07:00", "21:00"]
        };

        try {
          await prisma.place.create({
            data: {
              name: name.slice(0, 255),
              description: description.slice(0, 500),
              latitude: lat,
              longitude: lon,
              address: (item.address || 'Cần Thơ, Việt Nam').slice(0, 255),
              price,
              openingHours: opHrs,
              categoryId,
              image: mainPhoto.slice(0, 500),
              rating: item.rating ? parseFloat(item.rating) : 4.5,
              userRatingCount: item.num_reviews ? parseInt(item.num_reviews, 10) : 5,
              externalId,
              phone: item.phone ? String(item.phone).slice(0, 50) : null,
              website: item.website ? String(item.website).slice(0, 255) : null,
              priceLevel: 'FREE',
              subCategories: item.subcategory ? item.subcategory.map(s => s.name).slice(0, 5) : ['Điểm tham quan', 'Chụp ảnh'],
              lastSyncedAt: new Date(),
              photos: {
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

  console.log(`\nIncremental scan complete!`);
  console.log(`Total new unique Cần Thơ places added to the database: ${newPlacesCount}`);
}

main()
  .catch((err) => {
    console.error('Fatal TripAdvisor incremental scan error:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
