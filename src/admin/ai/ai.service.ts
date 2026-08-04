import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { NotificationsService } from '../../shared/notifications/notifications.service';
import { GoogleGenAI, Type } from '@google/genai';

const PRIMARY_MODEL = 'gemini-3.5-flash';
const FALLBACK_MODELS = [
  'gemini-3.6-flash',
  'gemini-2.5-flash',
  'gemini-2-flash',
  'gemini-2.5-flash-lite',
];

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly client: GoogleGenAI | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {
    const rawKey = this.configService.get<string>('AI_API_KEY') || '';
    const apiKey = rawKey.split(',')[0].trim().replace(/^["']|["']$/g, '');
    if (apiKey) {
      this.client = new GoogleGenAI({ apiKey });
    }
  }

  // System instructions for the model
  private getSystemInstruction(): string {
    return (
      'Bạn là CloudBros, trợ lý AI đồng hành dành riêng cho trang Admin của hệ thống CloudMood. ' +
      'Bạn có thể truy xuất số liệu thống kê, tìm kiếm địa điểm, tìm kiếm nhận xét, sửa đổi thông tin địa điểm và xóa/duyệt nhận xét thông qua các công cụ (tools) được cung cấp. ' +
      'Hãy trả lời bằng tiếng Việt ngắn gọn, chuyên nghiệp. Nếu thực hiện thành công các thao tác cập nhật hay xóa, hãy thông báo rõ ràng cho Admin.'
    );
  }

  // Function declarations for tools
  private getTools() {
    return [
      {
        functionDeclarations: [
          {
            name: 'getDatabaseStats',
            description:
              'Lấy các số liệu thống kê chung của hệ thống: tổng số địa điểm, tổng số người dùng, tổng số đánh giá và số địa điểm trong từng danh mục.',
          },
          {
            name: 'searchPlaces',
            description:
              'Tìm kiếm danh sách địa điểm trong hệ thống theo tên hoặc địa chỉ.',
            parameters: {
              type: Type.OBJECT,
              properties: {
                query: {
                  type: Type.STRING,
                  description: 'Từ khóa tìm kiếm trong tên hoặc địa chỉ.',
                },
                categoryName: {
                  type: Type.STRING,
                  description:
                    'Tên danh mục cần lọc (ví dụ: Khách sạn, Cà phê, Quán ăn, v.v.)',
                },
              },
            },
          },
          {
            name: 'searchReviews',
            description:
              'Tìm kiếm nhận xét/đánh giá của người dùng trong hệ thống.',
            parameters: {
              type: Type.OBJECT,
              properties: {
                query: {
                  type: Type.STRING,
                  description: 'Từ khóa tìm kiếm trong nội dung bình luận.',
                },
                rating: {
                  type: Type.NUMBER,
                  description: 'Số sao đánh giá cần lọc (1-5)',
                },
              },
            },
          },
          {
            name: 'updatePlaceDetails',
            description:
              'Cập nhật thông tin chi tiết của một địa điểm trong hệ thống.',
            parameters: {
              type: Type.OBJECT,
              properties: {
                id: {
                  type: Type.STRING,
                  description: 'ID của địa điểm (dưới dạng chuỗi số)',
                },
                name: { type: Type.STRING, description: 'Tên địa điểm mới' },
                description: { type: Type.STRING, description: 'Mô tả mới' },
                address: { type: Type.STRING, description: 'Địa chỉ mới' },
                phone: { type: Type.STRING, description: 'Số điện thoại mới' },
                website: { type: Type.STRING, description: 'Website mới' },
                latitude: { type: Type.NUMBER, description: 'Vĩ độ mới' },
                longitude: { type: Type.NUMBER, description: 'Kinh độ mới' },
              },
              required: ['id'],
            },
          },
          {
            name: 'deleteReview',
            description:
              'Xóa hoặc gỡ bỏ một nhận xét đánh giá của người dùng khỏi hệ thống.',
            parameters: {
              type: Type.OBJECT,
              properties: {
                id: {
                  type: Type.STRING,
                  description: 'ID của đánh giá (dưới dạng chuỗi số)',
                },
              },
              required: ['id'],
            },
          },
        ],
      },
    ];
  }

  // Tool call handlers
  private async handleToolCall(name: string, args: any): Promise<any> {
    this.logger.log(
      `Executing tool: ${name} with args: ${JSON.stringify(args)}`,
    );
    try {
      switch (name) {
        case 'getDatabaseStats': {
          const [totalPlaces, totalReviews, totalUsers, categories] =
            await Promise.all([
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
            whereClause.category = {
              name: { contains: categoryName, mode: 'insensitive' },
            };
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

          return { success: true, placeId: id, updatedName: updated.name };
        }

        case 'deleteReview': {
          const { id } = args;
          await this.prisma.review.delete({ where: { id: BigInt(id) } });
          return { success: true, reviewId: id };
        }

        default:
          return { error: `Tool ${name} not found` };
      }
    } catch (err: any) {
      this.logger.error(`Error in tool call ${name}: ${err.message}`);
      return { error: err.message };
    }
  }

  // Main chat method using @google/genai SDK
  async chat(message: string, history: any[] = []) {
    if (!this.client) {
      return {
        text: 'Lỗi cấu trúc: Hệ thống chưa cấu hình AI_API_KEY trong tệp .env.',
        widgets: [],
      };
    }

    // Convert history to SDK format
    const formattedHistory = history.map((h) => ({
      role: h.role === 'model' ? 'model' : 'user',
      parts: [{ text: h.parts?.[0]?.text || '' }],
    }));

    const modelsToTry = [PRIMARY_MODEL, ...FALLBACK_MODELS];
    let lastErr: any = null;

    for (const modelName of modelsToTry) {
      try {
        const result = await this.runChatWithModel(
          modelName,
          message,
          formattedHistory,
        );
        return result;
      } catch (err: any) {
        lastErr = err;
        const errMsg = (err?.message || '').toLowerCase();
        this.logger.error(`CloudBros AI Error [${modelName}]: message="${err?.message}", status=${err?.status}, stack=${err?.stack}`);

        const isApiKeyError =
          errMsg.includes('api key') ||
          errMsg.includes('apikey') ||
          errMsg.includes('unauthorized') ||
          errMsg.includes('forbidden') ||
          err?.status === 401 ||
          err?.status === 403;

        if (isApiKeyError) {
          return {
            text: `Lỗi API Key: Khóa AI_API_KEY không hợp lệ hoặc đã bị vô hiệu hóa. Vui lòng tạo API Key mới từ Google AI Studio (https://aistudio.google.com/app/apikey) và cập nhật file .env.`,
            widgets: [],
          };
        }

        const isModelUnavailable =
          errMsg.includes('not found') ||
          errMsg.includes('no longer available') ||
          errMsg.includes('deprecated') ||
          err?.status === 404;

        this.logger.warn(`Model ${modelName} gặp lỗi [${err?.status || '503'}], thử model tiếp theo...`);
        continue;
      }
    }

    this.logger.error(`Tất cả model AI đều thất bại: ${lastErr?.message}`);
    const lastMsg = (lastErr?.message || '').toLowerCase();
    if (lastErr?.status === 429 || lastErr?.status === 503 || lastMsg.includes('high demand') || lastMsg.includes('quota')) {
      return {
        text: 'Máy chủ AI Gemini hiện đang quá tải cục bộ (Lỗi 503/429). Vui lòng chờ 10-15 giây rồi thử lại 🙏',
        widgets: [],
      };
    }

    return {
      text: `Lỗi kết nối Gemini API (${lastErr?.status || 'Unknown'}): ${lastErr?.message || 'Không thể gọi AI'}`,
      widgets: [],
    };
  }

  private async runChatWithModel(
    modelName: string,
    message: string,
    history: any[],
  ): Promise<{ text: string; widgets: any[] }> {
    const widgetMetadata: any[] = [];
    const maxIterations = 5;

    // Build a fresh contents array for this call
    const contents: any[] = [
      ...history,
      { role: 'user', parts: [{ text: message }] },
    ];

    for (let i = 0; i < maxIterations; i++) {
      const response = await this.client!.models.generateContent({
        model: modelName,
        contents,
        config: {
          systemInstruction: this.getSystemInstruction(),
          tools: this.getTools() as any,
        },
      });

      const candidate = response.candidates?.[0];
      const parts = candidate?.content?.parts || [];
      const functionCalls = parts.filter((p: any) => p.functionCall);

      if (functionCalls.length > 0) {
        // Append model response to contents
        contents.push(candidate!.content);

        // Execute all tool calls
        const toolResults: any[] = [];
        for (const part of functionCalls) {
          const { name, args } = part.functionCall as any;
          const result = await this.handleToolCall(name, args);
          toolResults.push({
            functionResponse: {
              name,
              response: { name, content: result },
            },
          });
          widgetMetadata.push({ toolName: name, args, result });
        }

        // Append tool results as user turn
        contents.push({ role: 'user', parts: toolResults });
      } else {
        // Final text response
        const finalText = parts.find((p: any) => p.text)?.text || '';
        return { text: finalText, widgets: widgetMetadata };
      }
    }

    return {
      text: 'Đã đạt giới hạn số lần truy vấn công cụ liên tiếp.',
      widgets: widgetMetadata,
    };
  }
}
