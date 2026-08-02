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
  { label: '07:00 - 08:30', type: 'BREAKFAST_CAFE', startHour: 7, endHour: 8.5 },
  { label: '08:30 - 11:30', type: 'MORNING_ACTIVITY', startHour: 8.5, endHour: 11.5 },
  { label: '11:30 - 13:00', type: 'LUNCH', startHour: 11.5, endHour: 13 },
  { label: '13:00 - 15:00', type: 'HOTEL_CHECKIN', startHour: 13, endHour: 15 },
  { label: '15:00 - 17:30', type: 'AFTERNOON_ACTIVITY', startHour: 15, endHour: 17.5 },
  { label: '17:30 - 19:30', type: 'DINNER', startHour: 17.5, endHour: 19.5 },
  { label: '19:30 - 22:00', type: 'NIGHT_ACTIVITY', startHour: 19.5, endHour: 22 },
];

// A. KỊCH BẢN CHUẨN (STANDARD OTHER DAYS - CÓ LƯU TRÚ)
export const DAILY_TIME_SLOTS_OTHER_DAYS: TimeSlot[] = [
  { label: '07:00 - 08:30', type: 'BREAKFAST_CAFE', startHour: 7, endHour: 8.5 },
  { label: '08:30 - 11:30', type: 'MORNING_ACTIVITY', startHour: 8.5, endHour: 11.5 },
  { label: '11:30 - 13:00', type: 'LUNCH', startHour: 11.5, endHour: 13 },
  { label: '13:00 - 15:00', type: 'NOON_REST_INDOOR', startHour: 13, endHour: 15 },
  { label: '15:00 - 17:30', type: 'AFTERNOON_ACTIVITY', startHour: 15, endHour: 17.5 },
  { label: '17:30 - 19:30', type: 'DINNER', startHour: 17.5, endHour: 19.5 },
  { label: '19:30 - 22:00', type: 'NIGHT_ACTIVITY', startHour: 19.5, endHour: 22 },
];

// B. KỊCH BẢN ĐẶC THÙ (CHỢ NỔI CÁI RĂNG / CẦN THƠ)
export const CANTHO_MARKET_TIME_SLOTS: TimeSlot[] = [
  { label: '05:30 - 07:30', type: 'EARLY_MARKET', startHour: 5.5, endHour: 7.5 },
  { label: '07:30 - 08:30', type: 'BREAKFAST_CAFE', startHour: 7.5, endHour: 8.5 },
  { label: '08:30 - 11:30', type: 'MORNING_ACTIVITY', startHour: 8.5, endHour: 11.5 },
  { label: '11:30 - 13:00', type: 'LUNCH', startHour: 11.5, endHour: 13 },
  { label: '13:00 - 15:00', type: 'NOON_REST_INDOOR', startHour: 13, endHour: 15 },
  { label: '15:00 - 17:30', type: 'AFTERNOON_ACTIVITY', startHour: 15, endHour: 17.5 },
  { label: '17:30 - 19:30', type: 'DINNER', startHour: 17.5, endHour: 19.5 },
  { label: '19:30 - 22:00', type: 'NIGHT_ACTIVITY', startHour: 19.5, endHour: 22 },
];

// C. KỊCH BẢN DU LỊCH 1 NGÀY (DAY TRIP / HAS_HOTEL = FALSE / SKIP_CHECKIN = TRUE)
export const DAY_TRIP_TIME_SLOTS: TimeSlot[] = [
  { label: '07:00 - 08:30', type: 'BREAKFAST_CAFE', startHour: 7, endHour: 8.5 },
  { label: '08:30 - 11:30', type: 'MORNING_ACTIVITY', startHour: 8.5, endHour: 11.5 },
  { label: '11:30 - 13:00', type: 'LUNCH', startHour: 11.5, endHour: 13 },
  { label: '13:00 - 15:00', type: 'NOON_REST_INDOOR', startHour: 13, endHour: 15 },
  { label: '15:00 - 17:30', type: 'AFTERNOON_ACTIVITY', startHour: 15, endHour: 17.5 },
  { label: '17:30 - 19:30', type: 'DINNER', startHour: 17.5, endHour: 19.5 },
  { label: '19:30 - 22:00', type: 'NIGHT_ACTIVITY', startHour: 19.5, endHour: 22 },
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
   * QUY TẮC 4 (HARD RULE 4): LỌC BỎ ĐỊA ĐIỂM TÊN MỜ NHẠT / KHÔNG HỢP LỆ / <= 3 KÝ TỰ
   */
  isVagueOrInvalidPlaceName(name: string, destination: string): boolean {
    if (!name) return true;
    const cleanName = name.trim().toLowerCase();
    const cleanDest = destination.trim().toLowerCase();

    if (cleanName === cleanDest) return true;

    const cityNames = [
      'cần thơ', 'đà lạt', 'đà nẵng', 'hà nội', 'tphcm', 'sài gòn',
      'phú quốc', 'nha trang', 'sapa', 'sa pa', 'ninh bình', 'hội an', 'vũng tàu',
    ];

    if (cityNames.includes(cleanName)) {
      return true;
    }

    if (cleanName.length <= 3) return true;

    return false;
  }

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
    if (!isRainy) return places;
    const indoorOnly = places.filter((p) => !this.isOutdoorPlace(p));
    return indoorOnly.length >= 6 ? indoorOnly : places;
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
   * QUY TẮC 2 (HARD RULE 2): CẤM 2 ĐỊA ĐIỂM CÙNG THUỘC TÍNH LIÊN TIẾP NHAU
   * Ngăn chặn tuyệt đối 2 Khách sạn, 2 Cà phê, 2 Nhà hàng/Quán ăn, hoặc 2 Chùa/Thiền viện nằm kề nhau.
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

    // TỰ ĐỘNG KHẮC PHỤC SEPARATOR INJECTION nếu vẫn lỡ trùng
    for (let i = 0; i < result.length - 1; i++) {
      const p1 = resolvePlace(result[i]);
      const p2 = resolvePlace(result[i + 1]);
      const cat1 = this.getGeneralCategoryGroup(p1);
      const cat2 = this.getGeneralCategoryGroup(p2);

      if (cat1 === cat2 && ['DINING', 'HOTEL', 'CAFE', 'PAGODA'].includes(cat1)) {
        let separatorPlace: any = null;
        for (const [id, candidate] of candidatePlacesMap.entries()) {
          const cCat = this.getGeneralCategoryGroup(candidate);
          if (cCat !== cat1) {
            const isAlreadyInDay = result.some((r) => Number(r.placeId || r.id || r.place?.id) === Number(id));
            if (!isAlreadyInDay) {
              separatorPlace = {
                placeId: Number(id),
                note: `Ghé thăm ${candidate.name} (${candidate.category?.name || 'Điểm đến'}) để đổi mới trải nghiệm giữa hành trình.`,
              };
              break;
            }
          }
        }

        if (separatorPlace) {
          result.splice(i + 1, 0, separatorPlace);
          i++;
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
    if (!isRainy) return dayPlaces;

    const result = [...dayPlaces];
    for (let i = 0; i < result.length; i++) {
      const item = result[i];
      if (item.status === 'CHECKED_IN' || item.isLocked) continue;

      const placeObj = candidatePlacesMap.get(Number(item.placeId || item.id || item.place?.id));
      if (placeObj && this.isOutdoorPlace(placeObj)) {
        // Tìm 1 điểm Indoor thích hợp trong candidatePlacesMap
        for (const [id, candidate] of candidatePlacesMap.entries()) {
          if (!this.isOutdoorPlace(candidate)) {
            const alreadyInUse = result.some((r) => Number(r.placeId || r.id) === Number(id));
            if (!alreadyInUse) {
              result[i] = {
                ...item,
                placeId: Number(id),
                note: `[Dự phòng mưa] Thay thế ${placeObj.name} bằng ${candidate.name} (trong nhà/máy lạnh) để đảm bảo trải nghiệm an toàn thoải mái.`,
              };
              break;
            }
          }
        }
      }
    }
    return result;
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
    },
  ): any[] {
    if (dayPlaces.length === 0) return [];

    const dest = (options?.destination || '').toLowerCase();
    const cr = (options?.customRequest || '').toLowerCase();
    const isCanTho = dest.includes('cần thơ') || cr.includes('chợ nổi');
    const isDayTrip = options?.hasHotel === false || cr.includes('1 ngày') || cr.includes('trong ngày');
    const isRainy = options?.isRainy === true;

    // 1. Tự động xử lý cấp cứu thời tiết mưa nếu có cờ isRainy
    let processedPlaces = this.handleEmergencyWeather(dayPlaces, candidatePlacesMap, isRainy);

    const earlyMarketPlaces: any[] = [];
    const breakfasts: any[] = [];
    const daytimeAttractions: any[] = [];
    const diningSpots: any[] = [];
    const nightActivities: any[] = [];
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
        breakfasts.push(item);
      } else if (bioType === 'DINNER' || group === 'DINING') {
        diningSpots.push(item);
      } else if (bioType === 'NIGHT_ACTIVITY') {
        nightActivities.push(item);
      } else {
        daytimeAttractions.push(item);
      }
    }

    // ĐẢM BẢO BỮA SÁNG & CÀ PHÊ TẠI SLOT 0 (07:00 - 08:30)
    if (breakfasts.length === 0 && earlyMarketPlaces.length === 0) {
      for (const [id, place] of candidatePlacesMap.entries()) {
        const cat = (place.category?.name || '').toLowerCase();
        const name = (place.name || '').toLowerCase();
        const full = `${cat} ${name}`;
        if (full.includes('cà phê') || full.includes('cafe') || full.includes('coffee') || full.includes('bún') || full.includes('phở') || full.includes('bánh mì') || full.includes('điểm tâm')) {
          const alreadyInDay = processedPlaces.some((dp) => Number(dp.placeId || dp.id) === Number(id));
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

    // TỐI ƯU HOÁ KHOẢNG CÁCH NGẮN NHẤT TRONG TỪNG PHÂN PHÚC BẰNG HARD RULE 3
    const sortedEarly = this.optimizeDayRouteByDistance(earlyMarketPlaces, candidatePlacesMap);
    const sortedBreakfasts = this.optimizeDayRouteByDistance(breakfasts, candidatePlacesMap);
    const sortedDaytime = this.optimizeDayRouteByDistance(daytimeAttractions, candidatePlacesMap);
    const sortedDining = this.optimizeDayRouteByDistance(diningSpots, candidatePlacesMap);
    const sortedNight = this.optimizeDayRouteByDistance(nightActivities, candidatePlacesMap);

    const result: any[] = [];

    // NGOẠI LỆ 1: KỊCH BẢN CHỢ NỔI (05:30 - 07:30)
    if (sortedEarly.length > 0) {
      result.push(sortedEarly.shift());
    }

    // Slot 0 (07:00 - 08:30): Breakfast & Cafe
    if (sortedBreakfasts.length > 0) {
      result.push(sortedBreakfasts.shift());
    }

    // Slot 1 (08:30 - 11:30): Morning Attraction
    if (sortedDaytime.length > 0) {
      result.push(sortedDaytime.shift());
    }

    // Slot 2 (11:30 - 13:00): Lunch (Dining)
    if (sortedDining.length > 0) {
      result.push(sortedDining.shift());
    } else if (sortedDaytime.length > 0) {
      result.push(sortedDaytime.shift());
    }

    // Slot 3 (13:00 - 15:00): Check-in Khách sạn (Ngày 1) HOẶC Cà phê / TTTM tản nắng (NẮNG TRƯA INSTRUCTION: isOutdoor = false)
    if (dayNumber === 1 && hotelPlaces.length > 0 && !isDayTrip) {
      result.push(hotelPlaces.shift());
    } else {
      // NGOẠI LỆ 2: NẮNG TRƯA (13:00 - 15:00) -> ÉP isOutdoor = false (Ưu tiên Indoor)
      let indoorFoundIdx = sortedDaytime.findIndex((item) => {
        const placeObj = candidatePlacesMap.get(Number(item.placeId || item.id || item.place?.id));
        return placeObj && !this.isOutdoorPlace(placeObj);
      });
      if (indoorFoundIdx !== -1) {
        result.push(sortedDaytime.splice(indoorFoundIdx, 1)[0]);
      } else if (sortedDaytime.length > 0) {
        result.push(sortedDaytime.shift());
      }
    }

    // Slot 4 (15:00 - 17:30): Afternoon Activity (Nắng dịu)
    if (sortedDaytime.length > 0) {
      result.push(sortedDaytime.shift());
    }

    // Slot 5 (17:30 - 19:30): Dinner (Dining)
    if (sortedDining.length > 0) {
      result.push(sortedDining.shift());
    } else if (sortedDaytime.length > 0) {
      result.push(sortedDaytime.shift());
    }

    // Slot 6 (19:30 - 22:00): Night Activity
    if (sortedNight.length > 0) {
      result.push(sortedNight.shift());
    }

    // Đẩy nốt các địa điểm còn lại trong pool
    result.push(...sortedEarly, ...sortedBreakfasts, ...hotelPlaces, ...sortedDaytime, ...sortedDining, ...sortedNight);

    // Áp dụng QUY TẮC 2: CẤM 2 ĐỊA ĐIỂM CÙNG THUỘC TÍNH NẰM KỀ NHAU (No 2 Pagodas, No 2 Cafes, No 2 Dining)
    const categoryFilteredResult = this.preventConsecutiveSameCategory(result, candidatePlacesMap);

    // NGOẠI LỆ 3: KHOẢNG CÁCH XA (> 10KM) ELASTIC TIMELINE & ANCHOR TIME OVERRIDES
    return this.applyElasticTimeline(categoryFilteredResult, candidatePlacesMap, options?.customRequest);
  }

  /**
   * TÍNH TOÁN VÀ CẤP PHÁT TIMELINE CO GIÃN LINH HOẠT (ELASTIC TIMELINE)
   * Phân bổ địa điểm theo chuẩn sinh học:
   * Slot 0: 07:00 - 08:30 (Ăn sáng & Cà phê)
   * Slot 1: 08:45 - 11:15 (Tham quan sáng)
   * Slot 2: 11:30 - 13:00 (Bữa trưa - LUNCH)
   * Slot 3: 13:15 - 15:00 (Nắng trưa / TTTM / Khách sạn / Cà phê máy lạnh)
   * Slot 4: 15:15 - 17:15 (Tham quan chiều)
   * Slot 5: 17:30 - 19:30 (Bữa tối - DINNER)
   * Slot 6: 19:45 - 21:45 (Vui chơi tối / Chợ đêm / Bar)
   */
  applyElasticTimeline(
    places: any[],
    candidatePlacesMap: Map<number, any>,
    customRequest?: string,
  ): any[] {
    if (places.length === 0) return [];

    const anchors = this.extractAnchorTimeRequests(customRequest);

    // Kịch bản khung giờ chuẩn theo nhịp sinh hoạt
    const standardSlotMatrix = [
      { startTime: '07:00', endTime: '08:30', startH: 7.0, endH: 8.5 },
      { startTime: '08:45', endTime: '11:15', startH: 8.75, endH: 11.25 },
      { startTime: '11:30', endTime: '13:00', startH: 11.5, endH: 13.0 }, // LUNCH
      { startTime: '13:15', endTime: '15:00', startH: 13.25, endH: 15.0 }, // NOON REST / INDOOR / CHECKIN
      { startTime: '15:15', endTime: '17:15', startH: 15.25, endH: 17.25 }, // AFTERNOON ATTRACTION
      { startTime: '17:30', endTime: '19:30', startH: 17.5, endH: 19.5 }, // DINNER
      { startTime: '19:45', endTime: '21:45', startH: 19.75, endH: 21.75 }, // NIGHT ACTIVITY
    ];

    // Nếu địa điểm đầu tiên là Chợ nổi Cái Răng
    const firstPlaceObj = candidatePlacesMap.get(Number(places[0].placeId || places[0].id || places[0].place?.id));
    const isEarlyMarket = firstPlaceObj && (firstPlaceObj.name || '').toLowerCase().includes('chợ nổi');

    const canThoSlotMatrix = [
      { startTime: '05:30', endTime: '07:30', startH: 5.5, endH: 7.5 }, // EARLY MARKET
      { startTime: '07:30', endTime: '08:30', startH: 7.5, endH: 8.5 }, // CAFE REST
      { startTime: '08:45', endTime: '11:15', startH: 8.75, endH: 11.25 },
      { startTime: '11:30', endTime: '13:00', startH: 11.5, endH: 13.0 }, // LUNCH
      { startTime: '13:15', endTime: '15:00', startH: 13.25, endH: 15.0 }, // NOON REST / INDOOR
      { startTime: '15:15', endTime: '17:15', startH: 15.25, endH: 17.25 }, // AFTERNOON
      { startTime: '17:30', endTime: '19:30', startH: 17.5, endH: 19.5 }, // DINNER
      { startTime: '19:45', endTime: '21:45', startH: 19.75, endH: 21.75 }, // NIGHT
    ];

    const activeMatrix = isEarlyMarket ? canThoSlotMatrix : standardSlotMatrix;

    let currentHour = activeMatrix[0].startH;

    return places.map((item, idx) => {
      const placeObj = candidatePlacesMap.get(Number(item.placeId || item.id || item.place?.id));

      let startTimeStr = '';
      let endTimeStr = '';

      // 1. Nếu có Anchor Time override từ khách
      let hasAnchor = false;
      if (placeObj && anchors.length > 0) {
        const pName = (placeObj.name || '').toLowerCase();
        const matchedAnchor = anchors.find((a) => pName.includes(a.rawQuery) || a.rawQuery.includes(pName));
        if (matchedAnchor) {
          hasAnchor = true;
          currentHour = matchedAnchor.targetHour + matchedAnchor.targetMinute / 60.0;
          const startH = Math.floor(currentHour);
          const startM = Math.round((currentHour - startH) * 60);
          startTimeStr = `${startH.toString().padStart(2, '0')}:${startM.toString().padStart(2, '0')}`;

          const endDecimal = currentHour + 1.5;
          const endH = Math.floor(endDecimal) % 24;
          const endM = Math.round((endDecimal - Math.floor(endDecimal)) * 60);
          endTimeStr = `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;
        }
      }

      // 2. Nếu nằm trong khung slot Matrix mẫu chuẩn
      if (!hasAnchor) {
        if (idx < activeMatrix.length) {
          const slot = activeMatrix[idx];
          startTimeStr = slot.startTime;
          endTimeStr = slot.endTime;
          currentHour = slot.endH;
        } else {
          // Nếu có nhiều hơn 7 địa điểm trong 1 ngày, tính tản đều tiếp theo
          const durationMinutes = item.suggestedDurationMinutes || 90;
          const startH = Math.floor(currentHour);
          const startM = Math.round((currentHour - startH) * 60);
          startTimeStr = `${startH.toString().padStart(2, '0')}:${startM.toString().padStart(2, '0')}`;

          const endDecimal = currentHour + durationMinutes / 60.0;
          const endH = Math.floor(endDecimal) % 24;
          const endM = Math.round((endDecimal - Math.floor(endDecimal)) * 60);
          endTimeStr = `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;
          currentHour = endDecimal + 0.25;
        }
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
}
