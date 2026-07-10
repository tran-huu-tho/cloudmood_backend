import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);
  private readonly apiKey: string;
  private readonly aiApiKey: string;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    this.apiKey = this.configService.get<string>('WEATHER_API_KEY') || '';
    this.aiApiKey = this.configService.get<string>('AI_API_KEY') || '';
  }

  /**
   * Lấy thời tiết theo tên thành phố
   */
  async getWeatherForCity(cityName: string) {
    if (!cityName) {
      throw new BadRequestException('Tên thành phố không được để trống.');
    }

    const cached = await this.getCachedWeather(cityName);
    if (cached) {
      this.logger.log(`[Cache Hit] Trả về dữ liệu thời tiết cho: ${cityName}`);
      return this.formatWeatherResponse(cached);
    }

    this.logger.log(`[Cache Miss] Gọi API OpenWeatherMap cho: ${cityName}`);
    try {
      const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(cityName)}&appid=${this.apiKey}&units=metric&lang=vi`;
      const response = await axios.get(url);
      const data = response.data;

      const weatherRecord = await this.saveToCache(data.name, data);
      return this.formatWeatherResponse(weatherRecord);
    } catch (error) {
      this.logger.error(`Lỗi khi lấy thời tiết cho ${cityName}: ${error.message}`);
      // Fallback nếu database gặp lỗi nhưng API lấy được
      if (error.response && error.response.data) {
        return this.formatRawResponse(error.response.data);
      }
      throw new BadRequestException(`Không thể lấy dữ liệu thời tiết cho ${cityName}.`);
    }
  }

  /**
   * Lấy thời tiết theo tọa độ
   */
  async getWeatherForCoordinates(lat: number, lon: number) {
    if (lat === undefined || lon === undefined) {
      throw new BadRequestException('Tọa độ lat và lon không được để trống.');
    }

    try {
      const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${this.apiKey}&units=metric&lang=vi`;
      const response = await axios.get(url);
      const data = response.data;

      // Cập nhật hoặc lưu cache dựa vào tên thành phố nhận được từ API
      const cityName = data.name || `Coord_${lat.toFixed(2)}_${lon.toFixed(2)}`;
      const weatherRecord = await this.saveToCache(cityName, data);
      return this.formatWeatherResponse(weatherRecord);
    } catch (error) {
      this.logger.error(`Lỗi khi lấy thời tiết cho tọa độ (${lat}, ${lon}): ${error.message}`);
      if (error.response && error.response.data) {
        return this.formatRawResponse(error.response.data);
      }
      throw new BadRequestException(`Không thể lấy dữ liệu thời tiết cho tọa độ này.`);
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
    const suggestions = await this.getRecommendations(record.condition, record.temp);
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
    const suggestions = await this.getRecommendations(condition, temp);
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
  private async getRecommendations(condition: string, temp: number) {
    const ruleBased = this.getRuleBasedSuggestions(condition, temp);
    
    if (this.aiApiKey) {
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
  private getRuleBasedSuggestions(condition: string, temp: number) {
    const condLower = condition.toLowerCase();

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
      activities = ['Đi tắm biển buổi chiều', 'Vui chơi công viên nước', 'Tránh nóng tại trung tâm thương mại', 'Thưởng thức kem/trà sữa máy lạnh'];
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

  /**
   * Gọi AI (Gemini API) để tạo gợi ý thời tiết nâng cao
   */
  private async getAISuggestions(condition: string, temp: number, fallback: any) {
    const prompt = `Thời tiết hiện tại: Trạng thái ${condition}, Nhiệt độ ${temp}°C.
Hãy gợi ý hoạt động du lịch phù hợp. Trả về định dạng JSON thuần túy (không kèm codeblock markdown, chỉ JSON thô) có dạng:
{
  "mood": "tâm trạng gợi ý ví dụ: Chill nhẹ nhàng",
  "activities": ["hoạt động 1", "hoạt động 2", "hoạt động 3"],
  "categories": ["Café", "Bảo tàng", "Nhà hàng", "Công viên"],
  "tips": ["lời khuyên 1", "lời khuyên 2"]
}
Lưu ý: Chỉ được gợi ý các danh mục (categories) có trong danh sách sau: ["Café", "Nhà hàng", "Bảo tàng", "Công viên", "Di tích", "Khác"]. Gợi ý bằng tiếng Việt.`;

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${this.aiApiKey}`;
      const response = await axios.post(
        url,
        {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
          },
        },
        { timeout: 8000 },
      );

      const responseText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (responseText) {
        return JSON.parse(responseText.trim());
      }
    } catch (e) {
      this.logger.warn(`AI Gemini API Error: ${e.message}`);
    }
    return null;
  }
}
