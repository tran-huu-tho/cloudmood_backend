import { Controller, Get, Query, Sse, MessageEvent } from '@nestjs/common';
import { WeatherService } from './weather.service';
import { Observable, interval, from } from 'rxjs';
import { map, switchMap, startWith } from 'rxjs/operators';

@Controller('weather')
export class WeatherController {
  constructor(private readonly weatherService: WeatherService) {}

  /**
   * Lấy thời tiết hiện tại kèm theo gợi ý lịch trình
   * Ví dụ: 
   * GET /weather/current?cityName=Da Nang
   * GET /weather/current?lat=16.05&lon=108.20
   */
  @Get('current')
  async getCurrentWeather(
    @Query('cityName') cityName?: string,
    @Query('lat') lat?: string,
    @Query('lon') lon?: string,
  ) {
    if (cityName) {
      return this.weatherService.getWeatherForCity(cityName);
    }
    if (lat && lon) {
      return this.weatherService.getWeatherForCoordinates(+lat, +lon);
    }
    // Mặc định trả về thời tiết Đà Nẵng nếu không truyền tham số
    return this.weatherService.getWeatherForCity('Da Nang');
  }

  /**
   * Lấy danh sách toàn bộ các thành phố đang được theo dõi/cache thời tiết
   * Phục vụ cho Dashboard Next.js
   */
  @Get('admin/monitored')
  async getMonitoredWeather() {
    return this.weatherService.getMonitoredWeather();
  }

  /**
   * Stream thời tiết thời gian thực qua Server-Sent Events (SSE)
   * Tự động đẩy dữ liệu cập nhật mới mỗi 5 phút (300,000 ms) cho Dashboard Next.js hoặc Flutter client
   * Ví dụ: GET /weather/stream?cityName=Da Nang
   */
  @Sse('stream')
  streamWeather(@Query('cityName') cityName?: string): Observable<MessageEvent> {
    const city = cityName || 'Da Nang';
    
    // Tạo luồng tự động cập nhật thời tiết mỗi 5 phút
    return interval(300000).pipe(
      startWith(0), // Phát tín hiệu ngay lập tức khi kết nối vừa mở
      switchMap(() => from(this.weatherService.getWeatherForCity(city))),
      map(data => ({
        data: data,
        type: 'weather_update',
      } as MessageEvent)),
    );
  }
}
