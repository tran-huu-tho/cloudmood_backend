import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class PlacesService {
  private readonly logger = new Logger(PlacesService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  async findAll(categoryName?: string) {
    if (categoryName) {
      const category = await this.prisma.category.findFirst({
        where: { name: categoryName },
      });
      if (category) {
        return this.prisma.place.findMany({
          where: { categoryId: category.id },
          include: { category: true, photos: true },
        });
      }
    }
    return this.prisma.place.findMany({
      include: { category: true, photos: true },
    });
  }

  async isDestinationSupported(cityName: string) {
    const place = await this.prisma.place.findFirst({
      where: {
        OR: [
          { address: { contains: cityName, mode: 'insensitive' } },
          { name: { contains: cityName, mode: 'insensitive' } },
        ],
      },
    });
    return !!place;
  }

  // --- New Feature: Search Places combining DB & Geoapify ---
  
  // Cache to avoid geocoding the same destination repeatedly
  private destinationCache: Record<string, string> = {};

  // Helper to remove Vietnamese accents
  private removeAccents(str: string): string {
    if (!str) return '';
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase();
  }

  async searchPlaces(destination: string, query?: string, categoryName?: string) {
    const geoapifyKey = this.configService.get<string>('GEOAPIFY_API_KEY');
    let results: any[] = [];

    // 1. Search in local database
    let dbFilter: any = {};

    if (categoryName) {
      const category = await this.prisma.category.findFirst({
        where: { name: categoryName },
      });
      if (category) {
        dbFilter.categoryId = category.id;
      }
    }

    let localPlaces = await this.prisma.place.findMany({
      where: dbFilter,
      include: { category: true, photos: true },
    });

    // In-memory filter for destination to support accent-insensitive matching
    if (destination && destination.trim() !== '') {
      const normalizedDest = this.removeAccents(destination.trim());
      localPlaces = localPlaces.filter(place => {
        const normalizedName = this.removeAccents(place.name);
        const normalizedAddress = this.removeAccents(place.address);
        return normalizedName.includes(normalizedDest) || normalizedAddress.includes(normalizedDest);
      });
    }
    
    // In-memory filter for query to support accent-insensitive matching
    if (query && query.trim() !== '') {
      const normalizedQuery = this.removeAccents(query.trim());
      const queryWords = normalizedQuery.split(/\s+/);
      
      localPlaces = localPlaces.filter(place => {
        const normalizedName = this.removeAccents(place.name);
        const normalizedAddress = this.removeAccents(place.address);
        const searchableText = `${normalizedName} ${normalizedAddress}`;
        
        // Every word in the query must exist in the searchable text
        return queryWords.every(word => searchableText.includes(word));
      });

      // Sort results by relevance: Name exact match > Name starts with > Name contains > Address match
      localPlaces.sort((a, b) => {
        const normNameA = this.removeAccents(a.name);
        const normNameB = this.removeAccents(b.name);
        
        const getScore = (name: string) => {
          if (name === normalizedQuery) return 3;
          if (name.startsWith(normalizedQuery)) return 2;
          if (name.includes(normalizedQuery)) return 1;
          return 0;
        };

        const scoreA = getScore(normNameA);
        const scoreB = getScore(normNameB);

        return scoreB - scoreA;
      });
    }

    // Map local places to common format
    results.push(...localPlaces);

    // 2. Fetch from Geoapify if API key exists and we are actually searching (not just loading all places)
    if (geoapifyKey && (query || categoryName) && destination) {
      try {
        // Step A: Get Place ID for destination
        let destPlaceId = this.destinationCache[destination];
        if (!destPlaceId) {
          const geocodeUrl = `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(destination)}&limit=1&apiKey=${geoapifyKey}`;
          const geocodeRes = await axios.get(geocodeUrl);
          if (geocodeRes.data.features && geocodeRes.data.features.length > 0) {
            destPlaceId = geocodeRes.data.features[0].properties.place_id;
            this.destinationCache[destination] = destPlaceId;
          }
        }

        if (destPlaceId) {
          let geoapifyFeatures: any[] = [];

          // Step B: Call Autocomplete or Places API
          if (query) {
            const autoUrl = `https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(query)}&filter=place:${destPlaceId}&limit=10&apiKey=${geoapifyKey}`;
            const autoRes = await axios.get(autoUrl);
            geoapifyFeatures = autoRes.data.features || [];
          } else if (categoryName) {
            // Map common Vietnamese categories to Geoapify categories
            const categoryMap: Record<string, string> = {
              'Nhà hàng': 'catering.restaurant',
              'Khách sạn': 'accommodation.hotel',
              'Quán ăn': 'catering.fast_food',
              'Cà phê': 'catering.cafe',
              'Trung tâm thương mại': 'commercial.shopping_mall',
              'Công viên': 'leisure.park',
              'Điểm tham quan': 'tourism.attraction',
            };
            
            const geoCat = categoryMap[categoryName];
            if (geoCat) {
              const placesUrl = `https://api.geoapify.com/v2/places?categories=${geoCat}&filter=place:${destPlaceId}&limit=15&apiKey=${geoapifyKey}`;
              const placesRes = await axios.get(placesUrl);
              geoapifyFeatures = placesRes.data.features || [];
            }
          }

          // Format Geoapify results to match our DB schema
          const mappedGeoapify = geoapifyFeatures
            .filter((f) => f.properties && f.properties.name) // only valid places with names
            .map((f) => {
              const props = f.properties;
              return {
                id: `geo_${props.place_id}`, // temporary string ID
                name: props.name,
                address: props.formatted || props.address_line2 || '',
                latitude: props.lat,
                longitude: props.lon,
                description: props.categories ? props.categories.join(', ') : '',
                price: 'Liên hệ',
                categoryId: null, // Let app handle if null
                image: 'https://via.placeholder.com/300?text=No+Image', // Geoapify free doesn't give images easily
                rating: 0,
                userRatingCount: 0,
                isExternal: true, // flag for the frontend
              };
            });

          // Merge and filter duplicates (simple name match)
          const localNames = new Set(localPlaces.map(p => p.name.toLowerCase()));
          for (const geoPlace of mappedGeoapify) {
            if (!localNames.has(geoPlace.name.toLowerCase())) {
              results.push(geoPlace);
            }
          }
        }
      } catch (error: any) {
        this.logger.error(`Geoapify error: ${error.message}`);
      }
    }

    return results;
  }
}
