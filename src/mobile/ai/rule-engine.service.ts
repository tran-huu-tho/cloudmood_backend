import { Injectable, Logger } from '@nestjs/common';

export interface TimeSlot {
  label: string;
  type: 'BREAKFAST_CAFE' | 'EARLY_MORNING_ACTIVITY' | 'MORNING_ACTIVITY' | 'LUNCH' | 'HOTEL_CHECKIN' | 'AFTERNOON_ACTIVITY' | 'DINNER' | 'NIGHT_ACTIVITY';
  startHour: number;
  endHour: number;
}

export const DAILY_TIME_SLOTS_DAY1: TimeSlot[] = [
  { label: '07:00 - 08:30', type: 'BREAKFAST_CAFE', startHour: 7, endHour: 8.5 },
  { label: '08:30 - 11:30', type: 'MORNING_ACTIVITY', startHour: 8.5, endHour: 11.5 },
  { label: '11:30 - 13:00', type: 'LUNCH', startHour: 11.5, endHour: 13 },
  { label: '13:00 - 14:00', type: 'HOTEL_CHECKIN', startHour: 13, endHour: 14 },
  { label: '14:00 - 17:30', type: 'AFTERNOON_ACTIVITY', startHour: 14, endHour: 17.5 },
  { label: '17:30 - 20:00', type: 'DINNER', startHour: 17.5, endHour: 20 },
  { label: '20:00 - 22:00', type: 'NIGHT_ACTIVITY', startHour: 20, endHour: 22 },
];

export const DAILY_TIME_SLOTS_OTHER_DAYS: TimeSlot[] = [
  { label: '05:30 - 07:30', type: 'EARLY_MORNING_ACTIVITY', startHour: 5.5, endHour: 7.5 },
  { label: '07:30 - 08:30', type: 'BREAKFAST_CAFE', startHour: 7.5, endHour: 8.5 },
  { label: '08:30 - 11:30', type: 'MORNING_ACTIVITY', startHour: 8.5, endHour: 11.5 },
  { label: '11:30 - 13:30', type: 'LUNCH', startHour: 11.5, endHour: 13.5 },
  { label: '13:30 - 17:30', type: 'AFTERNOON_ACTIVITY', startHour: 13.5, endHour: 17.5 },
  { label: '17:30 - 20:00', type: 'DINNER', startHour: 17.5, endHour: 20 },
  { label: '20:00 - 22:00', type: 'NIGHT_ACTIVITY', startHour: 20, endHour: 22 },
];

@Injectable()
export class RuleEngineService {
  private readonly logger = new Logger(RuleEngineService.name);

  /**
   * 1. HỆ THỐNG LUẬT CỨNG 1: LỌC BỎ ĐỊA ĐIỂM TÊN MỜ NHẠT / KHÔNG HỢP LỆ
   */
  isVagueOrInvalidPlaceName(name: string, destination: string): boolean {
    if (!name) return true;
    const cleanName = name.trim().toLowerCase();
    const cleanDest = destination.trim().toLowerCase();

    if (cleanName === cleanDest) return true;
    if (cleanName === 'cần thơ' || cleanName === 'đà lạt' || cleanName === 'đà nẵng' || cleanName === 'hà nội' || cleanName === 'tphcm' || cleanName === 'sài gòn') {
      return true;
    }
    if (cleanName.length <= 3) return true;

    return false;
  }

  /**
   * 2. HỆ THỐNG LUẬT CỨNG 2: LỌC THEO NGÂN SÁCH (PRICE LEVEL HARD FILTER)
   */
  filterByBudget(places: any[], budgetTier?: string): any[] {
    if (!budgetTier) return places;
    const b = budgetTier.toLowerCase();

    if (b.includes('tiết kiệm') || b.includes('bình dân') || b.includes('thấp')) {
      const filtered = places.filter((p) => {
        const pLevel = (p.priceLevel || '$').trim();
        return pLevel === '$' || pLevel === '$$';
      });
      return filtered.length >= 8 ? filtered : places;
    }

    if (b.includes('sang trọng') || b.includes('cao cấp') || b.includes('cao')) {
      const filtered = places.filter((p) => {
        const pLevel = (p.priceLevel || '$$').trim();
        return pLevel === '$$' || pLevel === '$$$';
      });
      return filtered.length >= 8 ? filtered : places;
    }

    return places;
  }

  /**
   * 3. HỆ THỐNG LUẬT CỨNG 3: LỌC THEO GIỜ MỞ CỬA THỰC TẾ (OPENING HOURS HARD FILTER)
   */
  isOpenAtTime(place: any, weekdayIdx: number, startHour: number, endHour: number): boolean {
    if (!place.openingHours) return true;
    try {
      const h = typeof place.openingHours === 'string' ? JSON.parse(place.openingHours) : place.openingHours;
      if (!h || typeof h !== 'object') return true;

      if (Array.isArray(h.weekday_text) && h.weekday_text.length === 7) {
        const wtIdx = weekdayIdx === 0 ? 6 : weekdayIdx - 1;
        const text = (h.weekday_text[wtIdx] || '').toLowerCase();
        if (text.includes('closed') || text.includes('đóng cửa')) return false;
      }

      const weekdayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const dayKey = weekdayKeys[weekdayIdx];
      if (Object.prototype.hasOwnProperty.call(h, dayKey)) {
        const val = h[dayKey];
        if (!val) return false;
        if (typeof val === 'string' && (val.toLowerCase().includes('closed') || val.toLowerCase().includes('đóng'))) {
          return false;
        }
      }
    } catch {
      /* ignore JSON parse errors */
    }
    return true;
  }

  /**
   * 4. HỆ THỐNG LUẬT CỨNG 4: LỌC THEO THỜI TIẾT (WEATHER HARD FILTER)
   */
  filterByWeather(places: any[], isRainy: boolean): any[] {
    if (!isRainy) return places;
    const indoorOnly = places.filter((p) => !this.isOutdoorPlace(p));
    return indoorOnly.length >= 10 ? indoorOnly : places;
  }

  /**
   * BÁN KÍNH KHOẢNG CÁCH GẦN (HAVERSINE)
   */
  calculateHaversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    if (!lat1 || !lng1 || !lat2 || !lng2) return 0;
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /**
   * Phân loại địa điểm xa ngoại ô (Outlier) cách trung tâm > 8km
   */
  detectOutlierPlaces(candidatePlaces: any[]): any[] {
    const validCoords = candidatePlaces.filter((p) => p.latitude && p.longitude);
    if (validCoords.length === 0) return [];

    const avgLat = validCoords.reduce((acc, p) => acc + Number(p.latitude), 0) / validCoords.length;
    const avgLng = validCoords.reduce((acc, p) => acc + Number(p.longitude), 0) / validCoords.length;

    return candidatePlaces.filter((p) => {
      if (!p.latitude || !p.longitude) return false;
      const dist = this.calculateHaversineKm(avgLat, avgLng, Number(p.latitude), Number(p.longitude));
      return dist >= 7.5; // Cách trung tâm từ 7.5km trở lên
    });
  }

  /**
   * Tối ưu hóa thứ tự di chuyển trong ngày theo thuật toán Nearest Neighbor Distance
   */
  optimizeDayRouteByDistance(dayPlaces: any[], candidatePlacesMap: Map<number, any>): any[] {
    if (dayPlaces.length <= 2) return dayPlaces;

    const result: any[] = [];
    const pool = [...dayPlaces];

    let currentItem = pool.shift();
    result.push(currentItem);

    while (pool.length > 0) {
      const currentPlace = candidatePlacesMap.get(Number(currentItem.placeId));
      let bestNextIdx = 0;

      if (currentPlace && currentPlace.latitude && currentPlace.longitude) {
        const cLat = Number(currentPlace.latitude);
        const cLng = Number(currentPlace.longitude);
        let minDistance = Infinity;

        for (let i = 0; i < pool.length; i++) {
          const candidate = candidatePlacesMap.get(Number(pool[i].placeId));
          if (candidate && candidate.latitude && candidate.longitude) {
            const dist = this.calculateHaversineKm(
              cLat,
              cLng,
              Number(candidate.latitude),
              Number(candidate.longitude),
            );
            if (dist < minDistance) {
              minDistance = dist;
              bestNextIdx = i;
            }
          }
        }
      }

      currentItem = pool.splice(bestNextIdx, 1)[0];
      result.push(currentItem);
    }

    return result;
  }

  /**
   * Trích xuất thông minh từ khóa tên riêng & chủ đề từ văn bản sở thích người dùng
   */
  extractSearchKeywords(customRequest?: string): string[] {
    if (!customRequest) return [];
    const text = customRequest.toLowerCase();
    const keywords: string[] = [];

    const cleanedText = text
      .replace(/tôi muốn/g, ' ')
      .replace(/muốn/g, ' ')
      .replace(/thích/g, ' ')
      .replace(/trong chuyến du lịch lần này/g, ' ')
      .replace(/trong chuyến đi lần này/g, ' ')
      .replace(/với lại/g, ' ')
      .replace(/đi chơi/g, ' ')
      .replace(/ghé thăm/g, ' ')
      .replace(/trải nghiệm/g, ' ');

    if (text.includes('biển đông')) keywords.push('biển đông', 'nhà hàng biển đông');
    if (text.includes('ninh kiều')) keywords.push('ninh kiều', 'bến ninh kiều', 'cầu ninh kiều', 'cầu đi bộ');
    if (text.includes('cái răng')) keywords.push('cái răng', 'chợ nổi cái răng', 'chợ nổi');
    if (text.includes('highland') || text.includes('highlands')) keywords.push('highlands', 'highland');
    if (text.includes('cồn sơn')) keywords.push('cồn sơn');
    if (text.includes('phong điền')) keywords.push('phong điền');
    if (text.includes('munirangsyaram')) keywords.push('munirangsyaram');
    if (text.includes('bảo an')) keywords.push('bảo an');
    if (text.includes('trúc lâm')) keywords.push('trúc lâm');

    if (text.includes('chùa') || text.includes('phật') || text.includes('tịnh xá') || text.includes('thiền viện') || text.includes('pagoda') || text.includes('đền') || text.includes('miếu')) {
      keywords.push('chùa', 'thiền viện', 'tịnh xá', 'pagoda', 'đền');
    }
    if (text.includes('hải sản') || text.includes('ốc')) {
      keywords.push('hải sản', 'ốc');
    }
    if (text.includes('bảo tàng') || text.includes('di tích')) {
      keywords.push('bảo tàng', 'di tích');
    }

    const words = cleanedText.split(/[\s,.;!?]+/).filter((w) => w.length >= 2);
    for (let i = 0; i < words.length - 1; i++) {
      const bigram = `${words[i]} ${words[i + 1]}`;
      if (bigram.length >= 4 && !['này tôi', 'cũng như', 'khá thích', 'được thì'].includes(bigram)) {
        keywords.push(bigram);
      }
    }

    return Array.from(new Set(keywords));
  }

  /**
   * Phân loại tự động Địa điểm Trong nhà (Indoor) hay Ngoài trời (Outdoor)
   */
  isOutdoorPlace(place: any): boolean {
    const catName = (place.category?.name || '').toLowerCase();
    const name = (place.name || '').toLowerCase();
    const desc = (place.description || '').toLowerCase();

    const outdoorKeywords = [
      'bãi biển', 'biển', 'công viên', 'núi', 'thác', 'đảo', 'đèo',
      'vườn', 'thung lũng', 'suối', 'hồ', 'sân vận động', 'ngoài trời',
      'tự nhiên', 'tour', 'quảng trường', 'đồi', 'rừng', 'ruộng bậc thang', 'chợ nổi', 'cầu đi bộ', 'cầu ninh kiều', 'cồn'
    ];

    const indoorKeywords = [
      'bảo tàng', 'trung tâm thương mại', 'tttm', 'rạp chiếu phim', 'spa',
      'siêu thị', 'khách sạn', 'homestay', 'resort', 'nhà hàng', 'quán ăn',
      'cà phê', 'cafe', 'quán bar', 'dinh', 'nhà thờ', 'triển lãm', 'karaoke'
    ];

    const text = `${catName} ${name} ${desc}`;

    const isIndoor = indoorKeywords.some((k) => text.includes(k));
    const isOutdoor = outdoorKeywords.some((k) => text.includes(k));

    if (isOutdoor && !isIndoor) return true;
    if (isIndoor) return false;

    return !['quán ăn', 'nhà hàng', 'cà phê', 'khách sạn', 'lưu trú'].some((k) => catName.includes(k));
  }

  /**
   * Chấm điểm mức độ phù hợp (Điểm nền = 50, Ưu tiên 70% cho Text Custom Request, 30% cho Danh mục)
   */
  scorePlaceRelevance(
    place: any,
    userParams: {
      categories?: string[];
      budget?: string;
      customRequest?: string;
    },
  ): number {
    let score = 50;

    const catName = (place.category?.name || '').toLowerCase();
    const name = (place.name || '').toLowerCase();
    const desc = (place.description || '').toLowerCase();
    const fullText = `${catName} ${name} ${desc}`;

    if (userParams.customRequest) {
      const cr = userParams.customRequest.toLowerCase();

      if (cr.includes('biển đông') && name.includes('biển đông')) score += 500;
      if ((cr.includes('ninh kiều') || cr.includes('cầu ninh kiều')) && (name.includes('ninh kiều') || desc.includes('ninh kiều'))) score += 400;
      if (cr.includes('chùa') || cr.includes('phật') || cr.includes('tịnh xá') || cr.includes('thiền viện')) {
        if (name.includes('chùa') || catName.includes('chùa') || name.includes('pagoda') || desc.includes('chùa') || name.includes('thiền viện') || name.includes('tịnh xá')) {
          score += 300;
        }
      }
      if (cr.includes('highland') && (name.includes('highland') || name.includes('highlands'))) score += 400;
      if ((cr.includes('chợ nổi') || cr.includes('cái răng')) && (name.includes('cái răng') || desc.includes('cái răng') || name.includes('chợ nổi'))) score += 400;

      const keywords = this.extractSearchKeywords(userParams.customRequest);
      for (const kw of keywords) {
        if (fullText.includes(kw)) score += 60;
      }
    }

    if (userParams.categories && userParams.categories.length > 0) {
      const isCatMatch = userParams.categories.some((c) => {
        const cl = c.toLowerCase().split('&')[0].trim();
        return catName.includes(cl) || cl.includes(catName);
      });
      if (isCatMatch) score += 30;
    }

    return score;
  }

  /**
   * Phân loại ứng viên thành các Nhóm Nhu cầu
   */
  groupPlacesByRole(candidatePlaces: any[]) {
    const hotels: any[] = [];
    const dining: any[] = [];
    const cafes: any[] = [];
    const activities: any[] = [];

    for (const p of candidatePlaces) {
      const cat = (p.category?.name || '').toLowerCase();
      const name = (p.name || '').toLowerCase();

      if (cat.includes('khách sạn') || cat.includes('homestay') || cat.includes('resort') || name.includes('khách sạn') || name.includes('homestay')) {
        hotels.push(p);
      } else if (cat.includes('cà phê') || cat.includes('cafe') || name.includes('cà phê') || name.includes('coffee') || name.includes('highland')) {
        cafes.push(p);
      } else if (cat.includes('quán ăn') || cat.includes('nhà hàng') || cat.includes('ẩm thực') || name.includes('quán') || name.includes('nhà hàng')) {
        dining.push(p);
      } else {
        activities.push(p);
      }
    }

    return { hotels, dining, cafes, activities };
  }
}
