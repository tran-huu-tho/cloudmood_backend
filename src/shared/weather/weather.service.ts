import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from '../notifications/notifications.service';
import axios from 'axios';

@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);
  private readonly apiKey: string;
  private readonly aiApiKeys: string[];

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private notificationsService: NotificationsService,
  ) {
    this.apiKey = this.configService.get<string>('WEATHER_API_KEY') || '';
    const rawAiKey = this.configService.get<string>('AI_API_KEY') || '';
    this.aiApiKeys = rawAiKey.split(',').map((k) => k.trim()).filter(Boolean);
  }

  /**
   * Lấy thời tiết theo tên thành phố
   */
  /**
   * Chuẩn hóa tên tỉnh thành phố ở Việt Nam sang đô thị trung tâm (Capital City)
   */
  private getCleanSearchQuery(query: string): string {
    const q = query.trim().toLowerCase();
    
    const provinceMap: Record<string, string> = {
      'an giang': 'Long Xuyên',
      'kien giang': 'Rạch Giá',
      'kiên giang': 'Rạch Giá',
      'hau giang': 'Vị Thanh',
      'hậu giang': 'Vị Thanh',
      'lam dong': 'Đà Lạt',
      'lâm đồng': 'Đà Lạt',
      'dak lak': 'Buôn Ma Thuột',
      'đắk lắk': 'Buôn Ma Thuột',
      'daklak': 'Buôn Ma Thuột',
      'đắc lắc': 'Buôn Ma Thuột',
      'dak nong': 'Gia Nghĩa',
      'đắk nông': 'Gia Nghĩa',
      'daknong': 'Gia Nghĩa',
      'gia lai': 'Pleiku',
      'binh duong': 'Thủ Dầu Một',
      'bình dương': 'Thủ Dầu Một',
      'binh phuoc': 'Đồng Xoài',
      'bình phước': 'Đồng Xoài',
      'long an': 'Tân An',
      'tien giang': 'Mỹ Tho',
      'tiền giang': 'Mỹ Tho',
      'dong thap': 'Cao Lãnh',
      'đồng tháp': 'Cao Lãnh',
      'quang nam': 'Tam Kỳ',
      'quảng nam': 'Tam Kỳ',
      'binh dinh': 'Quy Nhơn',
      'bình định': 'Quy Nhơn',
      'phu yen': 'Tuy Hòa',
      'phú yên': 'Tuy Hòa',
      'khanh hoa': 'Nha Trang',
      'khánh hòa': 'Nha Trang',
      'ninh thuan': 'Phan Rang',
      'ninh thuận': 'Phan Rang',
      'binh thuan': 'Phan Thiết',
      'bình thuận': 'Phan Thiết',
      'ba ria vung tau': 'Vũng Tàu',
      'bà rịa vũng tàu': 'Vũng Tàu',
      'vung tau': 'Vũng Tàu',
      'vũng tàu': 'Vũng Tàu',
      'quang tri': 'Đông Hà',
      'quảng trị': 'Đông Hà',
      'quang binh': 'Đồng Hới',
      'quảng bình': 'Đồng Hới',
      'nghe an': 'Vinh',
      'nghệ an': 'Vinh',
      'vinh phuc': 'Vĩnh Yên',
      'vĩnh phúc': 'Vĩnh Yên',
      'phu tho': 'Việt Trì',
      'phú thọ': 'Việt Trì',
      'dien bien': 'Điện Biên Phủ',
      'điện biên': 'Điện Biên Phủ',
      'ha nam': 'Phủ Lý',
      'hà nam': 'Phủ Lý',
      'quang ninh': 'Hạ Long',
      'quảng ninh': 'Hạ Long'
    };

    if (provinceMap[q]) {
      return provinceMap[q];
    }
    return query;
  }

  async getWeatherForCity(cityName: string) {
    if (!cityName) {
      throw new BadRequestException('Tên thành phố không được để trống.');
    }

    // 1. Kiểm tra cache bằng tên thành phố gốc
    let cached = await this.getCachedWeather(cityName);
    if (cached) {
      this.logger.log(`[Cache Hit] Trả về dữ liệu thời tiết cho: ${cityName}`);
      return this.formatWeatherResponse(cached);
    }

    // 2. Sử dụng Geocoding API để chuẩn hóa tên và lấy tọa độ chính xác (lấy tối đa 5 kết quả)
    const cleanCity = this.getCleanSearchQuery(cityName);
    // Hạn chế địa điểm chỉ tìm kiếm ở Việt Nam để tránh kết quả quốc tế không chính xác
    const searchTerms = cleanCity.includes(', VN') || cleanCity.toLowerCase().endsWith(',vn')
      ? cleanCity
      : `${cleanCity}, VN`;

    this.logger.log(`[Geocoding] Chuẩn hóa tên thành phố: ${cityName} -> ${searchTerms}`);
    let lat: number | undefined;
    let lon: number | undefined;
    let resolvedName = cityName;

    try {
      const geoUrl = `http://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(searchTerms)}&limit=5&appid=${this.apiKey}`;
      const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cleanCity)}&format=json&limit=15&countrycodes=vn`;
      
      this.logger.log(`[Geocoding Query] Thực hiện truy vấn song song OWM và Nominatim cho: ${cleanCity}`);
      
      const [owmResult, osmResult] = await Promise.allSettled([
        axios.get(geoUrl),
        axios.get(nominatimUrl, {
          headers: { 'User-Agent': 'CloudMood-App' },
          timeout: 4000
        })
      ]);

      const vnResults: any[] = [];
      const seenCoords = new Set<string>();

      // 1. Phân tích kết quả từ OpenWeatherMap
      if (owmResult.status === 'fulfilled' && owmResult.value.data && Array.isArray(owmResult.value.data)) {
        for (const item of owmResult.value.data) {
          if (item.country === 'VN') {
            const name = item.local_names?.vi || item.name;
            const province = item.state ? item.state.replace(' Province', '') : '';
            const displayName = province && !name.includes(province) ? `${name}, ${province}` : name;
            
            // Làm tròn tọa độ 2 chữ số thập phân để tránh tọa độ gần nhau bị trùng lặp
            const coordKey = `${item.lat.toFixed(2)}_${item.lon.toFixed(2)}`;
            if (!seenCoords.has(coordKey)) {
              seenCoords.add(coordKey);
              vnResults.push({
                name: name,
                local_names: { vi: displayName },
                lat: item.lat,
                lon: item.lon,
                country: 'VN',
                state: province,
              });
            }
          }
        }
      }

      // 2. Phân tích kết quả từ Nominatim OpenStreetMap (để lấy danh sách đầy đủ hơn)
      if (osmResult.status === 'fulfilled' && osmResult.value.data && Array.isArray(osmResult.value.data)) {
        for (const item of osmResult.value.data) {
          const parts = item.display_name.split(',');
          const name = parts[0]?.trim() || cleanCity;
          const subFeature = parts[1]?.trim() || '';
          
          const statePart = parts.find((p: string) => p.includes('Tỉnh') || p.includes('Thành phố') || p.includes('Province')) || parts[parts.length - 3] || '';
          const province = statePart.replace(/Tỉnh|Thành phố|Province/g, '').trim();
          
          let displayName = name;
          if (subFeature && !subFeature.includes('Việt Nam') && !subFeature.includes('90911') && !subFeature.match(/^\d+$/)) {
            displayName = `${subFeature}, ${name}`;
          }
          if (province && !displayName.includes(province)) {
            displayName = `${displayName}, ${province}`;
          }

          const latNum = parseFloat(item.lat);
          const lonNum = parseFloat(item.lon);
          const coordKey = `${latNum.toFixed(2)}_${lonNum.toFixed(2)}`;
          
          if (!seenCoords.has(coordKey)) {
            seenCoords.add(coordKey);
            vnResults.push({
              name: name,
              local_names: { vi: displayName },
              lat: latNum,
              lon: lonNum,
              country: 'VN',
              state: province,
            });
          }
        }
      }

      if (vnResults.length > 0) {
        // Các thành phố du lịch/trung tâm lớn thường được người dùng mong muốn trực tiếp (bỏ qua màn hình gợi ý mơ hồ)
        const majorCities = [
          'đà nẵng', 'da nang', 'sa pa', 'sapa', 'hồ chí minh', 'ho chi minh', 'hà nội', 'ha noi', 
          'nha trang', 'đà lạt', 'da lat', 'phú quốc', 'phu quoc', 'cần thơ', 'can tho', 
          'hải phòng', 'hai phong', 'vũng tàu', 'vung tau', 'huế', 'hue', 'quy nhơn', 'quy nhon', 
          'phan thiết', 'phan thiet', 'hạ long', 'ha long', 'bạc liêu', 'bac lieu', 'cà mau', 'ca mau'
        ];
        const isMajorCity = majorCities.includes(cityName.trim().toLowerCase());

        // Nếu có nhiều kết quả trùng khớp, tên tìm kiếm chưa có dấu phẩy và không phải là thành phố lớn tiêu biểu
        if (vnResults.length > 1 && !cityName.includes(',') && !isMajorCity) {
          const candidatesRaw = vnResults.map((item: any) => {
            const name = item.local_names?.vi || item.name;
            const province = item.state ? item.state.replace(' Province', '') : '';
            const displayName = province && !name.includes(province) ? `${name}, ${province}` : name;
            return {
              cityName: displayName,
              lat: item.lat,
              lon: item.lon,
            };
          });

          // Loại bỏ các kết quả trùng tên hiển thị (deduplicate)
          const uniqueCandidates: any[] = [];
          const seenNames = new Set<string>();
          for (const cand of candidatesRaw) {
            if (!seenNames.has(cand.cityName)) {
              seenNames.add(cand.cityName);
              uniqueCandidates.push(cand);
            }
          }

          // Chỉ kích hoạt màn hình chọn nếu sau khi lọc trùng vẫn còn từ 2 gợi ý khác biệt trở lên
          if (uniqueCandidates.length > 1) {
            this.logger.log(`[Geocoding] Phát hiện mơ hồ cho "${cityName}", tìm thấy ${uniqueCandidates.length} gợi ý khác biệt`);
            return {
              ambiguous: true,
              candidates: uniqueCandidates,
            };
          }
        }

        const geoData = vnResults[0];
        lat = geoData.lat;
        lon = geoData.lon;
        // Lấy tên tiếng Việt nếu có, nếu không dùng tên chuẩn của API
        resolvedName = geoData.local_names?.vi || geoData.name;
        const province = geoData.state ? geoData.state.replace(' Province', '') : '';
        resolvedName = province && !resolvedName.includes(province) ? `${resolvedName}, ${province}` : resolvedName;
        
        this.logger.log(`[Geocoding] Đã tìm thấy: ${cityName} -> ${resolvedName} (${lat}, ${lon})`);
        
        // 3. Kiểm tra lại cache lần nữa theo tên chuẩn hóa
        if (resolvedName.toLowerCase() !== cityName.toLowerCase()) {
          cached = await this.getCachedWeather(resolvedName);
          if (cached) {
            this.logger.log(`[Cache Hit] Trả về dữ liệu thời tiết chuẩn hóa: ${resolvedName}`);
            return this.formatWeatherResponse(cached);
          }
        }
      }
    } catch (geoError: any) {
      this.logger.warn(`Lỗi khi gọi Geocoding API cho ${cityName}: ${geoError.message}`);
    }

    // 4. Gọi API thời tiết (ưu tiên tọa độ nếu có, fallback về tên thành phố gốc)
    let data: any;
    try {
      if (lat !== undefined && lon !== undefined) {
        this.logger.log(`[Cache Miss] Gọi API OpenWeatherMap theo tọa độ cho: ${resolvedName} (${lat}, ${lon})`);
        const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${this.apiKey}&units=metric&lang=vi`;
        const response = await axios.get(url);
        data = response.data;
      } else {
        this.logger.log(`[Cache Miss] Gọi API OpenWeatherMap theo tên cho: ${cityName}`);
        const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(cityName)}&appid=${this.apiKey}&units=metric&lang=vi`;
        const response = await axios.get(url);
        data = response.data;
      }
    } catch (apiError: any) {
      this.logger.error(`Lỗi khi gọi API OpenWeatherMap cho ${cityName}: ${apiError.message}`);
      throw new BadRequestException(`Không thể lấy dữ liệu thời tiết cho ${cityName} (thành phố có thể không tồn tại).`);
    }

    // 5. Lưu kết quả vào cache và định dạng kết quả trả về
    const finalCityName = resolvedName || data.name;
    try {
      const weatherRecord = await this.saveToCache(finalCityName, data);
      return this.formatWeatherResponse(weatherRecord);
    } catch (dbError: any) {
      this.logger.warn(`Lỗi ghi cache cho ${finalCityName}: ${dbError.message}`);
      return this.formatRawResponse(data);
    }
  }

  /**
   * Lấy thời tiết theo tọa độ
   */
  async getWeatherForCoordinates(lat: number, lon: number, customName?: string) {
    if (lat === undefined || lon === undefined) {
      throw new BadRequestException('Tọa độ lat và lon không được để trống.');
    }

    let data: any;
    try {
      const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${this.apiKey}&units=metric&lang=vi`;
      const response = await axios.get(url);
      data = response.data;
    } catch (apiError: any) {
      this.logger.error(`Lỗi khi gọi API OpenWeatherMap cho tọa độ (${lat}, ${lon}): ${apiError.message}`);
      throw new BadRequestException(`Không thể lấy dữ liệu thời tiết cho tọa độ này.`);
    }

    const cityName = customName || data.name || `Coord_${lat.toFixed(2)}_${lon.toFixed(2)}`;
    try {
      const weatherRecord = await this.saveToCache(cityName, data);
      return this.formatWeatherResponse(weatherRecord);
    } catch (dbError: any) {
      this.logger.warn(`Lỗi ghi cache cho tọa độ (${lat}, ${lon}): ${dbError.message}`);
      return this.formatRawResponse(data);
    }
  }

  /**
   * Lấy tất cả dữ liệu thời tiết đang được giám sát từ Cache (dùng cho Dashboard Next.js)
   */
  async getMonitoredWeather() {
    try {
      const list = await this.prisma.weatherCache.findMany({
        orderBy: { cityName: 'asc' },
      });
      return list.map(item => this.formatWeatherResponse(item));
    } catch (e) {
      this.logger.error(`Không thể lấy danh sách giám sát thời tiết: ${e.message}`);
      return [];
    }
  }

  /**
   * Lưu hoặc cập nhật cache thời tiết
   */
  private async saveToCache(cityName: string, data: any) {
    const weatherData = {
      cityName: cityName,
      latitude: data.coord.lat,
      longitude: data.coord.lon,
      temp: data.main.temp,
      humidity: data.main.humidity,
      windSpeed: data.wind.speed,
      condition: data.weather[0].main,
      description: data.weather[0].description,
      icon: data.weather[0].icon,
      rawResponse: data as any,
    };

    try {
      return await this.prisma.weatherCache.upsert({
        where: { cityName: cityName },
        update: {
          ...weatherData,
          updatedAt: new Date(),
        },
        create: weatherData,
      });
    } catch (dbError) {
      this.logger.warn(`Không thể ghi cache thời tiết vào DB (có thể db đang offline): ${dbError.message}`);
      // Trả về đối tượng giả lập tương tự bản ghi DB để tiếp tục xử lý
      return {
        id: BigInt(0),
        ...weatherData,
        updatedAt: new Date(),
      };
    }
  }

  /**
   * Truy vấn cơ sở dữ liệu để lấy cache còn hạn (15 phút)
   */
  private async getCachedWeather(cityName: string) {
    try {
      const record = await this.prisma.weatherCache.findFirst({
        where: {
          cityName: {
            equals: cityName,
            mode: 'insensitive',
          },
        },
      });

      if (!record) return null;

      const cacheDuration = 15 * 60 * 1000; // 15 phút
      const isExpired = Date.now() - new Date(record.updatedAt).getTime() > cacheDuration;

      return isExpired ? null : record;
    } catch (e) {
      this.logger.warn(`Không truy cập được WeatherCache trong DB: ${e.message}`);
      return null;
    }
  }

  /**
   * Định dạng dữ liệu trả về từ bản ghi DB
   */
  private async formatWeatherResponse(record: any) {
    const suggestions = await this.getRecommendations(record.condition, record.temp, record.cityName);
    return {
      cityName: record.cityName,
      latitude: record.latitude,
      longitude: record.longitude,
      temp: record.temp,
      humidity: record.humidity,
      windSpeed: record.windSpeed,
      condition: record.condition,
      description: record.description,
      icon: record.icon,
      updatedAt: record.updatedAt,
      suggestions,
    };
  }

  /**
   * Định dạng dữ liệu trực tiếp từ API của OpenWeatherMap (fallback khi DB offline)
   */
  private async formatRawResponse(data: any) {
    const condition = data.weather[0].main;
    const temp = data.main.temp;
    const suggestions = await this.getRecommendations(condition, temp, data.name);
    return {
      cityName: data.name,
      latitude: data.coord.lat,
      longitude: data.coord.lon,
      temp: temp,
      humidity: data.main.humidity,
      windSpeed: data.wind.speed,
      condition: condition,
      description: data.weather[0].description,
      icon: data.weather[0].icon,
      updatedAt: new Date(),
      suggestions,
    };
  }

  /**
   * Bộ điều phối gợi ý (Gộp chung Rule-based và AI nếu có key)
   */
  private async getRecommendations(condition: string, temp: number, cityName: string) {
    const ruleBased = this.getRuleBasedSuggestions(condition, temp, cityName);
    
    if (this.aiApiKeys.length > 0) {
      try {
        const aiSuggestions = await this.getAISuggestions(condition, temp, ruleBased);
        if (aiSuggestions) {
          return {
            source: 'AI (Gemini)',
            ...aiSuggestions,
          };
        }
      } catch (e) {
        this.logger.warn(`Lỗi khi gọi AI gợi ý, chuyển về Rule-based: ${e.message}`);
      }
    }

    return {
      source: 'Rule-based',
      ...ruleBased,
    };
  }

  /**
   * Gợi ý dựa trên luật (Rule-based)
   */
  private getRuleBasedSuggestions(condition: string, temp: number, cityName: string) {
    const condLower = condition.toLowerCase();
    const cityLower = (cityName || '').toLowerCase();

    // Kiểm tra xem địa điểm có phải vùng biển/du lịch biển hay không
    const isCoastal = [
      'nha trang', 'phú quốc', 'phu quoc', 'đà nẵng', 'da nang', 'vũng tàu', 'vung tau', 
      'quy nhơn', 'quy nhon', 'phan thiết', 'phan thiet', 'hạ long', 'ha long', 
      'sầm sơn', 'sam son', 'cửa lò', 'cua lo', 'côn đảo', 'con dao', 'phú yên', 'phu yen', 
      'bình thuận', 'binh thuan', 'khánh hòa', 'khanh hoa'
    ].some(keyword => cityLower.includes(keyword));

    // Mặc định
    let mood = 'Thư giãn';
    let activities = ['Gặp gỡ bạn bè', 'Thưởng thức ẩm thực địa phương'];
    let categories = ['Café', 'Nhà hàng'];
    let tips = ['Chúc bạn có một chuyến đi vui vẻ!'];

    // 1. Luật theo trạng thái mưa gió
    if (condLower.includes('rain') || condLower.includes('thunderstorm') || condLower.includes('drizzle')) {
      mood = 'Ấm áp & Tránh mưa';
      activities = ['Tham quan bảo tàng nghệ thuật', 'Thư giãn tại quán café sách', 'Mua sắm tại trung tâm thương mại', 'Xem phim giải trí'];
      categories = ['Café', 'Bảo tàng', 'Nhà hàng'];
      tips = ['Đang có mưa lớn. Bạn hãy mang theo ô/áo mưa và ưu tiên hoạt động trong nhà.', 'Hạn chế di chuyển đường dài bằng xe máy.'];
    }
    // 2. Luật theo trạng thái nắng ráo ngoài trời
    else if (condLower.includes('clear') || (condLower.includes('clouds') && temp >= 20 && temp <= 30)) {
      mood = 'Năng động & Khám phá';
      activities = ['Đi dạo công viên', 'Chụp ảnh check-in danh lam thắng cảnh', 'Tham gia tour đi bộ ngoài trời', 'Khám phá các chợ đêm'];
      categories = ['Công viên', 'Di tích', 'Khác'];
      tips = ['Thời tiết rất đẹp cho hoạt động ngoài trời!', 'Nên chuẩn bị kính râm và giày đi bộ thoải mái.'];
    }
    // 3. Luật theo nhiệt độ quá nóng
    else if (temp > 32) {
      mood = 'Mát mẻ & Tránh nóng';
      activities = isCoastal 
        ? ['Đi tắm biển buổi chiều', 'Vui chơi công viên nước', 'Tránh nóng tại trung tâm thương mại', 'Thưởng thức kem/trà sữa máy lạnh']
        : ['Tránh nóng tại trung tâm thương mại', 'Vui chơi công viên nước/bể bơi', 'Thư giãn tại quán café máy lạnh', 'Thưởng thức kem/trà sữa mát lạnh'];
      categories = ['Café', 'Nhà hàng'];
      tips = ['Nhiệt độ ngoài trời rất cao. Vui lòng bôi kem chống nắng và uống đủ nước.', 'Hạn chế ra đường vào khung giờ 11h - 14h.'];
    }
    // 4. Luật theo nhiệt độ lạnh
    else if (temp < 18) {
      mood = 'Ấm cúng';
      activities = ['Ăn lẩu nóng hoặc nướng', 'Thưởng thức trà/café nóng', 'Dạo quanh phố phường trang bị áo ấm'];
      categories = ['Nhà hàng', 'Café'];
      tips = ['Trời khá lạnh. Hãy nhớ mang theo áo khoác ấm và khăn quàng cổ nhé.'];
    }

    return { mood, activities, categories, tips };
  }

  private async getAISuggestions(condition: string, temp: number, fallback: any) {
    if (this.aiApiKeys.length === 0) return null;

    let dbPlaces: any[] = [];
    try {
      dbPlaces = await this.prisma.place.findMany({
        select: {
          id: true,
          name: true,
          address: true,
          category: { select: { name: true } },
        },
        take: 55,
      });
    } catch (dbErr) {
      this.logger.error(`Error fetching places for AI weather suggestions: ${dbErr.message}`);
    }

    const placesListStr = dbPlaces
      .map((p) => `- [ID: ${p.id}] ${p.name} (Danh mục: ${p.category.name}, Địa chỉ: ${p.address})`)
      .join('\n');

    const prompt = `Thời tiết hiện tại: Trạng thái ${condition}, Nhiệt độ ${temp}°C.
Đây là danh sách các địa điểm thực tế có trong cơ sở dữ liệu của hệ thống:
${placesListStr}

Dựa trên thời tiết này, hãy gợi ý hoạt động du lịch phù hợp. Bạn bắt buộc phải chọn ra từ 3 đến 5 địa điểm phù hợp nhất từ danh sách trên để đề xuất cho người dùng.
Trả về định dạng JSON thuần túy (không kèm codeblock markdown, chỉ JSON thô) có dạng:
{
  "mood": "tâm trạng gợi ý ví dụ: Chill nhẹ nhàng tránh mưa",
  "activities": ["hoạt động 1", "hoạt động 2", "hoạt động 3"],
  "categories": ["Café", "Nhà hàng", "Bảo tàng", "Công viên"],
  "places": [
    {
      "id": "ID của địa điểm đã chọn",
      "name": "Tên địa điểm đã chọn",
      "category": "Danh mục địa điểm đã chọn",
      "address": "Địa chỉ địa điểm đã chọn",
      "reason": "Lý do đề xuất cụ thể gắn với thời tiết hiện tại (ví dụ: Không gian máy lạnh ấm cúng trốn mưa, món ăn lẩu nóng phù hợp trời lạnh)"
    }
  ],
  "tips": ["lời khuyên 1", "lời khuyên 2"]
}
Lưu ý:
- Mục "places" CHỈ được chọn từ danh sách địa điểm thực tế được cung cấp ở trên. Không được tự chế hoặc lấy địa điểm bên ngoài.
- Chỉ được gợi ý các danh mục (categories) có trong danh sách sau: ["Café", "Nhà hàng", "Bảo tàng", "Công viên", "Di tích", "Khác"].
- Trả lời bằng tiếng Việt.`;

    for (let i = 0; i < this.aiApiKeys.length; i++) {
      const apiKey = this.aiApiKeys[i];
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`;
        const response = await axios.post(
          url,
          {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: 'application/json',
            },
          },
          { timeout: 15000 },
        );

        const responseText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (responseText) {
          return JSON.parse(responseText.trim());
        }
      } catch (e) {
        const statusCode = e.response?.status;
        this.logger.warn(`AI Gemini API Error with key index ${i} (status ${statusCode}): ${e.message}`);
        
        // Rotate on rate limit (429) or invalid key (400) if more keys exist
        if ((statusCode === 429 || statusCode === 400) && i < this.aiApiKeys.length - 1) {
          this.logger.warn(`Rotating to next API key for weather suggestions...`);
          this.notificationsService.addNotification(
            'rotation',
            'Xoay vòng API Key thành công',
            `Key số ${i + 1} bị cạn hạn ngạch (status ${statusCode}). Đã tự động xoay sang Key số ${i + 2} cho Weather gợi ý.`
          );
          continue;
        }
        break;
      }
    }
    return null;
  }
}
