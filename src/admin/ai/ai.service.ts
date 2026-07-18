import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { NotificationsService } from '../../shared/notifications/notifications.service';
import axios from 'axios';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly apiKeys: string[] = [];
  private currentKeyIndex = 0;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {
    const rawKeys = this.configService.get<string>('AI_API_KEY') || '';
    this.apiKeys = rawKeys.split(',').map((k) => k.trim()).filter(Boolean);
  }

  private getApiKey(): string {
    if (this.apiKeys.length === 0) return '';
    return this.apiKeys[this.currentKeyIndex];
  }

  private rotateApiKey() {
    if (this.apiKeys.length <= 1) return;
    this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
    this.logger.warn(`API key rotated to index ${this.currentKeyIndex}.`);
  }

  private async postWithKeyRotation(urlPath: string, payload: any): Promise<any> {
    if (this.apiKeys.length === 0) {
      throw new Error('Chưa cấu hình AI_API_KEY trong tệp .env.');
    }

    let attempts = 0;
    const maxAttempts = Math.max(this.apiKeys.length, 1);

    while (attempts < maxAttempts) {
      attempts++;
      const currentKey = this.getApiKey();
      const url = `https://generativelanguage.googleapis.com/v1beta/${urlPath}?key=${currentKey}`;

      try {
        const response = await axios.post(url, payload, { timeout: 30000 });
        return response;
      } catch (err: any) {
        const apiErrorMessage = err.response?.data?.error?.message || '';
        const isQuotaExceeded = err.response?.status === 429 || 
          apiErrorMessage.toLowerCase().includes('quota') || 
          err.message.toLowerCase().includes('quota') ||
          err.message.includes('429');

        if (isQuotaExceeded && this.apiKeys.length > 1 && attempts < maxAttempts) {
          const oldIndex = this.currentKeyIndex;
          this.logger.warn(`API Key index ${this.currentKeyIndex} hit rate limit. Rotating to next key...`);
          this.rotateApiKey();
          this.notificationsService.addNotification(
            'rotation',
            'Xoay vòng API Key thành công',
            `Key số ${oldIndex + 1} bị cạn hạn ngạch (429). Đã tự động xoay sang Key số ${this.currentKeyIndex + 1} cho Trợ lý AI (MoodBros).`
          );
          continue; // Retry with the next key
        }

        throw err;
      }
    }
  }

  // System instructions for the model
  private getSystemInstruction() {
    return 'Bạn là MoodBros, trợ lý AI đồng hành dành riêng cho trang Admin của hệ thống CloudMood. ' +
      'Bạn có thể truy xuất số liệu thống kê, tìm kiếm địa điểm, tìm kiếm nhận xét, sửa đổi thông tin địa điểm và xóa/duyệt nhận xét thông qua các công cụ (tools) được cung cấp. ' +
      'Hãy trả lời bằng tiếng Việt ngắn gọn, chuyên nghiệp. Nếu thực hiện thành công các thao tác cập nhật hay xóa, hãy thông báo rõ ràng cho Admin.';
  }

  // Function declarations for Gemini tools
  private getTools() {
    return [
      {
        functionDeclarations: [
          {
            name: 'getDatabaseStats',
            description: 'Lấy các số liệu thống kê chung của hệ thống: tổng số địa điểm, tổng số người dùng, tổng số đánh giá và số địa điểm trong từng danh mục.',
          },
          {
            name: 'searchPlaces',
            description: 'Tìm kiếm danh sách địa điểm trong hệ thống theo tên hoặc địa chỉ.',
            parameters: {
              type: 'OBJECT',
              properties: {
                query: { type: 'STRING', description: 'Từ khóa tìm kiếm trong tên hoặc địa chỉ.' },
                categoryName: { type: 'STRING', description: 'Tên danh mục cần lọc (ví dụ: Khách sạn, Cà phê, Quán ăn, v.v.)' },
              },
            },
          },
          {
            name: 'searchReviews',
            description: 'Tìm kiếm nhận xét/đánh giá của người dùng trong hệ thống.',
            parameters: {
              type: 'OBJECT',
              properties: {
                query: { type: 'STRING', description: 'Từ khóa tìm kiếm trong nội dung bình luận.' },
                rating: { type: 'NUMBER', description: 'Số sao đánh giá cần lọc (1-5)' },
              },
            },
          },
          {
            name: 'updatePlaceDetails',
            description: 'Cập nhật thông tin chi tiết của một địa điểm trong hệ thống.',
            parameters: {
              type: 'OBJECT',
              properties: {
                id: { type: 'STRING', description: 'ID của địa điểm (dưới dạng chuỗi số)' },
                name: { type: 'STRING', description: 'Tên địa điểm mới' },
                description: { type: 'STRING', description: 'Mô tả mới' },
                address: { type: 'STRING', description: 'Địa chỉ mới' },
                phone: { type: 'STRING', description: 'Số điện thoại mới' },
                website: { type: 'STRING', description: 'Website mới' },
                latitude: { type: 'NUMBER', description: 'Vĩ độ mới' },
                longitude: { type: 'NUMBER', description: 'Kinh độ mới' },
              },
              required: ['id'],
            },
          },
          {
            name: 'deleteReview',
            description: 'Xóa hoặc gỡ bỏ một nhận xét đánh giá của người dùng khỏi hệ thống.',
            parameters: {
              type: 'OBJECT',
              properties: {
                id: { type: 'STRING', description: 'ID của đánh giá (dưới dạng chuỗi số)' },
              },
              required: ['id'],
            },
          },
        ],
      },
    ];
  }

  // Tool Call Handlers
  private async handleToolCall(name: string, args: any) {
    this.logger.log(`Executing tool call: ${name} with args: ${JSON.stringify(args)}`);
    try {
      switch (name) {
        case 'getDatabaseStats': {
          const [totalPlaces, totalReviews, totalUsers, categories] = await Promise.all([
            this.prisma.place.count(),
            this.prisma.review.count(),
            this.prisma.user.count(),
            this.prisma.category.findMany({
              include: { _count: { select: { places: true } } },
            }),
          ]);

          return {
            totalPlaces,
            totalReviews,
            totalUsers,
            categoryStats: categories.map((c) => ({
              name: c.name,
              count: c._count.places,
              iconCode: c.iconCode,
            })),
          };
        }

        case 'searchPlaces': {
          const { query, categoryName } = args;
          const whereClause: any = {};
          if (query) {
            const keywords = query.trim().split(/\s+/).filter(Boolean);
            if (keywords.length > 0) {
              whereClause.AND = keywords.map((word) => ({
                OR: [
                  { name: { contains: word, mode: 'insensitive' } },
                  { address: { contains: word, mode: 'insensitive' } },
                ],
              }));
            }
          }
          if (categoryName) {
            whereClause.category = { name: { contains: categoryName, mode: 'insensitive' } };
          }

          const places = await this.prisma.place.findMany({
            where: whereClause,
            take: 6,
            include: { category: true },
          });

          return {
            places: places.map((p) => ({
              id: p.id.toString(),
              name: p.name,
              category: p.category.name,
              address: p.address,
              latitude: p.latitude,
              longitude: p.longitude,
              phone: p.phone,
              website: p.website,
            })),
          };
        }

        case 'searchReviews': {
          const { query, rating } = args;
          const whereClause: any = {};
          if (query) {
            const keywords = query.trim().split(/\s+/).filter(Boolean);
            if (keywords.length > 0) {
              whereClause.AND = keywords.map((word) => ({
                comment: { contains: word, mode: 'insensitive' },
              }));
            }
          }
          if (rating) {
            whereClause.rating = Number(rating);
          }

          const reviews = await this.prisma.review.findMany({
            where: whereClause,
            take: 6,
            include: { place: true },
            orderBy: { id: 'desc' },
          });

          return {
            reviews: reviews.map((r) => ({
              id: r.id.toString(),
              placeName: r.place.name,
              rating: r.rating,
              comment: r.comment,
              authorName: r.authorName || 'Ẩn danh',
              authorLocation: r.authorLocation || 'Việt Nam',
            })),
          };
        }

        case 'updatePlaceDetails': {
          const { id, name, description, address, phone, website, latitude, longitude } = args;
          const updateData: any = {};
          if (name) updateData.name = name;
          if (description) updateData.description = description;
          if (address) updateData.address = address;
          if (phone) updateData.phone = phone;
          if (website) updateData.website = website;
          if (latitude) updateData.latitude = latitude;
          if (longitude) updateData.longitude = longitude;

          const updated = await this.prisma.place.update({
            where: { id: BigInt(id) },
            data: updateData,
          });

          return {
            success: true,
            placeId: id,
            updatedName: updated.name,
          };
        }

        case 'deleteReview': {
          const { id } = args;
          await this.prisma.review.delete({
            where: { id: BigInt(id) },
          });

          return {
            success: true,
            reviewId: id,
          };
        }

        default:
          return { error: `Tool ${name} not found` };
      }
    } catch (err) {
      this.logger.error(`Error in tool call ${name}: ${err.message}`);
      return { error: err.message };
    }
  }

  // Main chat session call
  async chat(message: string, history: any[] = []) {
    if (this.apiKeys.length === 0) {
      return {
        text: 'Lỗi cấu trúc: Hệ thống chưa cấu hình AI_API_KEY trong tệp .env.',
        widgets: [],
      };
    }

    // Convert history format to Gemini format
    const formattedContents = [
      ...history.map((h) => ({
        role: h.role === 'model' ? 'model' : 'user',
        parts: [{ text: h.parts?.[0]?.text || '' }],
      })),
      { role: 'user', parts: [{ text: message }] },
    ];

    try {
      // Keep track of current session turns including tool responses
      let currentSessionContents = [...formattedContents];
      const widgetMetadata: any[] = [];

      let iteration = 0;
      const maxIterations = 5;

      while (iteration < maxIterations) {
        iteration++;
        const response = await this.postWithKeyRotation(
          'models/gemini-1.5-flash:generateContent',
          {
            contents: currentSessionContents,
            systemInstruction: {
              parts: [{ text: this.getSystemInstruction() }],
            },
            tools: this.getTools(),
          }
        );

        const candidate = response.data?.candidates?.[0];
        const parts = candidate?.content?.parts || [];
        const functionCalls = parts.filter((p: any) => p.functionCall);

        if (functionCalls.length > 0) {
          // Handle tool calls
          const toolResults: any[] = [];
          for (const call of functionCalls) {
            const { name, args } = call.functionCall;
            const result = await this.handleToolCall(name, args);
            toolResults.push({
              functionResponse: {
                name,
                response: { name, content: result },
              },
            });
            widgetMetadata.push({ toolName: name, args, result });
          }

          // Append candidate and response back to contents for next turn
          currentSessionContents.push(candidate.content);
          currentSessionContents.push({ role: 'user', parts: toolResults });
        } else {
          // No more function calls, return final response text
          const finalText = parts[0]?.text || '';
          return {
            text: finalText,
            widgets: widgetMetadata,
          };
        }
      }

      return {
        text: 'Đã đạt giới hạn số lần truy vấn công cụ liên tiếp.',
        widgets: widgetMetadata,
      };
    } catch (err: any) {
      this.logger.error(`Gemini AI Chat Error: ${err.message}`);
      const apiErrorMessage = err.response?.data?.error?.message || '';
      const isQuotaExceeded = err.response?.status === 429 || 
        apiErrorMessage.toLowerCase().includes('quota') || 
        err.message.toLowerCase().includes('quota') ||
        err.message.includes('429');

      if (isQuotaExceeded) {
        return {
          text: 'MoodBros đang nhận quá nhiều yêu cầu cùng lúc (Rate Limit của gói AI miễn phí). Bạn vui lòng đợi khoảng 8-10 giây rồi gửi lại câu lệnh nhé! 🙏',
          widgets: [],
        };
      }

      return {
        text: `Lỗi kết nối AI: ${apiErrorMessage || err.message}`,
        widgets: [],
      };
    }
  }
}
