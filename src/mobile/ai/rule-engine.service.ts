import { Injectable, Logger } from '@nestjs/common';

export interface TimeSlot {
  label: string;
  type: 'BREAKFAST_CAFE' | 'EARLY_MORNING_ACTIVITY' | 'MORNING_ACTIVITY' | 'LUNCH' | 'HOTEL_CHECKIN' | 'AFTERNOON_ACTIVITY' | 'DINNER' | 'NIGHT_ACTIVITY';
  startHour: number;
  endHour: number;
}

export const DAILY_TIME_SLOTS_DAY1: TimeSlot[] = [
  { label: '07:00 - 08:30', type: 'BREAKFAST_CAFE', startHour: 7, endHour: 8.5 },
  { label: '09:30 - 11:00', type: 'MORNING_ACTIVITY', startHour: 9.5, endHour: 11 },
  { label: '11:30 - 12:30', type: 'LUNCH', startHour: 11.5, endHour: 12.5 },
  { label: '13:30 - 15:00', type: 'HOTEL_CHECKIN', startHour: 13.5, endHour: 15 },
  { label: '16:00 - 17:30', type: 'DINNER', startHour: 16, endHour: 17.5 },
  { label: '18:30 - 22:00', type: 'NIGHT_ACTIVITY', startHour: 18.5, endHour: 22 },
];

export const DAILY_TIME_SLOTS_OTHER_DAYS: TimeSlot[] = [
  { label: '07:00 - 08:30', type: 'BREAKFAST_CAFE', startHour: 7, endHour: 8.5 },
  { label: '09:30 - 11:00', type: 'MORNING_ACTIVITY', startHour: 9.5, endHour: 11 },
  { label: '11:30 - 12:30', type: 'LUNCH', startHour: 11.5, endHour: 12.5 },
  { label: '13:30 - 15:00', type: 'AFTERNOON_ACTIVITY', startHour: 13.5, endHour: 15 },
  { label: '16:00 - 17:30', type: 'DINNER', startHour: 16, endHour: 17.5 },
  { label: '18:30 - 22:00', type: 'NIGHT_ACTIVITY', startHour: 18.5, endHour: 22 },
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
   * Phân loại mục đích thời gian thực tế của địa điểm
   */
  getPlaceBiologicalCategory(place: any): 'BREAKFAST' | 'DAYTIME_ATTRACTION' | 'DINNER' | 'NIGHT_ACTIVITY' {
    if (!place) return 'DAYTIME_ATTRACTION';
    const catName = (place.category?.name || '').toLowerCase();
    const name = (place.name || '').toLowerCase();
    const desc = (place.description || '').toLowerCase();
    const fullText = `${catName} ${name} ${desc}`;

    // 1. BƯỚC QUAN TRỌNG NHẤT: BẮT BUỘC kiểm tra Điểm tâm sáng & Cà phê ĐẦU TIÊN
    const isBreakfast = [
      'cà phê', 'cafe', 'coffee', 'highland', 'điểm tâm', 'bún', 'phở', 'bánh mì', 'hủ tiếu',
      'ăn sáng', 'quán sáng', 'bữa sáng', 'bánh cuộn', 'cháo', 'xôi', 'cà phê sáng'
    ].some((k) => fullText.includes(k));

    if (isBreakfast) return 'BREAKFAST';

    // 2. Địa điểm buổi tối / ban đêm: Chợ đêm, Cầu đi bộ, Bến Ninh Kiều, Bar, Pub, Karaoke, Phố đi bộ
    const isNightActivity = [
      'chợ đêm', 'cầu đi bộ', 'ninh kiều', 'bar', 'pub', 'club', 'karaoke', 'phố đi bộ', 'dạo sông', 'biển cần thơ'
    ].some((k) => fullText.includes(k));

    if (isNightActivity) return 'NIGHT_ACTIVITY';

    // 3. Bữa ăn / Nhà hàng / Quán ăn / Hải sản (Trưa & Tối)
    const isDinner = [
      'nhà hàng', 'quán ăn', 'hải sản', 'lẩu', 'nướng', 'bữa ăn', 'ẩm thực', 'quán'
    ].some((k) => fullText.includes(k));

    if (isDinner) return 'DINNER';

    // 4. Địa điểm ban ngày: Chùa, Thiền viện, Tịnh xá, Bảo tàng, Di tích, Công viên, Nông trại, Đền, Miếu, Nhà cổ, Chợ nổi
    return 'DAYTIME_ATTRACTION';
  }

  /**
   * Phân loại thuộc tính chung của địa điểm
   */
  getGeneralCategoryGroup(item: any): 'HOTEL' | 'CAFE' | 'DINING' | 'ATTRACTION' {
    if (!item) return 'ATTRACTION';
    const place = item.place || item;
    const catName = (place.category?.name || item.category?.name || '').toLowerCase();
    const name = (place.name || item.name || '').toLowerCase();
    const desc = (place.description || item.description || '').toLowerCase();
    const fullText = `${catName} ${name} ${desc}`;

    if (catName.includes('khách sạn') || catName.includes('homestay') || catName.includes('resort') || name.includes('khách sạn') || name.includes('homestay') || name.includes('resort')) {
      return 'HOTEL';
    }
    if (catName.includes('cà phê') || catName.includes('cafe') || name.includes('cà phê') || name.includes('coffee') || name.includes('highland')) {
      return 'CAFE';
    }
    if (catName.includes('quán ăn') || catName.includes('nhà hàng') || catName.includes('quán') || catName.includes('ẩm thực') || name.includes('quán') || name.includes('nhà hàng') || name.includes('hải sản') || name.includes('bún') || name.includes('phở') || name.includes('brunch') || name.includes('ốc')) {
      return 'DINING';
    }
    return 'ATTRACTION';
  }

  /**
   * RÀNG BUỘC CẤM 2 ĐỊA ĐIỂM CÙNG THUỘC TÍNH LIÊN TIẾP NHAU
   * Tránh 2 khách sạn, 2 quán café, 2 điểm tham quan/chùa, hoặc 2 nhà hàng/quán ăn nằm kề nhau trong lịch trình.
   */
  preventConsecutiveSameCategory(dayPlaces: any[], candidatePlacesMap: Map<number, any>): any[] {
    if (dayPlaces.length <= 2) return dayPlaces;

    const resolvePlace = (item: any) => {
      if (!item) return null;
      const pid = Number(item.placeId || item.id || item.place?.id);
      return candidatePlacesMap.get(pid) || item.place || item;
    };

    const result: any[] = [];
    const pool = [...dayPlaces];

    while (pool.length > 0) {
      if (result.length === 0) {
        result.push(pool.shift()!);
        continue;
      }

      const prevItem = result[result.length - 1];
      const prevPlace = resolvePlace(prevItem);
      const prevCat = this.getGeneralCategoryGroup(prevPlace);

      // Tìm điểm tiếp theo trong pool có thuộc tính/loại hình KHÁC loại hình của điểm vừa xếp
      let foundIdx = pool.findIndex((item) => {
        const p = resolvePlace(item);
        return this.getGeneralCategoryGroup(p) !== prevCat;
      });

      if (foundIdx !== -1) {
        result.push(pool.splice(foundIdx, 1)[0]);
      } else {
        result.push(pool.shift()!);
      }
    }

    // TỰ ĐỘNG KHẮC PHỤC: Nếu sau khi xếp vẫn còn 2 địa điểm cùng thuộc tính (VD: 2 Nhà hàng/Quán ăn liên tiếp)
    // Tự động chèn 1 địa điểm Tham quan/Cà phê khác vào giữa để ngăn chặn tuyệt đối.
    for (let i = 0; i < result.length - 1; i++) {
      const p1 = resolvePlace(result[i]);
      const p2 = resolvePlace(result[i + 1]);
      const cat1 = this.getGeneralCategoryGroup(p1);
      const cat2 = this.getGeneralCategoryGroup(p2);

      if (cat1 === cat2 && (cat1 === 'DINING' || cat1 === 'HOTEL' || cat1 === 'CAFE')) {
        let separatorPlace: any = null;
        for (const [id, candidate] of candidatePlacesMap.entries()) {
          const cCat = this.getGeneralCategoryGroup(candidate);
          if (cCat !== cat1) {
            const isAlreadyInDay = result.some((r) => Number(r.placeId || r.id || r.place?.id) === Number(id));
            if (!isAlreadyInDay) {
              separatorPlace = {
                placeId: Number(id),
                note: `Ghé thăm ${candidate.name} (${candidate.category?.name || 'Điểm đến'}) để trải nghiệm không gian giải trí giữa các bữa ăn.`,
              };
              break;
            }
          }
        }

        if (separatorPlace) {
          result.splice(i + 1, 0, separatorPlace);
          i++; // Bỏ qua phần tử vừa chèn
        }
      }
    }

    return result;
  }

  /**
   * Sắp xếp danh sách địa điểm trong 1 ngày theo đúng thứ tự nhịp sinh hoạt thực tế:
   * Slot 0: Ăn sáng & Cà phê
   * Slot 1: Tham quan sáng
   * Slot 2: Ăn trưa & Nghỉ ngơi (Bữa trưa)
   * Slot 3: Check-in Khách sạn (nếu Ngày 1) hoặc Vui chơi/Tham quan chiều
   * Slot 4: Ăn chiều/tối (Bữa tối)
   * Slot 5: Vui chơi & Chợ đêm buổi tối
   */
  sortDayPlacesByBiologicalSchedule(dayPlaces: any[], candidatePlacesMap: Map<number, any>, dayNumber: number = 1): any[] {
    if (dayPlaces.length <= 1) return dayPlaces;

    const breakfasts: any[] = [];
    const daytimeAttractions: any[] = [];
    const diningSpots: any[] = [];
    const nightActivities: any[] = [];
    const hotelPlaces: any[] = [];

    for (const item of dayPlaces) {
      const placeObj = candidatePlacesMap.get(Number(item.placeId || item.id || item.place?.id));
      const group = this.getGeneralCategoryGroup(placeObj);
      const bioType = this.getPlaceBiologicalCategory(placeObj);

      if (group === 'HOTEL') {
        hotelPlaces.push(item);
      } else if (bioType === 'BREAKFAST') {
        breakfasts.push(item);
      } else if (bioType === 'DINNER' || group === 'DINING') {
        diningSpots.push(item);
      } else if (bioType === 'NIGHT_ACTIVITY') {
        nightActivities.push(item);
      } else {
        daytimeAttractions.push(item);
      }
    }

    // 1. GUARANTEE BREAKFAST AT SLOT 0
    if (breakfasts.length === 0) {
      for (const [id, place] of candidatePlacesMap.entries()) {
        const cat = (place.category?.name || '').toLowerCase();
        const name = (place.name || '').toLowerCase();
        const full = `${cat} ${name}`;
        if (full.includes('cà phê') || full.includes('cafe') || full.includes('coffee') || full.includes('bún') || full.includes('phở') || full.includes('bánh mì') || full.includes('điểm tâm')) {
          const alreadyInDay = dayPlaces.some((dp) => Number(dp.placeId || dp.id) === Number(id));
          if (!alreadyInDay) {
            breakfasts.push({
              placeId: Number(id),
              note: `Thưởng thức điểm tâm sáng & cà phê nạp năng lượng tại ${place.name}.`,
            });
            break;
          }
        }
      }
      if (breakfasts.length === 0 && diningSpots.length > 0) {
        breakfasts.push(diningSpots.shift());
      }
    }

    const sortedBreakfasts = this.optimizeDayRouteByDistance(breakfasts, candidatePlacesMap);
    const sortedDaytime = this.optimizeDayRouteByDistance(daytimeAttractions, candidatePlacesMap);
    const sortedDining = this.optimizeDayRouteByDistance(diningSpots, candidatePlacesMap);
    const sortedNight = this.optimizeDayRouteByDistance(nightActivities, candidatePlacesMap);

    const result: any[] = [];

    // Slot 0 (07:00 - 08:30): Breakfast & Cafe
    if (sortedBreakfasts.length > 0) {
      result.push(sortedBreakfasts.shift());
    }

    // Slot 1 (09:30 - 11:00): Morning Attraction
    if (sortedDaytime.length > 0) {
      result.push(sortedDaytime.shift());
    }

    // Slot 2 (11:30 - 12:30): Lunch (Dining)
    if (sortedDining.length > 0) {
      result.push(sortedDining.shift());
    } else if (sortedDaytime.length > 0) {
      result.push(sortedDaytime.shift());
    }

    // Slot 3 (13:30 - 15:00): Day 1 Check-in Hotel OR Afternoon Activity
    if (dayNumber === 1 && hotelPlaces.length > 0) {
      result.push(hotelPlaces.shift());
    } else if (sortedDaytime.length > 0) {
      result.push(sortedDaytime.shift());
    }

    // Slot 4 (16:00 - 17:30): Dinner (Dining)
    if (sortedDining.length > 0) {
      result.push(sortedDining.shift());
    } else if (sortedDaytime.length > 0) {
      result.push(sortedDaytime.shift());
    }

    // Slot 5 (18:30 - 22:00): Night Activity
    if (sortedNight.length > 0) {
      result.push(sortedNight.shift());
    }

    // Add any remaining items
    result.push(...sortedBreakfasts, ...hotelPlaces, ...sortedDaytime, ...sortedDining, ...sortedNight);

    return this.preventConsecutiveSameCategory(result, candidatePlacesMap);
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
   * Trích xuất các yêu cầu ràng buộc địa điểm theo ngày từ text sở thích của người dùng
   * Ví dụ: "ghé thăm thiền viện trúc lâm phương nam ở ngày cuối cùng" => targetDay = totalDays
   */
  extractDayConstraints(customRequest?: string, totalDays: number = 1): Array<{ rawPlaceQuery: string; targetDay: number; dayLabel: string }> {
    if (!customRequest || !customRequest.trim()) return [];
    const text = customRequest.trim();
    const constraints: Array<{ rawPlaceQuery: string; targetDay: number; dayLabel: string }> = [];

    const parseDayNumber = (dayStr: string): number => {
      const clean = dayStr.toLowerCase().trim();
      if (clean.includes('cuối')) return totalDays;
      if (clean.includes('đầu')) return 1;
      const matchNum = clean.match(/\d+/);
      if (matchNum) {
        const num = parseInt(matchNum[0], 10);
        if (num >= 1 && num <= totalDays) return num;
        if (num > totalDays) return totalDays;
      }
      return 1;
    };

    const cleanPlaceQuery = (raw: string): string => {
      return raw
        .replace(/^(tôi muốn|tôi khá|tôi|mình|khách|ghé thăm|ghé|thăm|đi|trải nghiệm|viếng|tham quan|ăn|uống|ở|thử)\s+/i, '')
        .replace(/\s+(ở|vào|trong|vào lúc|vào sáng|vào chiều|vào tối)$/i, '')
        .trim();
    };

    const dayRegexStr = '(?:ngày cuối cùng|ngày cuối|hôm cuối|ngày đầu tiên|ngày đầu|hôm đầu|ngày thứ\\s*\\d+|ngày\\s*\\d+|hôm\\s*\\d+)';

    // Mẫu 1: [hành động/địa điểm] ... [ở/vào/ngày] [ngày X/ngày cuối]
    const pattern1 = new RegExp(
      `(?:ghé thăm|đi|đến|trải nghiệm|viếng|tham quan|ghé|ăn|uống)?\\s*([^,.;!\\n]+?)\\s+(?:ở|vào|trong|vào lúc|vào sáng|vào chiều|vào tối)?\\s*(${dayRegexStr})`,
      'gi',
    );

    // Mẫu 2: [ngày X/ngày cuối] ... [tên địa điểm]
    const pattern2 = new RegExp(
      `(${dayRegexStr})\\s*(?:thì|tôi muốn|muốn|đi|ghé|tham quan|viếng|trải nghiệm|ăn|uống)?\\s*([^,.;!\\n]+)`,
      'gi',
    );

    let match: RegExpExecArray | null;
    while ((match = pattern1.exec(text)) !== null) {
      const rawPlace = cleanPlaceQuery(match[1]);
      const dayStr = match[2];
      const targetDay = parseDayNumber(dayStr);
      if (rawPlace.length >= 3 && !['tôi', 'mình', 'khách', 'bạn'].includes(rawPlace.toLowerCase())) {
        constraints.push({
          rawPlaceQuery: rawPlace,
          targetDay,
          dayLabel: dayStr,
        });
      }
    }

    while ((match = pattern2.exec(text)) !== null) {
      const dayStr = match[1];
      const rawPlace = cleanPlaceQuery(match[2]);
      const targetDay = parseDayNumber(dayStr);
      if (rawPlace.length >= 3 && !['tôi', 'mình', 'khách', 'bạn'].includes(rawPlace.toLowerCase())) {
        if (!constraints.some((c) => c.rawPlaceQuery.toLowerCase() === rawPlace.toLowerCase())) {
          constraints.push({
            rawPlaceQuery: rawPlace,
            targetDay,
            dayLabel: dayStr,
          });
        }
      }
    }

    return constraints;
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
