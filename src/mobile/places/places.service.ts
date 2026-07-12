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
          include: { category: true },
        });
      }
    }
    return this.prisma.place.findMany({
      include: { category: true },
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

  async searchPlaces(destination: string, query?: string, categoryName?: string) {
    const geoapifyKey = this.configService.get<string>('GEOAPIFY_API_KEY');
    let results: any[] = [];

    // 1. Search in local database
    let dbFilter: any = {
      OR: [
        { address: { contains: destination, mode: 'insensitive' } },
        { name: { contains: destination, mode: 'insensitive' } },
      ],
    };

    if (query) {
      dbFilter = {
        AND: [
          dbFilter,
          {
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { address: { contains: query, mode: 'insensitive' } },
            ],
          },
        ],
      };
    }

    if (categoryName) {
      const category = await this.prisma.category.findFirst({
        where: { name: categoryName },
      });
      if (category) {
        if (dbFilter.AND) {
          dbFilter.AND.push({ categoryId: category.id });
        } else {
          dbFilter.categoryId = category.id;
        }
      }
    }

    const localPlaces = await this.prisma.place.findMany({
      where: dbFilter,
      include: { category: true },
    });
    
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
