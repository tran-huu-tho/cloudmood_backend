import { prisma } from './prisma-client.mjs';

const FALLBACK_PREFIXES = [
  'https://images.unsplash.com/photo-1566073771259-6a8506099945',
  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4',
  'https://images.unsplash.com/photo-1541832676-9b763b0239ab',
  'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb',
  'https://images.unsplash.com/photo-1569058242253-92a9c755a0ec',
  'https://images.unsplash.com/photo-1519331379826-f10be5486c6f',
  'https://images.unsplash.com/photo-1528127269322-539801943592'
];

function isFallbackUrl(url) {
  if (!url) return false;
  return FALLBACK_PREFIXES.some(prefix => url.startsWith(prefix));
}

async function main() {
  console.log('--- Cleaning up place images & updating openingHours ---');
  
  // 1. Fetch all places
  const places = await prisma.place.findMany({});
  console.log(`Found ${places.length} places in database.`);
  
  let hoursUpdated = 0;
  let imagesCleared = 0;
  
  for (const place of places) {
    let needsUpdate = false;
    const updateData = {};
    
    // Check openingHours format
    const rawHours = place.openingHours;
    if (rawHours && typeof rawHours === 'object') {
      if (!rawHours.monday && rawHours.open && rawHours.close) {
        const openStr = rawHours.open;
        const closeStr = rawHours.close;
        updateData.openingHours = {
          monday: [openStr, closeStr],
          tuesday: [openStr, closeStr],
          wednesday: [openStr, closeStr],
          thursday: [openStr, closeStr],
          friday: [openStr, closeStr],
          saturday: [openStr, closeStr],
          sunday: [openStr, closeStr]
        };
        needsUpdate = true;
        hoursUpdated++;
      }
    }
    
    // Check if main image is a fallback placeholder
    if (isFallbackUrl(place.image)) {
      updateData.image = '';
      needsUpdate = true;
      imagesCleared++;
    }
    
    if (needsUpdate) {
      await prisma.place.update({
        where: { id: place.id },
        data: updateData
      });
      console.log(`Updated Place ID ${place.id}: ${place.name}`);
    }
  }
  
  console.log(`\nUpdated hours format for ${hoursUpdated} places.`);
  console.log(`Cleared fallback placeholder image for ${imagesCleared} places.`);

  // 2. Delete all fallback PlacePhoto records
  console.log('\n--- Cleaning up fallback photos from PlacePhoto table ---');
  
  const allPhotos = await prisma.placePhoto.findMany({});
  let deletedPhotosCount = 0;
  
  for (const photo of allPhotos) {
    if (photo.source === 'FALLBACK' || isFallbackUrl(photo.urlOriginal)) {
      await prisma.placePhoto.delete({
        where: { id: photo.id }
      });
      deletedPhotosCount++;
    }
  }
  
  console.log(`Deleted ${deletedPhotosCount} fallback PlacePhoto records.`);
  console.log('Cleanup finished successfully!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
