import { Injectable, Logger, BadRequestException } from '@nestjs/common';
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

  async findAll(
    categoryName?: string,
    page?: number,
    limit?: number,
    query?: string,
    priceLevels?: string[],
    minRating?: number,
    amenities?: string[],
  ) {
    const where: any = { isApproved: true };

    if (categoryName && categoryName !== 'Tất cả' && categoryName !== 'Nổi bật') {
      const category = await this.prisma.category.findFirst({
        where: { name: categoryName },
      });
      if (category) {
        where.categoryId = category.id;
      } else {
        return [];
      }
    }

    if (query && query.trim() !== '') {
      where.OR = [
        { name: { contains: query, mode: 'insensitive' } },
        { address: { contains: query, mode: 'insensitive' } },
      ];
    }

    if (minRating !== undefined && !isNaN(minRating)) {
      where.rating = { gte: minRating };
    }

    if (priceLevels && priceLevels.length > 0) {
      where.priceLevel = { in: priceLevels };
    }

    let places = await this.prisma.place.findMany({
      where,
      include: { category: true, photos: true },
      orderBy: [
        { userRatingCount: { sort: 'desc', nulls: 'last' } },
        { rating: { sort: 'desc', nulls: 'last' } },
        { id: 'asc' },
      ],
    });

    if (amenities && amenities.length > 0) {
      places = places.filter(place => {
        if (!place.subCategories) return false;
        try {
          const placeAms: any[] = Array.isArray(place.subCategories)
            ? place.subCategories
            : JSON.parse(place.subCategories as string);
          if (!Array.isArray(placeAms)) return false;
          return amenities.every(am =>
            placeAms.some(pAm => pAm.toString().toLowerCase().includes(am.toLowerCase()))
          );
        } catch (e) {
          return false;
        }
      });
    }

    if (query && query.trim() !== '') {
      const normalizedQuery = this.removeAccents(query.trim());
      places.sort((a, b) => {
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

        if (scoreB !== scoreA) {
          return scoreB - scoreA;
        }

        const ratingCountA = a.userRatingCount || 0;
        const ratingCountB = b.userRatingCount || 0;
        if (ratingCountB !== ratingCountA) {
          return ratingCountB - ratingCountA;
        }

        const ratingA = a.rating || 0;
        const ratingB = b.rating || 0;
        return ratingB - ratingA;
      });
    }

    if (page && limit) {
      const skip = (page - 1) * limit;
      return places.slice(skip, skip + limit);
    }

    return places;
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

  async searchPlaces(
    destination: string,
    query?: string,
    categoryName?: string,
    priceLevels?: string[],
    minRating?: number,
    amenities?: string[],
  ) {
    const geoapifyKey = this.configService.get<string>('GEOAPIFY_API_KEY');
    let results: any[] = [];

    // 1. Search in local database
    // If categoryName provided, do partial/insensitive match on category name
    let categoryId: bigint | undefined;
    if (categoryName && categoryName.trim() !== '' && categoryName !== 'Tất cả' && categoryName !== 'Nổi bật') {
      const normalizedCat = this.removeAccents(categoryName.trim());
      const allCategories = await this.prisma.category.findMany();
      const matchedCat = allCategories.find(c =>
        this.removeAccents(c.name).includes(normalizedCat) ||
        normalizedCat.includes(this.removeAccents(c.name))
      );
      if (matchedCat) {
        categoryId = matchedCat.id;
      }
    }

    const dbFilter: any = { isApproved: true };
    if (categoryId) {
      dbFilter.categoryId = categoryId;
    }

    if (minRating !== undefined && !isNaN(minRating)) {
      dbFilter.rating = { gte: minRating };
    }

    if (priceLevels && priceLevels.length > 0) {
      dbFilter.priceLevel = { in: priceLevels };
    }

    let localPlaces = await this.prisma.place.findMany({
      where: dbFilter,
      include: { category: true, photos: true },
    });

    if (amenities && amenities.length > 0) {
      localPlaces = localPlaces.filter(place => {
        if (!place.subCategories) return false;
        try {
          const placeAms: any[] = Array.isArray(place.subCategories)
            ? place.subCategories
            : JSON.parse(place.subCategories as string);
          if (!Array.isArray(placeAms)) return false;
          return amenities.every(am =>
            placeAms.some(pAm => pAm.toString().toLowerCase().includes(am.toLowerCase()))
          );
        } catch (e) {
          return false;
        }
      });
    }

    // In-memory filter for destination to support accent-insensitive matching
    // Only use the first part of the destination (e.g. "Cần Thơ" from "Cần Thơ, Vietnam")
    if (destination && destination.trim() !== '') {
      const cityOnly = destination.split(',')[0].trim();
      const normalizedDest = this.removeAccents(cityOnly);
      const destWords = normalizedDest.split(/\s+/).filter(w => w.length > 1);
      localPlaces = localPlaces.filter(place => {
        const normalizedName = this.removeAccents(place.name);
        const normalizedAddress = this.removeAccents(place.address);
        const searchableText = `${normalizedName} ${normalizedAddress}`;
        // Match if ALL significant destination words found in place name or address
        return destWords.every(word => searchableText.includes(word));
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

        if (scoreB !== scoreA) {
          return scoreB - scoreA;
        }

        // If scores are equal, sort by userRatingCount (desc) and rating (desc)
        const ratingCountA = a.userRatingCount || 0;
        const ratingCountB = b.userRatingCount || 0;
        if (ratingCountB !== ratingCountA) {
          return ratingCountB - ratingCountA;
        }

        const ratingA = a.rating || 0;
        const ratingB = b.rating || 0;
        return ratingB - ratingA;
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
              'Địa điểm tham quan': 'tourism.attraction',
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

    // Sort final results by userRatingCount (desc) and rating (desc) if there's no search query
    if (!query || query.trim() === '') {
      results.sort((a, b) => {
        const ratingCountA = a.userRatingCount || 0;
        const ratingCountB = b.userRatingCount || 0;
        if (ratingCountB !== ratingCountA) {
          return ratingCountB - ratingCountA;
        }
        const ratingA = a.rating || 0;
        const ratingB = b.rating || 0;
        return ratingB - ratingA;
      });
    }

    return results;
  }

  async proposePlace(data: any) {
    if (!data.name || !data.categoryId) {
      throw new BadRequestException('Tên địa điểm và Danh mục không được để trống.');
    }

    return this.prisma.place.create({
      data: {
        name: data.name,
        description: data.description || '',
        latitude: data.latitude !== undefined ? parseFloat(data.latitude) : 0.0,
        longitude: data.longitude !== undefined ? parseFloat(data.longitude) : 0.0,
        address: data.address || '',
        price: data.price || 'Liên hệ',
        categoryId: BigInt(data.categoryId),
        image: data.image || '',
        rating: 4.5,
        userRatingCount: 1,
        phone: data.phone || null,
        website: data.website || null,
        priceLevel: data.priceLevel || 'MODERATE',
        isApproved: false, // Suggestions start as pending approval
      },
    });
  }
}
