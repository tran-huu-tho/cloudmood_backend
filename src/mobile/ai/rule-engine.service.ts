import { Injectable, Logger } from '@nestjs/common';

export interface TimeSlot {
  label: string;
  type:
    | 'EARLY_MARKET'
    | 'BREAKFAST_CAFE'
    | 'EARLY_MORNING_ACTIVITY'
    | 'MORNING_ACTIVITY'
    | 'LUNCH'
    | 'HOTEL_CHECKIN'
    | 'NOON_REST_INDOOR'
    | 'AFTERNOON_ACTIVITY'
    | 'DINNER'
    | 'NIGHT_ACTIVITY';
  startHour: number;
  endHour: number;
}

// ── BỘ KHUNG SLOT THỜI GIAN MẪU (TIME-SLOT MATRIX) ───────────────────────────

// A. KỊCH BẢN CHUẨN (STANDARD DAY 1 - CÓ KHÁCH SẠN / LƯU TRÚ)
export const DAILY_TIME_SLOTS_DAY1: TimeSlot[] = [
  { label: '07:00 - 08:30', type: 'BREAKFAST_CAFE',        startHour: 7,    endHour: 8.5  },
  { label: '08:30 - 10:30', type: 'MORNING_ACTIVITY',      startHour: 8.5,  endHour: 10.5 },
  { label: '10:30 - 12:30', type: 'MORNING_ACTIVITY',      startHour: 10.5, endHour: 12.5 },
  { label: '12:30 - 13:30', type: 'LUNCH',                 startHour: 12.5, endHour: 13.5 },
  { label: '13:30 - 15:00', type: 'HOTEL_CHECKIN',         startHour: 13.5, endHour: 15   },
  { label: '15:00 - 16:30', type: 'AFTERNOON_ACTIVITY',    startHour: 15,   endHour: 16.5 },
  { label: '16:30 - 18:00', type: 'AFTERNOON_ACTIVITY',    startHour: 16.5, endHour: 18   },
  { label: '18:00 - 19:00', type: 'DINNER',                startHour: 18,   endHour: 19   },
  { label: '19:00 - 22:00', type: 'NIGHT_ACTIVITY',        startHour: 19,   endHour: 22   },
];

// A. KỊCH BẢN CHUẨN (STANDARD OTHER DAYS - CÓ LƯU TRÚ)
export const DAILY_TIME_SLOTS_OTHER_DAYS: TimeSlot[] = [
  { label: '07:00 - 08:30', type: 'BREAKFAST_CAFE',        startHour: 7,    endHour: 8.5  },
  { label: '08:30 - 10:30', type: 'MORNING_ACTIVITY',      startHour: 8.5,  endHour: 10.5 },
  { label: '10:30 - 12:30', type: 'MORNING_ACTIVITY',      startHour: 10.5, endHour: 12.5 },
  { label: '12:30 - 13:30', type: 'LUNCH',                 startHour: 12.5, endHour: 13.5 },
  { label: '13:30 - 15:00', type: 'NOON_REST_INDOOR',      startHour: 13.5, endHour: 15   },
  { label: '15:00 - 16:30', type: 'AFTERNOON_ACTIVITY',    startHour: 15,   endHour: 16.5 },
  { label: '16:30 - 18:00', type: 'AFTERNOON_ACTIVITY',    startHour: 16.5, endHour: 18   },
  { label: '18:00 - 19:00', type: 'DINNER',                startHour: 18,   endHour: 19   },
  { label: '19:00 - 22:00', type: 'NIGHT_ACTIVITY',        startHour: 19,   endHour: 22   },
];

// B. KỊCH BẢN ĐẶC THÙ (CHỢ NỔI CÁI RĂNG / CẦN THƠ) - 10 slots
export const CANTHO_MARKET_TIME_SLOTS: TimeSlot[] = [
  { label: '05:30 - 07:30', type: 'EARLY_MARKET',          startHour: 5.5,  endHour: 7.5  },
  { label: '07:30 - 08:30', type: 'BREAKFAST_CAFE',        startHour: 7.5,  endHour: 8.5  },
  { label: '08:30 - 10:30', type: 'MORNING_ACTIVITY',      startHour: 8.5,  endHour: 10.5 },
  { label: '10:30 - 12:30', type: 'MORNING_ACTIVITY',      startHour: 10.5, endHour: 12.5 },
  { label: '12:30 - 13:30', type: 'LUNCH',                 startHour: 12.5, endHour: 13.5 },
  { label: '13:30 - 15:00', type: 'NOON_REST_INDOOR',      startHour: 13.5, endHour: 15   },
  { label: '15:00 - 16:30', type: 'AFTERNOON_ACTIVITY',    startHour: 15,   endHour: 16.5 },
  { label: '16:30 - 18:00', type: 'AFTERNOON_ACTIVITY',    startHour: 16.5, endHour: 18   },
  { label: '18:00 - 19:00', type: 'DINNER',                startHour: 18,   endHour: 19   },
  { label: '19:00 - 22:00', type: 'NIGHT_ACTIVITY',        startHour: 19,   endHour: 22   },
];

// C. KỊCH BẢN DU LỊCH 1 NGÀY (DAY TRIP / HAS_HOTEL = FALSE / SKIP_CHECKIN = TRUE)
export const DAY_TRIP_TIME_SLOTS: TimeSlot[] = [
  { label: '07:00 - 08:30', type: 'BREAKFAST_CAFE',        startHour: 7,    endHour: 8.5  },
  { label: '08:30 - 10:30', type: 'MORNING_ACTIVITY',      startHour: 8.5,  endHour: 10.5 },
  { label: '10:30 - 12:30', type: 'MORNING_ACTIVITY',      startHour: 10.5, endHour: 12.5 },
  { label: '12:30 - 13:30', type: 'LUNCH',                 startHour: 12.5, endHour: 13.5 },
  { label: '13:30 - 15:00', type: 'NOON_REST_INDOOR',      startHour: 13.5, endHour: 15   },
  { label: '15:00 - 16:30', type: 'AFTERNOON_ACTIVITY',    startHour: 15,   endHour: 16.5 },
  { label: '16:30 - 18:00', type: 'AFTERNOON_ACTIVITY',    startHour: 16.5, endHour: 18   },
  { label: '18:00 - 19:00', type: 'DINNER',                startHour: 18,   endHour: 19   },
  { label: '19:00 - 22:00', type: 'NIGHT_ACTIVITY',        startHour: 19,   endHour: 22   },
];

export interface AnchorTimeRequest {
  rawQuery: string;
  targetHour: number;
  targetMinute: number;
  slotLabel: string;
}

@Injectable()
export class RuleEngineService {
  private readonly logger = new Logger(RuleEngineService.name);

  /**
   * QUY TẮC 6 (HARD RULE 6): LỌC THEO PHÂN KHÚC NGÂN SÁCH (PRICE LEVEL HARD FILTER)
   */
  filterByBudget(places: any[], budgetTier?: string): any[] {
    if (!budgetTier) return places;
    const b = budgetTier.toLowerCase();

    if (b.includes('tiết kiệm') || b.includes('bình dân') || b.includes('thấp')) {
      const filtered = places.filter((p) => {
        const pLevel = (p.priceLevel || '$').trim();
        return pLevel === '$' || pLevel === '$$';
      });
      return filtered.length >= 6 ? filtered : places;
    }

    if (b.includes('sang trọng') || b.includes('cao cấp') || b.includes('cao')) {
      const filtered = places.filter((p) => {
        const pLevel = (p.priceLevel || '$$').trim();
        return pLevel === '$$' || pLevel === '$$$' || pLevel === '$$$$';
      });
      return filtered.length >= 6 ? filtered : places;
    }

    return places;
  }

  /**
   * QUY TẮC 5 (HARD RULE 5): LỌC THEO GIỜ MỞ CỬA THỰC TẾ (OPENING HOURS HARD FILTER)
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
   * LỌC THEO THỜI TIẾT (WEATHER HARD FILTER - IS_RAINY)
   */
  filterByWeather(places: any[], isRainy: boolean): any[] {
    // Kệ thời tiết khi tạo lịch trình, ứng dụng sẽ chỉ hiển thị badge Cảnh báo mưa trên UI
    return places;
  }

  /**
   * BÁN KÍNH KHOẢNG CÁCH GẦN (HAVERSINE KM)
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
   * TÍNH THỜI GIAN DI CHUYỂN DỰA TRÊN KHOẢNG CÁCH (> 10KM)
   * TravelTime = Math.round((distanceKm / 30) * 60) + 5 (phút dự phòng)
   */
  calculateTravelTimeMinutes(distanceKm: number): number {
    if (distanceKm <= 0) return 0;
    return Math.round((distanceKm / 30.0) * 60) + 5;
  }

  /**
   * Phân loại địa điểm xa ngoại ô (Outlier) cách trung tâm > 7.5km
   */
  detectOutlierPlaces(candidatePlaces: any[]): any[] {
    const validCoords = candidatePlaces.filter((p) => p.latitude && p.longitude);
    if (validCoords.length === 0) return [];

    const avgLat = validCoords.reduce((acc, p) => acc + Number(p.latitude), 0) / validCoords.length;
    const avgLng = validCoords.reduce((acc, p) => acc + Number(p.longitude), 0) / validCoords.length;

    return candidatePlaces.filter((p) => {
      if (!p.latitude || !p.longitude) return false;
      const dist = this.calculateHaversineKm(avgLat, avgLng, Number(p.latitude), Number(p.longitude));
      return dist >= 7.5;
    });
  }

  /**
   * QUY TẮC 3 (HARD RULE 3): TỐI ƯU TUYẾN ĐƯỜNG NGẮN NHẤT (NEAREST NEIGHBOR DISTANCE < 5KM)
   */
  optimizeDayRouteByDistance(dayPlaces: any[], candidatePlacesMap: Map<number, any>): any[] {
    if (dayPlaces.length <= 2) return dayPlaces;

    const result: any[] = [];
    const pool = [...dayPlaces];

    let currentItem = pool.shift();
    result.push(currentItem);

    while (pool.length > 0) {
      const currentPlace = candidatePlacesMap.get(Number(currentItem.placeId || currentItem.id || currentItem.place?.id));
      let bestNextIdx = 0;

      if (currentPlace && currentPlace.latitude && currentPlace.longitude) {
        const cLat = Number(currentPlace.latitude);
        const cLng = Number(currentPlace.longitude);
        let minDistance = Infinity;

        for (let i = 0; i < pool.length; i++) {
          const candidate = candidatePlacesMap.get(Number(pool[i].placeId || pool[i].id || pool[i].place?.id));
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
   * Kiểm tra tên địa điểm có mơ hồ hoặc là đại lý công ty lữ hành/vé xe không phải danh thắng
   */
  isVagueOrInvalidPlaceName(name: string, destination?: string): boolean {
    if (!name || name.trim().length <= 2) return true;
    const n = name.toLowerCase().trim();
    if (n.includes('homey travel') || n.includes('vé xe') || n.includes('cho thuê xe') || n.includes('đại lý vé')) {
      return true;
    }
    if (['địa điểm du lịch', 'quán ăn ngon', 'cà phê đẹp', 'khách sạn tốt'].includes(n)) return true;
    return false;
  }

  /**
   * Phân loại tự động Địa điểm Trong nhà (Indoor) hay Ngoài trời (Outdoor)
   */
  isOutdoorPlace(place: any): boolean {
    if (!place) return false;
    const catName = (place.category?.name || '').toLowerCase();
    const name = (place.name || '').toLowerCase();
    const desc = (place.description || '').toLowerCase();

    const outdoorKeywords = [
      'bãi biển', 'biển', 'công viên', 'núi', 'thác', 'đảo', 'đèo',
      'vườn', 'thung lũng', 'suối', 'hồ', 'sân vận động', 'ngoài trời',
      'tự nhiên', 'tour', 'quảng trường', 'đồi', 'rừng', 'ruộng bậc thang',
      'chợ nổi', 'cầu đi bộ', 'cầu ninh kiều', 'cồn', 'phố đi bộ', 'du thuyền',
    ];

    const indoorKeywords = [
      'bảo tàng', 'trung tâm thương mại', 'tttm', 'rạp chiếu phim', 'spa',
      'siêu thị', 'khách sạn', 'homestay', 'resort', 'nhà hàng', 'quán ăn',
      'cà phê', 'cafe', 'quán bar', 'dinh', 'nhà thờ', 'triển lãm', 'karaoke',
    ];

    const text = `${catName} ${name} ${desc}`;

    const isIndoor = indoorKeywords.some((k) => text.includes(k));
    const isOutdoor = outdoorKeywords.some((k) => text.includes(k));

    if (isOutdoor && !isIndoor) return true;
    if (isIndoor) return false;

    return !['quán ăn', 'nhà hàng', 'cà phê', 'khách sạn', 'lưu trú'].some((k) => catName.includes(k));
  }

  /**
   * Kiểm tra xem địa điểm có phải là Chùa / Thiền viện / Tịnh xá / Đền / Miếu
   */
  isPagodaPlace(place: any): boolean {
    if (!place) return false;
    const catName = (place.category?.name || '').toLowerCase();
    const name = (place.name || '').toLowerCase();
    const desc = (place.description || '').toLowerCase();
    const fullText = `${catName} ${name} ${desc}`;

    return [
      'chùa', 'tịnh xá', 'thiền viện', 'đền', 'miếu', 'pagoda', 'trúc lâm', 'phật',
    ].some((k) => fullText.includes(k));
  }

  /**
   * Kiểm tra xem địa điểm có thích hợp đi vào buổi tối (từ 19:00 - 22:00) hay không
   */
  isAppropriateForNight(place: any): boolean {
    if (!place) return false;
    const name = (place.name || '').toLowerCase();
    const catName = (place.category?.name || '').toLowerCase();
    const desc = (place.description || '').toLowerCase();
    const fullText = `${name} ${catName} ${desc}`;

    // 1. Cấm Bảo tàng, Nhà cổ, Di tích lịch sử
    if (fullText.includes('bảo tàng') || fullText.includes('museum') || fullText.includes('di tích') || fullText.includes('nhà cổ')) return false;

    // 2. Cấm Chùa, đền, miếu, nhà thờ, thiền viện, đình, mộ, tịnh xá
    if (
      fullText.includes('chùa') ||
      fullText.includes('thiền viện') ||
      fullText.includes('tịnh xá') ||
      fullText.includes('đền') ||
      fullText.includes('miếu') ||
      fullText.includes('nhà thờ') ||
      fullText.includes('mộ') ||
      fullText.includes('đình')
    ) {
      return false;
    }

    // 3. Cấm khu du lịch sinh thái, lò hủ tiếu, vườn trái cây, vườn sinh thái, cồn, trang trại, thiên nhiên, công ty travel/tour
    if (
      fullText.includes('sinh thái') ||
      fullText.includes('trái cây') ||
      fullText.includes('vườn cò') ||
      fullText.includes('lò hủ tiếu') ||
      fullText.includes('cồn') ||
      fullText.includes('làng hoa') ||
      fullText.includes('vườn hoa') ||
      fullText.includes('farm') ||
      fullText.includes('nông trại') ||
      fullText.includes('thiên nhiên') ||
      fullText.includes('homey') ||
      fullText.includes('travel') ||
      fullText.includes('tour') ||
      fullText.includes('danh thắng')
    ) {
      return false;
    }

    return true;
  }

  /**
   * Địa điểm CHỈ phù hợp buổi SÁNG SỚM (5h-9h) — ví dụ: Chợ Nổi, Chợ Cái Răng
   * Tuyệt đối không được xếp vào chiều hoặc tối.
   */
  isMorningOnlyPlace(place: any): boolean {
    if (!place) return false;
    const name = (place.name || '').toLowerCase();
    const desc = (place.description || '').toLowerCase();
    const fullText = `${name} ${desc}`;
    return (
      fullText.includes('chợ nổi') ||
      fullText.includes('cái răng') ||
      name.includes('chợ nổi') ||
      name.includes('cái răng')
    );
  }

  /**
   * Địa điểm CHỈ phù hợp buổi CHIỀU TỐI (từ 19:00 trở đi) — chợ đêm, cầu đi bộ, phố đi bộ
   * Tuyệt đối KHÔNG xếp vào buổi sáng, trưa hay chiều (Cấm Chợ Đêm Tây Đô lúc 14:00).
   */
  isEveningOnlyPlace(place: any): boolean {
    if (!place) return false;
    const name = (place.name || '').toLowerCase();
    const desc = (place.description || '').toLowerCase();
    const fullText = `${name} ${desc}`;
    return (
      name.includes('cầu cần thơ') ||
      name.includes('cầu đi bộ') ||
      name.includes('cầu quang trung') ||
      fullText.includes('chợ đêm') ||
      fullText.includes('phố đi bộ') ||
      fullText.includes('bến ninh kiều') ||
      name.includes('ninh kiều') ||
      name.includes('tây đô')
    );
  }

  /**
   * Phân loại thuộc tính chung của địa điểm
   */
  getGeneralCategoryGroup(item: any): 'HOTEL' | 'CAFE' | 'DINING' | 'PAGODA' | 'ATTRACTION' {
    if (!item) return 'ATTRACTION';
    const place = item.place || item;

    if (this.isPagodaPlace(place)) {
      return 'PAGODA';
    }

    const catName = (place.category?.name || item.category?.name || '').toLowerCase();
    const name = (place.name || item.name || '').toLowerCase();
    const desc = (place.description || item.description || '').toLowerCase();
    const fullText = `${catName} ${name} ${desc}`;

    if (catName.includes('khách sạn') || catName.includes('homestay') || catName.includes('resort') || name.includes('khách sạn') || name.includes('homestay') || name.includes('resort') || name.includes('hotel') || name.includes('nesta')) {
      return 'HOTEL';
    }
    if (catName.includes('cà phê') || catName.includes('cafe') || name.includes('cà phê') || name.includes('coffee') || name.includes('highland') || name.includes('hoa yên')) {
      return 'CAFE';
    }
    const diningKeywords = [
      'quán ăn', 'nhà hàng', 'quán', 'ẩm thực', 'hải sản', 'bún', 'phở', 'ốc',
      'bánh', 'lẩu', 'nướng', 'bbq', 'gà', 'spicy box', 'buffet', 'food',
      'eatery', 'cơm', 'cháo', 'lotte', 'kfc', 'jollibee', 'pizza', 'dê', 'bò',
      'hoa sứ', 'cây bưởi', 'đại ca'
    ];
    if (diningKeywords.some((k) => fullText.includes(k))) {
      return 'DINING';
    }
    return 'ATTRACTION';
  }

  /**
   * QUY TẮC 2 (HARD RULE 2): CẤM 2 ĐỊA ĐIỂM CÙNG THUỘC TÍNH LIÊN TIẾP NHAU
   * Ngăn chặn tuyệt đối 2 Khách sạn, 2 Cà phê, 2 Nhà hàng/Quán ăn, hoặc 2 Chùa/Thiền viện nằm kề nhau.
   */
  preventConsecutiveSameCategory(dayPlaces: any[], candidatePlacesMap: Map<number, any>): any[] {
    if (dayPlaces.length <= 1) return dayPlaces;

    const resolvePlace = (item: any) => {
      if (!item) return null;
      const pid = Number(item.placeId || item.id || item.place?.id);
      return candidatePlacesMap.get(pid) || item.place || item;
    };

    const isFoodCategory = (cat: string) => cat === 'DINING' || cat === 'CAFE';

    let result = [...dayPlaces];

    // CẤM TUYỆT ĐỐI 2 ĂN UỐNG / CÀ PHÊ KỀ NHAU HOẶC 2 KHÁCH SẠN / CHÙA KỀ NHAU
    for (let i = 0; i < result.length - 1; i++) {
      const p1 = resolvePlace(result[i]);
      const p2 = resolvePlace(result[i + 1]);
      const cat1 = this.getGeneralCategoryGroup(p1);
      const cat2 = this.getGeneralCategoryGroup(p2);

      const isConflict =
        (isFoodCategory(cat1) && isFoodCategory(cat2)) ||
        (cat1 === 'HOTEL' && cat2 === 'HOTEL') ||
        (cat1 === 'PAGODA' && cat2 === 'PAGODA');

      if (isConflict) {
        // Tìm điểm tham quan ATTRACTION thay thế cho điểm thứ 2
        let attractionReplacement: any = null;
        for (const [id, candidate] of candidatePlacesMap.entries()) {
          const cGroup = this.getGeneralCategoryGroup(candidate);
          if (cGroup === 'ATTRACTION') {
            const alreadyInDay = result.some((r) => Number(r.placeId || r.id || r.place?.id) === Number(id));
            if (!alreadyInDay) {
              attractionReplacement = {
                placeId: Number(id),
                note: `Tham quan ${candidate.name} để giải trí giữa các điểm dừng chân.`,
              };
              break;
            }
          }
        }

        if (attractionReplacement) {
          result[i + 1] = attractionReplacement;
        } else {
          // Xóa điểm thứ 2 trùng lặp nếu không có điểm thay thế
          result.splice(i + 1, 1);
          i--;
        }
      }
    }

    return result;
  }

  /**
   * Phân loại mục đích thời gian sinh hoạt thực tế của địa điểm
   */
  getPlaceBiologicalCategory(place: any): 'EARLY_MARKET' | 'BREAKFAST' | 'DAYTIME_ATTRACTION' | 'DINNER' | 'NIGHT_ACTIVITY' {
    if (!place) return 'DAYTIME_ATTRACTION';
    const catName = (place.category?.name || '').toLowerCase();
    const name = (place.name || '').toLowerCase();
    const desc = (place.description || '').toLowerCase();
    const fullText = `${catName} ${name} ${desc}`;

    if (name.includes('chợ nổi') || name.includes('cái răng') || desc.includes('chợ nổi')) {
      return 'EARLY_MARKET';
    }

    const isBreakfast = [
      'cà phê', 'cafe', 'coffee', 'highland', 'điểm tâm', 'bún', 'phở', 'bánh mì', 'hủ tiếu',
      'ăn sáng', 'quán sáng', 'bữa sáng', 'bánh cuộn', 'cháo', 'xôi', 'cà phê sáng',
    ].some((k) => fullText.includes(k));

    if (isBreakfast) return 'BREAKFAST';

    const isNightActivity = [
      'chợ đêm', 'cầu đi bộ', 'ninh kiều', 'bar', 'pub', 'club', 'karaoke', 'phố đi bộ', 'dạo sông', 'biển cần thơ',
      'cầu cần thơ', 'cầu quang trung', 'bến tàu',
    ].some((k) => fullText.includes(k));

    if (isNightActivity) return 'NIGHT_ACTIVITY';

    const isDinner = [
      'nhà hàng', 'quán ăn', 'hải sản', 'lẩu', 'nướng', 'bữa ăn', 'ẩm thực', 'quán',
    ].some((k) => fullText.includes(k));

    if (isDinner) return 'DINNER';

    return 'DAYTIME_ATTRACTION';
  }

  /**
   * NGOẠI LỆ 1: KHÁCH YÊU CẦU GIỜ CỤ THỂ (ANCHOR LOCKS OVERRIDE)
   * Phân tích các yêu cầu như "Bến Ninh Kiều lúc 17:00", "Ăn trưa lúc 12:00", "Ăn tối lúc 20:00"
   */
  extractAnchorTimeRequests(customRequest?: string): AnchorTimeRequest[] {
    if (!customRequest || !customRequest.trim()) return [];
    const text = customRequest.trim().toLowerCase();
    const anchors: AnchorTimeRequest[] = [];

    const timePattern = /(?:đi|ghé|đến|ăn trưa|ăn tối|ăn|tham quan|viếng)?\s*([^,.;!]+?)\s+(?:lúc|vào|vào lúc)\s*(\d{1,2})(?:h|:|\s*giờ)\s*(\d{1,2})?/gi;

    let match: RegExpExecArray | null;
    while ((match = timePattern.exec(text)) !== null) {
      const rawPlace = match[1].trim();
      const hour = parseInt(match[2], 10);
      const min = match[3] ? parseInt(match[3], 10) : 0;

      if (hour >= 5 && hour <= 23 && rawPlace.length >= 2) {
        const startStr = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
        anchors.push({
          rawQuery: rawPlace,
          targetHour: hour,
          targetMinute: min,
          slotLabel: `${startStr} - ${startStr}`,
        });
      }
    }

    return anchors;
  }

  /**
   * NGOẠI LỆ 2: CẤP CỨU LỊCH TRÌNH KHUYẾN CÁO THỜI TIẾT ĐỘT NGỘT XẤU (IS_RAINY = TRUE)
   * Tự động quét tất cả các điểm PENDING ngoài trời (isOutdoor = true) và swap bằng điểm Indoor
   */
  handleEmergencyWeather(dayPlaces: any[], candidatePlacesMap: Map<number, any>, isRainy: boolean): any[] {
    // Không tự động đổi điểm outdoor thành indoor khi mưa, giữ nguyên điểm đi chơi
    return dayPlaces;
  }

  /**
   * BỔ SUNG CÁC CỜ TRẠNG THÁI & CẢNH BÁO SỔ TAY HÀNH TRÌNH (TRIP NOTEBOOK & NOTIFICATION)
   */
  enrichPlacesWithStatusAndNotificationFlags(places: any[]): any[] {
    return places.map((p, idx) => ({
      ...p,
      status: p.status || 'PENDING', // PENDING, CHECKED_IN, SKIPPED
      notifyBeforeMinutes: p.notifyBeforeMinutes || 15,
      sortOrder: idx,
    }));
  }

  /**
   * NGOẠI LỆ 5: KHÁCH CHÈN ĐỊA ĐIỂM MỚI ĐỘT NGỘT (DURATION SHRINKING & SHIFTING)
   * Thu gọn thời gian các điểm lân cận từ 90p xuống 60p để nhường chỗ
   */
  insertPlaceWithDurationShrink(dayPlaces: any[], newPlace: any, insertIndex: number): any[] {
    const updated = [...dayPlaces];
    updated.splice(insertIndex, 0, newPlace);

    for (let i = 0; i < updated.length; i++) {
      updated[i].suggestedDurationMinutes = 60;
    }

    return updated;
  }

  /**
   * Trộn ngẫu nhiên danh sách ứng viên (Fisher-Yates Shuffle)
   * Đảm bảo mọi địa điểm được chọn công bằng, không bị ưu ái địa điểm đứng đầu CSDL (như The Lighthouse Cần Thơ)
   */
  shuffleArray<T>(array: T[]): T[] {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /**
   * QUY TẮC 1 (HARD RULE 1): SẮP XẾP TOÀN BỘ ĐỊA ĐIỂM THEO NHỊP SINH HOẠT & MA TRẬN SLOT
   */
  sortDayPlacesByBiologicalSchedule(
    dayPlaces: any[],
    candidatePlacesMap: Map<number, any>,
    dayNumber: number = 1,
    options?: {
      destination?: string;
      customRequest?: string;
      hasHotel?: boolean;
      isRainy?: boolean;
      globalUsedIds?: Set<number>; // cross-day dedup
    },
  ): any[] {
    if (dayPlaces.length === 0) return [];

    const dest = (options?.destination || '').toLowerCase();
    const cr = (options?.customRequest || '').toLowerCase();
    const isCanTho = dest.includes('cần thơ') || cr.includes('chợ nổi');
    const isDayTrip = options?.hasHotel === false || cr.includes('1 ngày') || cr.includes('trong ngày');
    const isRainy = options?.isRainy === true;

    let processedPlaces = this.handleEmergencyWeather(dayPlaces, candidatePlacesMap, isRainy);

    const earlyMarketPlaces: any[] = [];
    const rawBreakfasts: any[] = [];
    const rawDaytimeAttractions: any[] = [];
    const rawDiningSpots: any[] = [];
    const rawNightActivities: any[] = [];
    const hotelPlaces: any[] = [];

    for (const item of processedPlaces) {
      const placeObj = candidatePlacesMap.get(Number(item.placeId || item.id || item.place?.id));
      const group = this.getGeneralCategoryGroup(placeObj);
      const bioType = this.getPlaceBiologicalCategory(placeObj);

      if (bioType === 'EARLY_MARKET' && isCanTho) {
        earlyMarketPlaces.push(item);
      } else if (group === 'HOTEL') {
        hotelPlaces.push(item);
      } else if (bioType === 'BREAKFAST') {
        rawBreakfasts.push(item);
      } else if (bioType === 'DINNER' || group === 'DINING') {
        rawDiningSpots.push(item);
      } else if (bioType === 'NIGHT_ACTIVITY') {
        rawNightActivities.push(item);
      } else {
        rawDaytimeAttractions.push(item);
      }
    }

    // BẮT BUỘC TỐI THIỂU 4 ĐIỂM THAM QUAN CHO MỖI NGÀY
    while (rawDaytimeAttractions.length < 4) {
      let candidateFound = false;
      for (const [id, cp] of candidatePlacesMap.entries()) {
        const group = this.getGeneralCategoryGroup(cp);
        if (group === 'ATTRACTION') {
          const alreadyInDay = processedPlaces.some((dp) => Number(dp.placeId || dp.id) === Number(id)) ||
                               rawDaytimeAttractions.some((da) => Number(da.placeId || da.id) === Number(id));
          if (!alreadyInDay && !this.isVagueOrInvalidPlaceName(cp.name, dest)) {
            rawDaytimeAttractions.push({
              placeId: Number(id),
              note: `Tham quan ${cp.name} để trải nghiệm danh thắng địa phương.`,
            });
            candidateFound = true;
            break;
          }
        }
      }
      if (!candidateFound) break;
    }

    // TRỘN NGẪU NHIÊN TOÀN BỘ CÁC POOL ĐỂ ĐẢM BẢO CHỌN CÔNG BẰNG (TRÁNH THE LIGHTHOUSE LUÔN BỊ CHỌN DO Ở ĐẦU CSDL)
    const breakfasts = this.shuffleArray(rawBreakfasts);
    const diningSpots = this.shuffleArray(rawDiningSpots);
    const daytimeAttractions = this.shuffleArray(rawDaytimeAttractions);
    const nightActivities = this.shuffleArray(rawNightActivities);

    // TỐI ƯU HOÁ KHOẢNG CÁCH NGẮN NHẤT TRONG TỪNG PHÂN PHÚC BẰNG HARD RULE 3
    const sortedEarly = this.optimizeDayRouteByDistance(earlyMarketPlaces, candidatePlacesMap);
    const sortedBreakfasts = this.optimizeDayRouteByDistance(breakfasts, candidatePlacesMap);
    const sortedDaytime = this.optimizeDayRouteByDistance(daytimeAttractions, candidatePlacesMap);
    const sortedDining = this.optimizeDayRouteByDistance(diningSpots, candidatePlacesMap);
    const sortedNight = this.optimizeDayRouteByDistance(nightActivities, candidatePlacesMap);

    const result: any[] = [];

    // HÀM CHỌN ĐỊA ĐIỂM ĐẢM BẢO ĐÚNG THUỘC TÍNH BẮT BUỘC CHO MỖI SLOT (ĐÃ KHẮC PHỤC TRÙNG LẶP LIÊN TIẾP):
    // IDs đã dùng ở các NGÀY KHÁC (cross-day dedup)
    const globalUsedIds: Set<number> = options?.globalUsedIds || new Set();

    // Slot 0 = sáng sớm (ăn sáng/café), slot NIGHT_SLOT = tối
    const isBreakfastSlot = (s: number) => s === 0;

    const pickPlaceForSlot = (allowedGroups: Array<'DINING' | 'CAFE' | 'ATTRACTION' | 'HOTEL'>, s: number): any => {
      let lastGroup: string | null = null;
      let lastCatName: string | null = null;

      if (result.length > 0) {
        const lastItem = result[result.length - 1];
        const lastPlaceObj = candidatePlacesMap.get(Number(lastItem.placeId || lastItem.id || lastItem.place?.id));
        if (lastPlaceObj) {
          lastGroup = this.getGeneralCategoryGroup(lastPlaceObj);
          lastCatName = (lastPlaceObj.category?.name || '').toLowerCase();
        }
      }

      const isNightSlot = (targetLength <= 7 && s >= 6) ||
                          (targetLength === 8 && s >= 7) ||
                          (targetLength === 9 && s >= 7) ||
                          (targetLength >= 10 && s >= 8);

      const isConflictingGroup = (grp: string, catName?: string) => {
        if (!lastGroup) return false;

        // 1. Cấm 2 ăn uống liên tiếp (DINING-DINING, DINING-CAFE, CAFE-DINING, CAFE-CAFE)
        const isFood = (g: string) => g === 'DINING' || g === 'CAFE';
        if (isFood(lastGroup) && isFood(grp)) return true;

        // 2. Cấm 2 khách sạn liên tiếp
        if (lastGroup === 'HOTEL' && grp === 'HOTEL') return true;

        // 3. Cấm đi liên tiếp 2 cái chung danh mục chi tiết (Ví dụ: TTTM ➔ TTTM, Công viên ➔ Công viên)
        if (lastCatName && catName) {
          const currCat = catName.toLowerCase();
          if (lastCatName === currCat && lastCatName !== '' && lastCatName !== 'khác') {
            return true;
          }
        }

        return false;
      };

      // Helper: kiểm tra 1 candidate có hợp lệ theo thời gian của slot không
      const isTimeAppropriate = (cp: any): boolean => {
        if (!cp) return false;
        const pid = Number(cp.id || cp.placeId);
        // CẤM TUYỆT ĐỐI TRÙNG LẶP ĐỊA ĐIỂM TRONG CÙNG NGÀY HOẶC GIỮA CÁC NGÀY
        if (globalUsedIds.has(pid)) return false;
        if (result.some((r) => Number(r.placeId || r.id || r.place?.id) === pid)) return false;

        // Cấm khách sạn ở các ngày sau (Ngày 2 trở đi)
        if (dayNumber > 1 && this.getGeneralCategoryGroup(cp) === 'HOTEL') return false;

        // TỐI ĐA 1 CHÙA/THIỀN VIỆN MỖI NGÀY
        if (this.isPagodaPlace(cp)) {
          const countPagodasInDay = result.filter((r) => {
            const pObj = candidatePlacesMap.get(Number(r.placeId || r.id || r.place?.id));
            return this.isPagodaPlace(pObj);
          }).length;
          if (countPagodasInDay >= 1) return false;
        }

        // Night slot: chỉ nhận địa điểm night-appropriate
        if (isNightSlot && !this.isAppropriateForNight(cp)) return false;
        // Daytime slot (không phải night): cấm địa điểm evening-only
        if (!isNightSlot && this.isEveningOnlyPlace(cp)) return false;
        // Morning-only (Chợ Nổi...): chỉ được ở slot 0
        if (this.isMorningOnlyPlace(cp) && s !== 0) return false;
        // Breakfast slot (s=0): cấm nhà hàng đầy đủ (chỉ nhận café/đồ ăn sáng nhẹ)
        if (isBreakfastSlot(s)) {
          const catN = (cp.category?.name || '').toLowerCase();
          const nm = (cp.name || '').toLowerCase();
          if (catN.includes('nhà hàng') || nm.includes('nhà hàng') || nm.includes('buffet') || nm.includes('restaurant')) return false;
        }
        return true;
      };

      // 1. Kiểm tra trong các pool đã phân loại (Ưu tiên nhóm không xung đột)
      for (const grp of allowedGroups) {
        if (grp === 'DINING' && sortedDining.length > 0) {
          const appIdx = sortedDining.findIndex((item) => {
            const cp = candidatePlacesMap.get(Number(item.placeId || item.id || item.place?.id));
            return isTimeAppropriate(cp);
          });
          if (appIdx !== -1) {
            const matchedItem = sortedDining.splice(appIdx, 1)[0];
            if (!isConflictingGroup(grp, candidatePlacesMap.get(Number(matchedItem.placeId || matchedItem.id || matchedItem.place?.id))?.category?.name)) {
              return matchedItem;
            }
          }
        }
        if (grp === 'CAFE' && sortedBreakfasts.length > 0) {
          const appIdx = sortedBreakfasts.findIndex((item) => {
            const cp = candidatePlacesMap.get(Number(item.placeId || item.id || item.place?.id));
            return isTimeAppropriate(cp);
          });
          if (appIdx !== -1) {
            const matchedItem = sortedBreakfasts.splice(appIdx, 1)[0];
            if (!isConflictingGroup(grp, candidatePlacesMap.get(Number(matchedItem.placeId || matchedItem.id || matchedItem.place?.id))?.category?.name)) {
              return matchedItem;
            }
          }
        }
        if (grp === 'ATTRACTION' && sortedDaytime.length > 0) {
          const appIdx = sortedDaytime.findIndex((item) => {
            const cp = candidatePlacesMap.get(Number(item.placeId || item.id || item.place?.id));
            return isTimeAppropriate(cp);
          });
          if (appIdx !== -1) {
            const matchedItem = sortedDaytime.splice(appIdx, 1)[0];
            if (!isConflictingGroup(grp, candidatePlacesMap.get(Number(matchedItem.placeId || matchedItem.id || matchedItem.place?.id))?.category?.name)) {
              return matchedItem;
            }
          }
        }
        if (grp === 'ATTRACTION' && sortedNight.length > 0) {
          const appIdx = sortedNight.findIndex((item) => {
            const cp = candidatePlacesMap.get(Number(item.placeId || item.id || item.place?.id));
            return isTimeAppropriate(cp);
          });
          if (appIdx !== -1) {
            const matchedItem = sortedNight.splice(appIdx, 1)[0];
            if (!isConflictingGroup(grp, candidatePlacesMap.get(Number(matchedItem.placeId || matchedItem.id || matchedItem.place?.id))?.category?.name)) {
              return matchedItem;
            }
          }
        }
        if (grp === 'HOTEL' && hotelPlaces.length > 0) {
          const appIdx = hotelPlaces.findIndex((item) => {
            const cp = candidatePlacesMap.get(Number(item.placeId || item.id || item.place?.id));
            return isTimeAppropriate(cp);
          });
          if (appIdx !== -1) {
            const matchedItem = hotelPlaces.splice(appIdx, 1)[0];
            if (!isConflictingGroup(grp, candidatePlacesMap.get(Number(matchedItem.placeId || matchedItem.id || matchedItem.place?.id))?.category?.name)) {
              return matchedItem;
            }
          }
        }
      }

      // 2. Tìm trong candidatePlacesMap ngẫu nhiên địa điểm CHƯA SỬ DỤNG
      const shuffledCandidates = this.shuffleArray(Array.from(candidatePlacesMap.values()));
      for (const grp of allowedGroups) {
        for (const cp of shuffledCandidates) {
          const cGroup = this.getGeneralCategoryGroup(cp);
          if (cGroup === grp) {
            const pid = Number(cp.id);
            if (!isConflictingGroup(grp, cp?.category?.name) && isTimeAppropriate(cp)) {
              return {
                placeId: pid,
              };
            }
          }
        }
      }

      // 3. Fallback: Lấy địa điểm chưa sử dụng ĐÚNG THUỘC TÍNH (allowedGroups)
      for (const grp of allowedGroups) {
        for (const cp of shuffledCandidates) {
          const cGroup = this.getGeneralCategoryGroup(cp);
          if (cGroup === grp && isTimeAppropriate(cp)) {
            return {
              placeId: Number(cp.id),
            };
          }
        }
      }

      // 4. Ultimate Fallback (khi cạn sạch địa điểm mới ở các ngày sau):
      // Đảm bảo 100% không bao giờ để trống slot hay ít hơn 9 địa điểm/ngày.
      // Ép chọn địa điểm đúng Category CHƯA XUẤT HIỆN TRONG CÙNG NGÀY NÀY.
      for (const grp of allowedGroups) {
        for (const [id, cp] of candidatePlacesMap.entries()) {
          const cGroup = this.getGeneralCategoryGroup(cp);
          if (cGroup === grp) {
            const pid = Number(id);
            const inCurrentDay = result.some((r) => Number(r.placeId || r.id || r.place?.id) === pid);
            if (!inCurrentDay) {
              if (dayNumber > 1 && cGroup === 'HOTEL') continue;
              if (isNightSlot && !this.isAppropriateForNight(cp)) continue;
              if (isBreakfastSlot(s)) {
                const fullT = `${cp.category?.name || ''} ${cp.name || ''}`.toLowerCase();
                if (['buffet', 'lẩu', 'nướng', 'bbq', 'nhậu', 'hải sản', 'yaki', 'nhà hàng'].some((k) => fullT.includes(k))) continue;
              }
              return { placeId: pid };
            }
          }
        }
      }

      return null;
    };

    const targetLength = dayPlaces && dayPlaces.length > 0 ? dayPlaces.length : 9;
    const firstPlaceId = dayPlaces && dayPlaces[0] ? (dayPlaces[0].placeId || dayPlaces[0].id || dayPlaces[0].place?.id) : null;
    const firstPlaceObj = firstPlaceId ? candidatePlacesMap.get(Number(firstPlaceId)) : null;
    const isEarlyMarket = firstPlaceObj && (firstPlaceObj.name || '').toLowerCase().includes('chợ nổi');
    let slotsConfig: Array<Array<'DINING' | 'CAFE' | 'ATTRACTION' | 'HOTEL'>> = [];

    if (isEarlyMarket) {
      slotsConfig = [
        ['ATTRACTION'],              // Slot 0 (05:30-07:30): Chợ nổi
        ['CAFE'],                    // Slot 1 (07:30-08:30): Cà phê sáng & Điểm tâm
        ['ATTRACTION'],              // Slot 2 (08:30-10:30): Tham quan 1
        ['ATTRACTION'],              // Slot 3 (10:30-12:30): Tham quan 2
        ['DINING'],                  // Slot 4 (12:30-13:30): Ăn trưa
        dayNumber === 1 ? ['HOTEL'] : ['CAFE', 'ATTRACTION'], // Slot 5 (13:30-15:00)
        ['ATTRACTION'],              // Slot 6 (15:00-16:30): Tham quan 3
        ['ATTRACTION'],              // Slot 7 (16:30-18:00): Tham quan 4
        ['DINING'],                  // Slot 8 (18:00-19:00): Ăn tối
        ['ATTRACTION', 'CAFE'],      // Slot 9 (19:00-22:00): Vui chơi tối / Cà phê đêm
      ];
    } else {
      slotsConfig = [
        ['CAFE'],                    // Slot 0 (07:00-08:30): Cà phê sáng & Điểm tâm
        ['ATTRACTION'],              // Slot 1 (08:30-10:30): Tham quan 1
        ['ATTRACTION'],              // Slot 2 (10:30-12:30): Tham quan 2
        ['DINING'],                  // Slot 3 (12:30-13:30): Ăn trưa
        dayNumber === 1 ? ['HOTEL'] : ['CAFE', 'ATTRACTION'], // Slot 4 (13:30-15:00)
        ['ATTRACTION'],              // Slot 5 (15:00-16:30): Tham quan 3
        ['ATTRACTION'],              // Slot 6 (16:30-18:00): Tham quan 4 (Hoàng hôn)
        ['DINING'],                  // Slot 7 (18:00-19:00): Ăn tối
        ['ATTRACTION', 'CAFE'],      // Slot 8 (19:00-22:00): Vui chơi tối / Cà phê đêm
      ];
    }

    for (let s = 0; s < slotsConfig.length; s++) {
      if (s === 0 && isEarlyMarket) {
        if (sortedEarly.length > 0) {
          result.push(sortedEarly.shift());
          continue;
        }
      }

      const isHotelSlot = (!isEarlyMarket && s === 4) || (isEarlyMarket && s === 5);

      if (dayNumber === 1 && isHotelSlot && !isDayTrip) {
        if (hotelPlaces.length > 0) {
          result.push(hotelPlaces.shift());
        } else {
          let foundHotel: any = null;
          for (const [id, cp] of candidatePlacesMap.entries()) {
            if (this.getGeneralCategoryGroup(cp) === 'HOTEL') {
              foundHotel = { placeId: Number(id) };
              break;
            }
          }
          if (foundHotel) {
            result.push(foundHotel);
          } else {
            const item = pickPlaceForSlot(slotsConfig[s], s);
            if (item) result.push(item);
          }
        }
      } else {
        const item = pickPlaceForSlot(slotsConfig[s], s);
        if (item) result.push(item);
      }
    }

    // Trả về trực tiếp lịch trình các slot qua hàm áp dụng khung giờ
    return this.applyElasticTimeline(result, candidatePlacesMap, options?.customRequest);
  }

  /**
   * TÍNH TOÁN VÀ CẤP PHÁT TIMELINE CO GIÃN LINH HOẠT (ELASTIC TIMELINE)
   * Có khoảng nghỉ/di chuyển 15-30 phút giữa các địa điểm kề nhau.
   */
  applyElasticTimeline(
    places: any[],
    candidatePlacesMap: Map<number, any>,
    customRequest?: string,
  ): any[] {
    if (places.length === 0) return [];

    const anchors = this.extractAnchorTimeRequests(customRequest);

    // BỘ KHUNG GIỜ CỨNG CỐ ĐỊNH CHUẨN CLOUDMOOD:
    const standardSlotMatrix = [
      { startTime: '07:00', endTime: '08:30' }, // Slot 0: Ăn sáng & Cà phê
      { startTime: '08:30', endTime: '10:30' }, // Slot 1: Đi chơi sáng 1
      { startTime: '10:30', endTime: '12:30' }, // Slot 2: Đi chơi sáng 2
      { startTime: '12:30', endTime: '13:30' }, // Slot 3: Ăn trưa
      { startTime: '13:30', endTime: '15:00' }, // Slot 4: Nhận phòng (Ngày 1) / Nghỉ trưa (Ngày sau)
      { startTime: '15:00', endTime: '16:30' }, // Slot 5: Đi chơi chiều 1
      { startTime: '16:30', endTime: '18:00' }, // Slot 6: Đi chơi chiều 2 (Hoàng hôn)
      { startTime: '18:00', endTime: '19:00' }, // Slot 7: Ăn tối
      { startTime: '19:00', endTime: '22:00' }, // Slot 8: Vui chơi tối / Cà phê đêm
    ];

    const canThoSlotMatrix = [
      { startTime: '05:30', endTime: '07:30' }, // Slot 0: Chợ nổi Cái Răng
      { startTime: '07:30', endTime: '08:30' }, // Slot 1: Cà phê / Điểm tâm sáng
      { startTime: '08:30', endTime: '10:30' }, // Slot 2: Đi chơi sáng 1
      { startTime: '10:30', endTime: '12:30' }, // Slot 3: Đi chơi sáng 2
      { startTime: '12:30', endTime: '13:30' }, // Slot 4: Ăn trưa
      { startTime: '13:30', endTime: '15:00' }, // Slot 5: Nghỉ trưa / Cafe
      { startTime: '15:00', endTime: '16:30' }, // Slot 6: Đi chơi chiều 1
      { startTime: '16:30', endTime: '18:00' }, // Slot 7: Đi chơi chiều 2
      { startTime: '18:00', endTime: '19:00' }, // Slot 8: Ăn tối
      { startTime: '19:00', endTime: '22:00' }, // Slot 9: Vui chơi tối / Cà phê đêm
    ];

    const firstItem = places[0];
    const firstPlaceId = firstItem ? (firstItem.placeId || firstItem.id || firstItem.place?.id) : null;
    const firstPlaceObj = firstPlaceId ? candidatePlacesMap.get(Number(firstPlaceId)) : null;
    const isEarlyMarket = firstPlaceObj && (firstPlaceObj.name || '').toLowerCase().includes('chợ nổi');

    const activeMatrix = isEarlyMarket ? canThoSlotMatrix : standardSlotMatrix;

    return places.map((item, idx) => {
      const placeObj = candidatePlacesMap.get(Number(item.placeId || item.id || item.place?.id));

      let startTimeStr = '';
      let endTimeStr = '';

      // 1. Anchor Time override
      let hasAnchor = false;
      if (placeObj && anchors.length > 0) {
        const pName = (placeObj.name || '').toLowerCase();
        const matchedAnchor = anchors.find((a) => pName.includes(a.rawQuery) || a.rawQuery.includes(pName));
        if (matchedAnchor) {
          hasAnchor = true;
          let hStart = Math.min(matchedAnchor.targetHour + matchedAnchor.targetMinute / 60.0, 21.5);
          const startH = Math.floor(hStart);
          const startM = Math.round((hStart - startH) * 60);
          startTimeStr = `${startH.toString().padStart(2, '0')}:${startM.toString().padStart(2, '0')}`;

          const hEnd = Math.min(hStart + 1.5, 23.0);
          const endH = Math.floor(hEnd);
          const endM = Math.round((hEnd - endH) * 60);
          endTimeStr = `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;
        }
      }

      // 2. Chuẩn hóa theo Slot Matrix
      if (!hasAnchor) {
        const slotIdx = Math.min(idx, activeMatrix.length - 1);
        const slot = activeMatrix[slotIdx];
        startTimeStr = slot.startTime;
        endTimeStr = slot.endTime;
      }

      return {
        ...item,
        startTime: startTimeStr,
        endTime: endTimeStr,
        status: item.status || 'PENDING',
        notifyBeforeMinutes: 15,
        sortOrder: idx,
      };
    });
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

    const pattern1 = new RegExp(
      `(?:ghé thăm|đi|đến|trải nghiệm|viếng|tham quan|ghé|ăn|uống)?\\s*([^,.;!\\n]+?)\\s+(?:ở|vào|trong|vào lúc|vào sáng|vào chiều|vào tối)?\\s*(${dayRegexStr})`,
      'gi',
    );

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

  /**
   * TÍNH ĐIỂM TƯƠNG THÍCH ĐỊA ĐIỂM DỰA TRÊN 6 TIÊU CHÍ TRỌNG SỐ MASTER:
   * 1. Đúng sở thích & customRequest text (40%)
   * 2. Đúng danh mục theo slot (15%)
   * 3. Thời tiết (15%)
   * 4. Đúng ngân sách / chi phí (10%)
   * 5. Khoảng cách di chuyển tối ưu (10%)
   * 6. Giờ mở / đóng cửa (10%)
   */
  calculatePlaceScore(
    place: any,
    slotType: string,
    userCategories: string[] = [],
    customRequestText: string = '',
    userBudget: string = '',
    prevLat?: number,
    prevLng?: number,
    startHour: number = 8,
    endHour: number = 10,
  ): number {
    let score = 0;

    // 1. Sở thích & Custom Request (40%)
    let prefScore = 0;
    const pName = (place.name || '').toLowerCase();
    const pCat = (place.category?.name || '').toLowerCase();
    const pDesc = (place.description || '').toLowerCase();
    const fullText = `${pName} ${pCat} ${pDesc}`;

    if (userCategories && userCategories.length > 0) {
      const hasCategoryMatch = userCategories.some((c) => fullText.includes(c.toLowerCase()));
      if (hasCategoryMatch) prefScore += 0.5;
    }
    if (customRequestText && customRequestText.trim()) {
      const keywords = customRequestText.toLowerCase().split(/\s+/).filter((k) => k.length > 2);
      const matchCount = keywords.filter((k) => fullText.includes(k)).length;
      if (keywords.length > 0) {
        prefScore += 0.5 * Math.min(1, matchCount / Math.max(1, keywords.length));
      }
    } else if (!userCategories || userCategories.length === 0) {
      prefScore = 0.5;
    }
    score += 0.40 * Math.min(1, prefScore);

    // 2. Đúng danh mục theo slot (15%)
    let slotCatScore = 0;
    if (slotType === 'BREAKFAST_CAFE' && (pCat.includes('cà phê') || pCat.includes('cafe') || pCat.includes('ăn sáng') || pName.includes('cà phê'))) {
      slotCatScore = 1;
    } else if ((slotType === 'LUNCH' || slotType === 'DINNER') && (pCat.includes('ẩm thực') || pCat.includes('nhà hàng') || pCat.includes('quán ăn') || pName.includes('nhà hàng'))) {
      slotCatScore = 1;
    } else if (slotType === 'NIGHT_ACTIVITY' && (pName.includes('chợ đêm') || pName.includes('phố đi bộ') || pCat.includes('bar') || pName.includes('bến ninh kiều'))) {
      slotCatScore = 1;
    } else if (slotType.includes('ACTIVITY')) {
      slotCatScore = 0.8;
    }
    score += 0.15 * slotCatScore;

    // 3. Thời tiết (15%) - Ghi nhận thời tiết theo slot (mặc định 1.0 vì bỏ qua cấm/lọc thời tiết lúc khởi tạo)
    const weatherScore = 1.0;
    score += 0.15 * weatherScore;

    // 4. Đúng ngân sách (10%)
    let budgetScore = 1.0;
    if (userBudget) {
      const pLevel = (place.priceLevel || '$').trim();
      if (userBudget.toLowerCase().includes('tiết kiệm') && (pLevel === '$' || pLevel === '$$')) budgetScore = 1.0;
      else if (userBudget.toLowerCase().includes('cao cấp') && (pLevel === '$$$' || pLevel === '$$$$')) budgetScore = 1.0;
      else budgetScore = 0.7;
    }
    score += 0.10 * budgetScore;

    // 5. Khoảng cách di chuyển (10%)
    let distScore = 1.0;
    if (prevLat && prevLng && place.latitude && place.longitude) {
      const dist = this.calculateHaversineKm(prevLat, prevLng, Number(place.latitude), Number(place.longitude));
      if (dist <= 3) distScore = 1.0;
      else if (dist <= 7) distScore = 0.7;
      else if (dist <= 12) distScore = 0.4;
      else distScore = 0.1;
    }
    score += 0.10 * distScore;

    // 6. Giờ mở / đóng cửa (10%)
    let hoursScore = 1.0;
    if (!this.isOpenAtTime(place, 1, startHour, endHour)) {
      hoursScore = 0.2;
    }
    score += 0.10 * hoursScore;

    return score;
  }

  /**
   * THẦN HỘ VỆ SLOT (STRICT SLOT ENFORCER & SANITIZER)
   * Kiểm tra và thanh trừng tuyệt đối 100% mọi điểm vi phạm quy định cấm của từng slot
   */
  strictSanitizeItinerarySlots(
    days: any[],
    candidatePlacesMap: Map<number, any>,
    destination: string,
  ): any[] {
    const usedGlobalIds = new Set<number>();

    return days.map((dayObj) => {
      const isDay1 = dayObj.dayNumber === 1;
      const sanitizedPlaces: any[] = [];

      for (let slotIdx = 0; slotIdx < (dayObj.places || []).length; slotIdx++) {
        let placeItem = dayObj.places[slotIdx];
        let pid = Number(placeItem.placeId || placeItem.id || placeItem.place?.id);
        let placeObj = candidatePlacesMap.get(pid) || placeItem.place || placeItem;

        const isViolation = (p: any, sIdx: number): boolean => {
          if (!p) return true;
          const pId = Number(p.id || p.placeId);

          // 1. Cross-day & Same-day Dedup
          if (usedGlobalIds.has(pId)) return true;

          const catName = (p.category?.name || '').toLowerCase();
          const name = (p.name || '').toLowerCase();
          const group = this.getGeneralCategoryGroup(p);

          // 2. Ép buộc Khách sạn ở Slot Check-in (sIdx === 4) Ngày 1 và CẤM Khách sạn ở Ngày 2+ hoặc ở slot khác
          if (isDay1 && sIdx === 4) {
            if (group !== 'HOTEL') return true;
          } else if (group === 'HOTEL') {
            return true;
          }

          // 3. Cấm Slot Tối (sIdx >= 8 hoặc mốc 19:00 - 22:00) đối với Bảo tàng, Chùa, Nhà cổ, Sinh thái, Vườn, Tour, Nature
          const isNight = sIdx >= 8 || placeItem.startTime === '19:00' || placeItem.startTime === '21:00';
          if (isNight) {
            if (!this.isAppropriateForNight(p)) return true;
          }

          // 3b. Cấm Slot Ban ngày (sIdx < 8) đối với địa điểm CHỈ DÀNH MỞ BỔI TỐI (Cấm Chợ Đêm Tây Đô lúc 14:00)
          if (!isNight) {
            if (this.isEveningOnlyPlace(p)) return true;
          }

          // 4. Slot Ăn trưa (sIdx === 3) và Ăn tối (sIdx === 7) BẮT BUỘC là DINING
          if (sIdx === 3 || sIdx === 7) {
            if (group !== 'DINING' && !catName.includes('nhà hàng') && !catName.includes('quán ăn') && !catName.includes('ẩm thực') && !name.includes('nhà hàng') && !name.includes('quán')) {
              return true;
            }
          }

          // 5. Slot Ăn sáng / Cafe (sIdx === 0) BẮT BUỘC là CAFE / Điểm tâm nhẹ (CẤM Buffet, Lẩu, Nướng, Nhà hàng nặng)
          if (sIdx === 0) {
            if (group !== 'CAFE' && group !== 'DINING') return true;
            const fullT = `${catName} ${name}`.toLowerCase();
            const isHeavyFood = ['buffet', 'lẩu', 'nướng', 'bbq', 'nhậu', 'hải sản', 'yaki', 'nhà hàng'].some(k => fullT.includes(k));
            if (isHeavyFood) return true;
          }

          // 6. Slot Tham quan (sIdx === 1, 2, 5, 6) BẮT BUỘC là ATTRACTION (CẤM gán địa điểm ăn uống/nhà hàng vào slot tham quan)
          if (sIdx === 1 || sIdx === 2 || sIdx === 5 || sIdx === 6) {
            if (group !== 'ATTRACTION') return true;
          }

          // 7. CẤM BỐ TRÍ QUÁ 3 ĐỊA ĐIỂM ĂN UỐNG / NHÀ HÀNG MỖI NGÀY (CHỈ CÓ ĐÚNG 3 BỮA: SÁNG - TRƯA - TỐI)
          const isFoodGroup = group === 'DINING' || group === 'CAFE';
          if (isFoodGroup) {
            if (sIdx !== 0 && sIdx !== 3 && sIdx !== 7) {
              return true; // Cấm quán ăn/nhà hàng rơi vào các slot ngoài 3 bữa ăn (1, 2, 4, 5, 6, 8)
            }
          }

          // 8. CẤM TUYỆT ĐỐI 2 ĂN UỐNG (DINING / CAFE) KỀ NHAU
          if (sanitizedPlaces.length > 0) {
            const prevItem = sanitizedPlaces[sanitizedPlaces.length - 1];
            const prevObj = candidatePlacesMap.get(Number(prevItem.placeId || prevItem.id));
            if (prevObj) {
              const prevGrp = this.getGeneralCategoryGroup(prevObj);
              const isFood = (g: string) => g === 'DINING' || g === 'CAFE';
              if (isFood(prevGrp) && isFood(group)) return true;
            }
          }

          // 9. Tối đa 1 Chùa / Thiền viện mỗi ngày (Cấm 3 Chùa kề nhau hay trong 1 ngày)
          if (this.isPagodaPlace(p)) {
            const countPagodasInSanitizedDay = sanitizedPlaces.filter((sp) => {
              const spObj = candidatePlacesMap.get(Number(sp.placeId || sp.id));
              return this.isPagodaPlace(spObj);
            }).length;
            if (countPagodasInSanitizedDay >= 1) return true;
          }

          return false;
        };

        if (isViolation(placeObj, slotIdx)) {
          let replacementFound = false;
          for (const [candId, candidate] of candidatePlacesMap.entries()) {
            const cId = Number(candId);
            if (!usedGlobalIds.has(cId) && !isViolation(candidate, slotIdx)) {
              placeItem = {
                ...placeItem,
                placeId: cId,
                name: candidate.name,
              };
              placeObj = candidate;
              usedGlobalIds.add(cId);
              replacementFound = true;
              this.logger.warn(
                `[STRICT SANITIZER] Replaced invalid place at Day ${dayObj.dayNumber} Slot ${slotIdx} (${placeItem.startTime}) -> ${candidate.name} (ID: ${cId})`,
              );
              break;
            }
          }
          if (!replacementFound) {
            usedGlobalIds.add(pid);
          }
        } else {
          usedGlobalIds.add(pid);
        }

        sanitizedPlaces.push(placeItem);
      }

      return {
        ...dayObj,
        places: sanitizedPlaces,
      };
    });
  }
}
