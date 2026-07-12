import { prisma } from './prisma-client.mjs';

// Haversine formula to calculate distance in km
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  const d = R * c; // Distance in km
  return d;
}

const NINH_KIEU_LAT = 10.0338;
const NINH_KIEU_LON = 105.7876;

async function main() {
  console.log('Checking database coordinates...');
  const places = await prisma.place.findMany({
    include: { category: true }
  });
  
  let suspiciousPlaces = [];
  
  for (const place of places) {
    const dist = getDistance(place.latitude, place.longitude, NINH_KIEU_LAT, NINH_KIEU_LON);
    
    // Suspicious if further than 20km from Ninh Kieu, or address says another province, or coordinates are outside Can Tho box
    const isOutsideCanTho = 
      place.latitude < 9.9 || place.latitude > 10.3 || 
      place.longitude < 105.4 || place.longitude > 105.9;
      
    const addressLower = (place.address || '').toLowerCase();
    const isWrongProvince = 
      addressLower.includes('vĩnh long') || 
      addressLower.includes('đồng tháp') || 
      addressLower.includes('an giang') || 
      addressLower.includes('hồ chí minh') || 
      addressLower.includes('hanoi') ||
      addressLower.includes('vung tau');

    if (dist > 20 || isOutsideCanTho || isWrongProvince) {
      suspiciousPlaces.push({
        id: place.id.toString(),
        name: place.name,
        category: place.category.name,
        latitude: place.latitude,
        longitude: place.longitude,
        address: place.address,
        distanceKm: dist.toFixed(2),
        isOutsideCanTho,
        isWrongProvince
      });
    }
  }
  
  console.log(`\nFound ${suspiciousPlaces.length} suspicious places out of ${places.length} total:`);
  console.log(JSON.stringify(suspiciousPlaces, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
