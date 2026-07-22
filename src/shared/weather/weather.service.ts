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
  private recommendationsCache = new Map<
    string,
    { suggestions: any; updatedTime: number }
  >();

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private notificationsService: NotificationsService,
  ) {
    this.apiKey = this.configService.get<string>('WEATHER_API_KEY') || '';
    const rawAiKey = this.configService.get<string>('AI_API_KEY') || '';
    this.aiApiKeys = rawAiKey
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
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
      daklak: 'Buôn Ma Thuột',
      'đắc lắc': 'Buôn Ma Thuột',
      'dak nong': 'Gia Nghĩa',
      'đắk nông': 'Gia Nghĩa',
      daknong: 'Gia Nghĩa',
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
      'quảng ninh': 'Hạ Long',
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
    const searchTerms =
      cleanCity.includes(', VN') || cleanCity.toLowerCase().endsWith(',vn')
        ? cleanCity
        : `${cleanCity}, VN`;

    this.logger.log(
      `[Geocoding] Chuẩn hóa tên thành phố: ${cityName} -> ${searchTerms}`,
    );
    let lat: number | undefined;
    let lon: number | undefined;
    let resolvedName = cityName;

    try {
      const geoUrl = `http://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(searchTerms)}&limit=5&appid=${this.apiKey}`;
      const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cleanCity)}&format=json&limit=15&countrycodes=vn`;

      this.logger.log(
        `[Geocoding Query] Thực hiện truy vấn song song OWM và Nominatim cho: ${cleanCity}`,
      );

      const [owmResult, osmResult] = await Promise.allSettled([
        axios.get(geoUrl),
        axios.get(nominatimUrl, {
          headers: { 'User-Agent': 'CloudMood-App' },
          timeout: 4000,
        }),
      ]);

      const vnResults: any[] = [];
      const seenCoords = new Set<string>();

      // 1. Phân tích kết quả từ OpenWeatherMap
      if (
        owmResult.status === 'fulfilled' &&
        owmResult.value.data &&
        Array.isArray(owmResult.value.data)
      ) {
        for (const item of owmResult.value.data) {
          if (item.country === 'VN') {
            const name = item.local_names?.vi || item.name;
            const province = item.state
              ? item.state.replace(' Province', '')
              : '';
            const displayName =
              province && !name.includes(province)
                ? `${name}, ${province}`
                : name;

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
      if (
        osmResult.status === 'fulfilled' &&
        osmResult.value.data &&
        Array.isArray(osmResult.value.data)
      ) {
        for (const item of osmResult.value.data) {
          const parts = item.display_name.split(',');
          const name = parts[0]?.trim() || cleanCity;
          const subFeature = parts[1]?.trim() || '';

          const statePart =
            parts.find(
              (p: string) =>
                p.includes('Tỉnh') ||
                p.includes('Thành phố') ||
                p.includes('Province'),
            ) ||
            parts[parts.length - 3] ||
            '';
          const province = statePart
            .replace(/Tỉnh|Thành phố|Province/g, '')
            .trim();

          let displayName = name;
          if (
            subFeature &&
            !subFeature.includes('Việt Nam') &&
            !subFeature.includes('90911') &&
            !subFeature.match(/^\d+$/)
          ) {
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
          'đà nẵng',
          'da nang',
          'sa pa',
          'sapa',
          'hồ chí minh',
          'ho chi minh',
          'hà nội',
          'ha noi',
          'nha trang',
          'đà lạt',
          'da lat',
          'phú quốc',
          'phu quoc',
          'cần thơ',
          'can tho',
          'hải phòng',
          'hai phong',
          'vũng tàu',
          'vung tau',
          'huế',
          'hue',
          'quy nhơn',
          'quy nhon',
          'phan thiết',
          'phan thiet',
          'hạ long',
          'ha long',
          'bạc liêu',
          'bac lieu',
          'cà mau',
          'ca mau',
        ];
        const isMajorCity = majorCities.includes(cityName.trim().toLowerCase());

        // Nếu có nhiều kết quả trùng khớp, tên tìm kiếm chưa có dấu phẩy và không phải là thành phố lớn tiêu biểu
        if (vnResults.length > 1 && !cityName.includes(',') && !isMajorCity) {
          const candidatesRaw = vnResults.map((item: any) => {
            const name = item.local_names?.vi || item.name;
            const province = item.state
              ? item.state.replace(' Province', '')
              : '';
            const displayName =
              province && !name.includes(province)
                ? `${name}, ${province}`
                : name;
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
            this.logger.log(
              `[Geocoding] Phát hiện mơ hồ cho "${cityName}", tìm thấy ${uniqueCandidates.length} gợi ý khác biệt`,
            );
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
        const province = geoData.state
          ? geoData.state.replace(' Province', '')
          : '';
        resolvedName =
          province && !resolvedName.includes(province)
            ? `${resolvedName}, ${province}`
            : resolvedName;

        this.logger.log(
          `[Geocoding] Đã tìm thấy: ${cityName} -> ${resolvedName} (${lat}, ${lon})`,
        );

        // 3. Kiểm tra lại cache lần nữa theo tên chuẩn hóa
        if (resolvedName.toLowerCase() !== cityName.toLowerCase()) {
          cached = await this.getCachedWeather(resolvedName);
          if (cached) {
            this.logger.log(
              `[Cache Hit] Trả về dữ liệu thời tiết chuẩn hóa: ${resolvedName}`,
            );
            return this.formatWeatherResponse(cached);
          }
        }
      }
    } catch (geoError: any) {
      this.logger.warn(
        `Lỗi khi gọi Geocoding API cho ${cityName}: ${geoError.message}`,
      );
    }

    // 4. Gọi API thời tiết (ưu tiên tọa độ nếu có, fallback về tên thành phố gốc)
    let data: any;
    try {
      if (lat !== undefined && lon !== undefined) {
        this.logger.log(
          `[Cache Miss] Gọi API OpenWeatherMap theo tọa độ cho: ${resolvedName} (${lat}, ${lon})`,
        );
        const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${this.apiKey}&units=metric&lang=vi`;
        const response = await axios.get(url);
        data = response.data;
      } else {
        this.logger.log(
          `[Cache Miss] Gọi API OpenWeatherMap theo tên cho: ${cityName}`,
        );
        const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(cityName)}&appid=${this.apiKey}&units=metric&lang=vi`;
        const response = await axios.get(url);
        data = response.data;
      }
    } catch (apiError: any) {
      this.logger.error(
        `Lỗi khi gọi API OpenWeatherMap cho ${cityName}: ${apiError.message}`,
      );
      throw new BadRequestException(
        `Không thể lấy dữ liệu thời tiết cho ${cityName} (thành phố có thể không tồn tại).`,
      );
    }

    // 5. Lưu kết quả vào cache và định dạng kết quả trả về
    const finalCityName = resolvedName || data.name;
    try {
      const weatherRecord = await this.saveToCache(finalCityName, data);
      return this.formatWeatherResponse(weatherRecord);
    } catch (dbError: any) {
      this.logger.warn(
        `Lỗi ghi cache cho ${finalCityName}: ${dbError.message}`,
      );
      return this.formatRawResponse(data);
    }
  }

  /**
   * Lấy thời tiết theo tọa độ
   */
  async getWeatherForCoordinates(
    lat: number,
    lon: number,
    customName?: string,
  ) {
    if (lat === undefined || lon === undefined) {
      throw new BadRequestException('Tọa độ lat và lon không được để trống.');
    }

    let data: any;
    try {
      const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${this.apiKey}&units=metric&lang=vi`;
      const response = await axios.get(url);
      data = response.data;
    } catch (apiError: any) {
      this.logger.error(
        `Lỗi khi gọi API OpenWeatherMap cho tọa độ (${lat}, ${lon}): ${apiError.message}`,
      );
      throw new BadRequestException(
        `Không thể lấy dữ liệu thời tiết cho tọa độ này.`,
      );
    }

    const cityName =
      customName || data.name || `Coord_${lat.toFixed(2)}_${lon.toFixed(2)}`;
    try {
      const weatherRecord = await this.saveToCache(cityName, data);
      return this.formatWeatherResponse(weatherRecord);
    } catch (dbError: any) {
      this.logger.warn(
        `Lỗi ghi cache cho tọa độ (${lat}, ${lon}): ${dbError.message}`,
      );
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
      return list.map((item) => this.formatWeatherResponse(item));
    } catch (e) {
      this.logger.error(
        `Không thể lấy danh sách giám sát thời tiết: ${e.message}`,
      );
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
      rawResponse: data,
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
      this.logger.warn(
        `Không thể ghi cache thời tiết vào DB (có thể db đang offline): ${dbError.message}`,
      );
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
      const isExpired =
        Date.now() - new Date(record.updatedAt).getTime() > cacheDuration;

      return isExpired ? null : record;
    } catch (e) {
      this.logger.warn(
        `Không truy cập được WeatherCache trong DB: ${e.message}`,
      );
      return null;
    }
  }

  /**
   * Định dạng dữ liệu trả về từ bản ghi DB
   */
  private async formatWeatherResponse(record: any) {
    const raw = record.rawResponse;
    const rainfall = raw?.rain?.['1h'] || raw?.rain?.['3h'] || 0;
    const suggestions = await this.getRecommendations(
      record.condition,
      record.temp,
      record.humidity,
      record.windSpeed,
      record.cityName,
      record.updatedAt,
    );
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
      rainfall,
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
    const rainfall = data.rain?.['1h'] || data.rain?.['3h'] || 0;
    const suggestions = await this.getRecommendations(
      condition,
      temp,
      data.main.humidity,
      data.wind.speed,
      data.name,
      new Date(),
    );
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
      rainfall,
      updatedAt: new Date(),
      suggestions,
    };
  }

  private async getRecommendations(
    condition: string,
    temp: number,
    humidity: number,
    windSpeed: number,
    cityName: string,
    updatedAt?: Date,
  ) {
    const cacheKey = cityName.toLowerCase();
    const cached = this.recommendationsCache.get(cacheKey);
    const recordTime = updatedAt ? new Date(updatedAt).getTime() : Date.now();

    if (cached && cached.updatedTime === recordTime) {
      return cached.suggestions;
    }

    const ruleBased = this.getRuleBasedSuggestions(
      condition,
      temp,
      humidity,
      windSpeed,
      cityName,
    );

    // Detailed dynamic rain forecasting logic based on condition, humidity, and windSpeed
    const condLower = condition.toLowerCase();
    let rainProbability = 0;
    let estimatedRainfall = 0.0;
    let rainForecast = 'Thời tiết khô ráo, không có khả năng mưa.';

    if (condLower.includes('thunderstorm')) {
      rainProbability = Math.min(100, 95 + Math.round(windSpeed));
      estimatedRainfall = humidity > 85 ? 18.5 : 12.0;
      rainForecast = `Dự báo dông bão mạnh kèm mưa lớn (lượng mưa ~${estimatedRainfall}mm) và gió giật mạnh. Cần đề phòng sấm sét và ngập úng cục bộ.`;
    } else if (condLower.includes('rain')) {
      rainProbability = Math.min(100, 85 + Math.round((humidity - 50) * 0.3));
      if (condLower.includes('heavy') || condLower.includes('extreme')) {
        estimatedRainfall = 15.0;
        rainForecast = `Khả năng cao mưa rất to liên tục (lượng mưa ${estimatedRainfall}mm). Hạn chế đi lại đường xa và cẩn thận ngập úng.`;
      } else if (
        condLower.includes('light') ||
        condLower.includes('moderate')
      ) {
        estimatedRainfall = condLower.includes('light') ? 2.0 : 5.5;
        rainForecast = `Dự báo có mưa rào nhẹ đến vừa (lượng mưa ${estimatedRainfall}mm). Trời ẩm ướt trơn trượt, hãy mang theo ô dù khi ra ngoài.`;
      } else {
        estimatedRainfall = 6.0;
        rainForecast = `Dự báo có mưa trong ngày với lượng mưa trung bình (~${estimatedRainfall}mm). Vui lòng trang bị áo mưa đầy đủ.`;
      }
    } else if (condLower.includes('drizzle')) {
      rainProbability = Math.min(95, 75 + Math.round((humidity - 60) * 0.2));
      estimatedRainfall = 1.0;
      rainForecast = `Có mưa phùn rải rác nhẹ (khoảng ${estimatedRainfall}mm). Trời âm u ẩm ướt nhẹ nhưng không ảnh hưởng nhiều đến lộ trình.`;
    } else if (condLower.includes('clouds')) {
      if (humidity > 88) {
        rainProbability = 65;
        estimatedRainfall = 0.5;
        rainForecast = `Trời nhiều mây đen tích tụ, độ ẩm rất cao (${humidity}%), dễ xuất hiện mưa rào rải rác bất chợt.`;
      } else if (humidity > 75) {
        rainProbability = 35;
        rainForecast = `Trời nhiều mây âm u, độ ẩm khá cao (${humidity}%), chưa có dấu hiệu mưa rõ rệt nhưng bạn nên chuẩn bị ô dù dự phòng.`;
      } else {
        rainProbability = 15;
        rainForecast = `Trời nhiều mây rải rác, thời tiết ráo mát, không có khả năng mưa.`;
      }
    } else if (condLower.includes('clear')) {
      rainProbability = humidity > 85 ? 10 : 5;
      rainForecast = `Thời tiết hoàn toàn ráo mát, bầu trời quang đãng, không có khả năng mưa. Rất thích hợp cho các hoạt động ngoài trời.`;
    } else {
      rainProbability = humidity > 90 ? 25 : 10;
      rainForecast = `Trời có sương mù hoặc hiện tượng mù nhẹ. Khả năng mưa thấp (${rainProbability}%), tầm nhìn xa khi di chuyển ngoài đường có thể giảm nhẹ.`;
    }

    const defaultRain = {
      rainProbability,
      estimatedRainfall,
      rainForecast,
    };

    let recommendedPlaces: any[] = [];
    try {
      const placesFromDb = await this.prisma.place.findMany({
        where: {
          category: {
            name: { in: ruleBased.categories },
          },
        },
        take: 3,
        include: {
          category: true,
        },
      });

      recommendedPlaces = placesFromDb.map((p) => ({
        id: Number(p.id),
        name: p.name,
        category: p.category.name,
        address: p.address,
        reason: `Địa điểm lý tưởng phù hợp cho thời tiết "${condition}" với tâm trạng "${ruleBased.mood}".`,
      }));
    } catch (err) {
      this.logger.warn(`Lỗi lấy địa điểm gợi ý Rule-based: ${err.message}`);
    }

    const result: any = {
      source: 'Hệ thống định tuyến (Rule-based)',
      ...defaultRain,
      ...ruleBased,
      places: recommendedPlaces,
    };

    this.recommendationsCache.set(cacheKey, {
      suggestions: result,
      updatedTime: recordTime,
    });

    return result;
  }

  /**
   * Gợi ý dựa trên luật (Rule-based)
   */
  private getRuleBasedSuggestions(
    condition: string,
    temp: number,
    humidity: number,
    windSpeed: number,
    cityName: string,
  ) {
    const condLower = condition.toLowerCase();
    const cityLower = (cityName || '').toLowerCase();

    // Kiểm tra xem địa điểm có phải vùng biển/du lịch biển hay không
    const isCoastal = [
      'nha trang',
      'phú quốc',
      'phu quoc',
      'đà nẵng',
      'da nang',
      'vũng tàu',
      'vung tau',
      'quy nhơn',
      'quy nhon',
      'phan thiết',
      'phan thiet',
      'hạ long',
      'ha long',
      'sầm sơn',
      'sam son',
      'cửa lò',
      'cua lo',
      'côn đảo',
      'con dao',
      'phú yên',
      'phu yen',
      'bình thuận',
      'binh thuan',
      'khánh hòa',
      'khanh hoa',
    ].some((keyword) => cityLower.includes(keyword));

    let mood = 'Thư giãn';
    let activities: string[] = [];
    let categories: string[] = [];
    let tips: string[] = [];

    // 1. Giông bão / Mưa rất to và gió lớn
    if (
      condLower.includes('thunderstorm') ||
      (condLower.includes('rain') && windSpeed > 6)
    ) {
      mood = 'Tránh bão & An toàn';
      activities = [
        'Nghỉ ngơi tại khách sạn và xem phim giải trí',
        'Thưởng thức lẩu ấm hoặc hải sản ấm nóng tại nhà hàng trong nhà',
        'Chơi board game, trò chuyện tại quán café ấm cúng',
        'Thư giãn và đọc sách trong phòng ấm',
      ];
      categories = ['Café', 'Nhà hàng'];
      tips = [
        'Đang có dông bão mạnh hoặc gió giật lớn ngoài trời. Hạn chế tối đa di chuyển ngoài đường.',
        'Tuyệt đối tránh đứng gần cây cao, cột điện hoặc các biển quảng cáo lớn đề phòng đổ gãy.',
        'Nên theo dõi sát sao dự báo thời tiết cục bộ và chuẩn bị sẵn sạc điện thoại dự phòng.',
      ];
    }
    // 2. Trời mưa / Mưa phùn hoặc ẩm ướt cao
    else if (
      condLower.includes('rain') ||
      condLower.includes('drizzle') ||
      humidity > 92
    ) {
      mood = 'Ấm cúng & Tránh mưa';
      activities = [
        'Thưởng thức café ấm áp (café trứng, trà nóng) trong không gian yên tĩnh',
        'Tham quan bảo tàng lịch sử hoặc các phòng triển lãm nghệ thuật trong nhà',
        'Mua sắm, ăn uống và vui chơi tại tổ hợp trung tâm thương mại',
        'Thử sức với các trò chơi giải trí trong nhà (bowling, bắn cung, escape room)',
      ];
      categories = ['Café', 'Bảo tàng', 'Nhà hàng', 'Di tích'];
      tips = [
        'Thời tiết ẩm ướt và có mưa, hãy nhớ luôn mang theo ô (dù) hoặc áo mưa khi ra ngoài.',
        'Đường đi trơn trượt nhẹ, ưu tiên di chuyển bằng taxi hoặc xe công nghệ để giữ khô ráo.',
        'Nhiệt độ phòng máy lạnh ở các điểm tham quan có thể hơi lạnh, nên mang theo áo khoác mỏng.',
      ];
    }
    // 3. Trời rét / nhiệt độ lạnh
    else if (temp < 19) {
      mood = 'Ấm cúng & Gần gũi';
      activities = [
        'Tụ tập ăn đồ nướng xèo xèo hoặc nồi lẩu nóng hổi bốc khói',
        'Thưởng thức cacao nóng hoặc trà gừng tại quán café gỗ tông ấm',
        'Dạo phố phường ngắm cảnh trong những bộ trang phục mùa đông dày dặn',
        'Ghé thăm các di tích lịch sử ngoài trời kết hợp thưởng thức quà vặt ấm nóng',
      ];
      categories = ['Nhà hàng', 'Café', 'Di tích'];
      tips = [
        'Trời lạnh sâu. Hãy chú ý giữ ấm cơ thể, đặc biệt là vùng cổ, ngực và hai bàn tay.',
        'Nên uống nước ấm thay vì nước đá để bảo vệ cổ họng và ổn định thân nhiệt.',
        'Nếu đi dạo muộn sương xuống lạnh, hãy mang theo khăn quàng cổ dày.',
      ];
    }
    // 4. Trời nắng nóng gay gắt
    else if (temp > 32) {
      mood = 'Mát mẻ & Tránh nóng';
      if (isCoastal) {
        activities = [
          'Tắm biển giải nhiệt vào thời điểm mát mẻ (sáng sớm hoặc sau 16h30)',
          'Tham gia các hoạt động vui chơi giải trí mát lạnh tại công viên nước',
          'Tránh nóng thư giãn tại các trung tâm thương mại hoặc rạp chiếu phim',
          'Ngồi quán café máy lạnh view biển ngắm hoàng hôn rực rỡ cực chill',
          'Thưởng thức hải sản tươi ngon kết hợp nước dừa mát lạnh giải nhiệt',
        ];
      } else {
        activities = [
          'Tránh nóng thư giãn tại các trung tâm thương mại hiện đại rộng lớn',
          'Đi bơi giải nhiệt tại các hồ bơi công cộng chất lượng cao',
          'Thư giãn thưởng thức đồ uống tại các quán café máy lạnh không gian xanh mát',
          'Thưởng thức kem mát lạnh, sinh tố trái cây hoặc trà nhiệt đới giải nhiệt',
        ];
      }
      categories = ['Café', 'Nhà hàng', 'Khác'];
      tips = [
        'Chỉ số tia cực tím (UV) ngoài trời ở mức nguy hại. Hãy bôi kem chống nắng đầy đủ trước khi ra ngoài.',
        'Luôn mang theo nước uống bên mình, mang mũ rộng vành và đeo kính râm chống nắng.',
        'Hạn chế các hoạt động thể chất trực tiếp dưới ánh nắng gay gắt từ 11h00 đến 15h30.',
      ];
    }
    // 5. Thời tiết lý tưởng (nắng nhẹ mát mẻ)
    else if (temp >= 19 && temp < 29 && humidity <= 82) {
      mood = 'Năng động & Khám phá';
      activities = [
        'Dã ngoại, cắm trại nhẹ nhàng và chụp ảnh tại các công viên xanh mát',
        'Đi bộ khám phá các con phố cổ kính và di tích lịch sử ngoài trời',
        'Đạp xe dạo quanh bờ hồ ngắm cảnh sắc thơ mộng',
        'Ngồi café vỉa hè thoáng đãng ngắm dòng người qua lại',
        'Trải nghiệm các hoạt động chèo thuyền, leo núi hoặc đi dạo khám phá thiên nhiên',
      ];
      categories = ['Công viên', 'Di tích', 'Khác', 'Café'];
      tips = [
        'Thời tiết hoàn hảo cho mọi chuyến đi ngoài trời. Hãy chuẩn bị một đôi giày đi bộ êm ái.',
        'Bầu trời quang đãng, ánh sáng lý tưởng để lưu lại những bức hình phong cảnh tuyệt đẹp.',
        'Bổ sung nước lọc đầy đủ khi đi bộ nhiều để duy trì thể trạng năng động nhất.',
      ];
    }
    // 6. Trời mát dịu nhưng nhiều mây, độ ẩm hơi cao
    else {
      mood = 'Thư thái & Dạo mát';
      activities = [
        'Đi dạo mát quanh các hồ nước hoặc công viên dưới bóng râm dịu nhẹ',
        'Ngồi café không gian mở thoáng đãng ngắm cảnh phố phường yên ả',
        'Tham quan các bảo tàng văn hóa hoặc di tích lịch sử trong khu vực',
        'Ghé thăm các khu chợ đêm ẩm thực thưởng thức đặc sản đường phố',
      ];
      categories = ['Café', 'Công viên', 'Bảo tàng', 'Di tích'];
      tips = [
        'Thời tiết dịu mát nhưng độ ẩm hơi cao, nên lựa chọn trang phục cotton rộng rãi, thấm hút mồ hôi.',
        'Nên bỏ sẵn một chiếc ô nhỏ trong túi xách phòng hờ những cơn mưa rào bất chợt.',
        'Ánh sáng tản dưới trời nhiều mây rất thuận lợi để bạn chụp chân dung chân thực mà không bị chói mắt.',
      ];
    }

    return { mood, activities, categories, tips };
  }
}
