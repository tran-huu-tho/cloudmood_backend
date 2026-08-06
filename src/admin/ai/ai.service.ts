import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { NotificationsService } from '../../shared/notifications/notifications.service';
import { GoogleGenAI, Type } from '@google/genai';
import axios from 'axios';

const PRIMARY_MODEL = 'gemini-3.6-flash';
const FALLBACK_MODELS = [
  'gemini-3.5-flash',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
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
      'Bạn là CloudBros - Trợ lý AI Quản trị viên Chuyên nghiệp & Lịch sự của hệ thống CloudMood (Nền tảng Du lịch Cần Thơ).\n\n' +
      'TÍNH CÁCH & PHONG CÁCH PHẢN HỒI:\n' +
      '- Xưng "CloudBros" hoặc "em" và gọi người dùng là "Admin".\n' +
      '- Giọng điệu: Lịch sự, chuyên nghiệp, điềm đạm, khiêm tốn và tôn trọng. TUYỆT ĐỐI KHÔNG sử dụng các từ ngữ nhí nhảnh quá đà (không dùng từ "Sếp siêu cấp đẹp trai", "phá đảo", "phục vụ tận răng", "phát lệnh", "dữ nha").\n' +
      '- Trình bày định dạng Markdown ngắn gọn, rõ ràng, gọn gàng và súc tích.\n\n' +
      'QUY TẮC CSDL NGHỆM NGẶT (STRICT DATABASE GROUNDING):\n' +
      '1. CHỈ SỬ DỤNG DỮ LIỆU CSDL CLOUDMOOD CẦN THƠ HỢP LỆ: Bạn chỉ được phép phản hồi thông tin dựa trên danh sách địa điểm thực tế đang có trong CSDL. TUYỆT ĐỐI KHÔNG bịa đặt địa điểm, không nhắc đến các địa điểm đã bị xóa khỏi CSDL hay các địa điểm ngoài hệ thống.\n' +
      '2. KHI HỎI NGOÀI LỀ HOẶC KHÔNG CÓ TRONG CSDL: Báo lại lịch sự và rõ ràng: "Dạ thông tin/địa điểm này hiện chưa có trong cơ sở dữ liệu CloudMood Cần Thơ của hệ thống ạ."'
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

  // Main chat method using Google Interactions API / @google/genai SDK / OpenAI fallback
  async chat(message: string, history: any[] = []) {
    const rawKey = this.configService.get<string>('AI_API_KEY') || '';
    const apiKey = rawKey.split(',')[0].trim().replace(/^["']|["']$/g, '');

    // 1. UƯ TIÊN DÙNG GOOGLE INTERACTIONS API CHUẨN MỚI NHẤT DÀNH CHO GEMINI (NĂM 2026)
    if (apiKey) {
      const modelsToTry = [PRIMARY_MODEL, ...FALLBACK_MODELS];
      for (const modelName of modelsToTry) {
        try {
          this.logger.log(`[CloudBros AI] Calling Google Interactions API (${modelName})...`);
          return await this.runChatWithGeminiInteractions(modelName, message, history);
        } catch (err: any) {
          this.logger.warn(`Interactions API model ${modelName} gặp lỗi: ${err?.message || err}, thử tiếp...`);
        }
      }

      // Thử tiếp bằng Google GenAI SDK chính thống
      if (this.client) {
        const formattedHistory = history.map((h) => ({
          role: h.role === 'model' ? 'model' : 'user',
          parts: [{ text: h.parts?.[0]?.text || '' }],
        }));

        for (const modelName of modelsToTry) {
          try {
            this.logger.log(`[CloudBros AI] Calling Google GenAI SDK (${modelName})...`);
            return await this.runChatWithModel(modelName, message, formattedHistory);
          } catch (err: any) {
            this.logger.warn(`Google GenAI SDK model ${modelName} gặp lỗi: ${err?.message || err}, thử tiếp...`);
          }
        }
      }
    }

    // 2. DỰ PHÒNG DÙNG OPENAI API KHI GEMINI GẶP LỖI
    if (process.env.OPENAI_API_KEY) {
      try {
        this.logger.log('[CloudBros AI] Calling OpenAI Engine (gpt-4o-mini)...');
        return await this.runChatWithOpenAI(message, history);
      } catch (err: any) {
        this.logger.error(`[CloudBros AI] OpenAI Engine error: ${err?.message || err}`);
      }
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

  private async runChatWithGeminiInteractions(
    modelName: string,
    message: string,
    history: any[],
  ): Promise<{ text: string; widgets: any[] }> {
    const rawKey = this.configService.get<string>('AI_API_KEY') || '';
    const apiKey = rawKey.split(',')[0].trim().replace(/^["']|["']$/g, '');
    if (!apiKey) throw new Error('Chưa cấu hình AI_API_KEY trong file .env');

    // Pre-fetch matching or sample real places from CloudMood Cần Thơ DB for 100% accurate RAG Context
    let dbContext = '';
    try {
      const keywords = message.trim().split(/\s+/).filter((w) => w.length > 1);
      let matchedPlaces: any[] = [];
      if (keywords.length > 0) {
        matchedPlaces = await this.prisma.place.findMany({
          where: {
            isApproved: true,
            OR: keywords.map((kw) => ({
              OR: [
                { name: { contains: kw, mode: 'insensitive' } },
                { address: { contains: kw, mode: 'insensitive' } },
              ],
            })),
          },
          take: 6,
          include: { category: true },
        });
      }

      if (matchedPlaces.length === 0) {
        matchedPlaces = await this.prisma.place.findMany({
          where: { isApproved: true },
          take: 5,
          include: { category: true },
          orderBy: { id: 'desc' },
        });
      }

      if (matchedPlaces.length > 0) {
        dbContext = `\n\n[DỮ LIỆU ĐỊA ĐIỂM THỰC TẾ ĐANG CÓ TRONG CSDL CLOUDMOOD CẦN THƠ (TUYỆT ĐỐI CHỈ DÙNG TÊN CÓ TRONG NÀY)]:\n` +
          matchedPlaces.map((p) => `- ${p.name} (ID: ${p.id}): Địa chỉ ${p.address}`).join('\n');
      }
    } catch {
      /* ignore pre-fetch error */
    }

    let fullPrompt = `${this.getSystemInstruction()}${dbContext}\n\n`;
    if (history && history.length > 0) {
      fullPrompt += `LỊCH SỬ TRÒ CHUYỆN:\n`;
      for (const h of history) {
        const roleName = h.role === 'model' || h.role === 'assistant' ? 'CloudBros' : 'Admin';
        const txt = h.parts?.[0]?.text || h.content || '';
        if (txt) fullPrompt += `${roleName}: ${txt}\n`;
      }
    }
    fullPrompt += `\nAdmin: ${message}`;

    const url = 'https://generativelanguage.googleapis.com/v1beta/interactions';
    const payload = {
      model: modelName,
      input: fullPrompt,
    };

    const response = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
    });

    const data = response.data;
    const steps = Array.isArray(data?.steps) ? data.steps : [];
    const modelStep = steps.find((s: any) => s.type === 'model_output');
    const textOutput =
      modelStep?.content?.[0]?.text ||
      data?.output ||
      data?.choices?.[0]?.message?.content ||
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      (typeof data === 'string' ? data : 'Xin chào Admin! CloudBros đã sẵn sàng hỗ trợ bạn.');

    return {
      text: typeof textOutput === 'string' ? textOutput : JSON.stringify(textOutput),
      widgets: [],
    };
  }

  private async runChatWithOpenAI(message: string, history: any[]): Promise<{ text: string; widgets: any[] }> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('No OpenAI API key');

    const openAiTools = [
      {
        type: 'function',
        function: {
          name: 'getDatabaseStats',
          description: 'Lấy các số liệu thống kê chung của hệ thống: tổng số địa điểm, tổng số người dùng, tổng số đánh giá và số địa điểm trong từng danh mục.',
          parameters: { type: 'object', properties: {} },
        },
      },
      {
        type: 'function',
        function: {
          name: 'searchPlaces',
          description: 'Tìm kiếm danh sách địa điểm trong hệ thống theo tên hoặc địa chỉ.',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Từ khóa tìm kiếm trong tên hoặc địa chỉ.' },
              categoryName: { type: 'string', description: 'Tên danh mục cần lọc' },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'searchReviews',
          description: 'Tìm kiếm nhận xét/đánh giá của người dùng trong hệ thống.',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Từ khóa tìm kiếm trong nội dung bình luận.' },
              rating: { type: 'number', description: 'Số sao đánh giá cần lọc (1-5)' },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'updatePlaceDetails',
          description: 'Cập nhật thông tin chi tiết của một địa điểm trong hệ thống.',
          parameters: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'ID của địa điểm (dưới dạng chuỗi số)' },
              name: { type: 'string', description: 'Tên địa điểm mới' },
              description: { type: 'string', description: 'Mô tả mới' },
              address: { type: 'string', description: 'Địa chỉ mới' },
              phone: { type: 'string', description: 'Số điện thoại mới' },
              website: { type: 'string', description: 'Website mới' },
              latitude: { type: 'number', description: 'Vĩ độ mới' },
              longitude: { type: 'number', description: 'Kinh độ mới' },
            },
            required: ['id'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'deleteReview',
          description: 'Xóa hoặc gỡ bỏ một nhận xét đánh giá của người dùng khỏi hệ thống.',
          parameters: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'ID của đánh giá (dưới dạng chuỗi số)' },
            },
            required: ['id'],
          },
        },
      },
    ];

    const messages: any[] = [
      { role: 'system', content: this.getSystemInstruction() },
    ];

    for (const h of history) {
      const role = h.role === 'model' || h.role === 'assistant' ? 'assistant' : 'user';
      const text = h.parts?.[0]?.text || h.content || '';
      if (text) messages.push({ role, content: text });
    }

    messages.push({ role: 'user', content: message });

    const widgetMetadata: any[] = [];
    const maxTurns = 5;

    for (let i = 0; i < maxTurns; i++) {
      const res = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4o-mini',
          messages,
          tools: openAiTools,
          tool_choice: 'auto',
          temperature: 0.7,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const choice = res.data?.choices?.[0]?.message;
      if (!choice) break;

      messages.push(choice);

      if (choice.tool_calls && choice.tool_calls.length > 0) {
        for (const tc of choice.tool_calls) {
          const name = tc.function.name;
          const args = JSON.parse(tc.function.arguments || '{}');
          const toolResult = await this.handleToolCall(name, args);

          if (name === 'getDatabaseStats') {
            widgetMetadata.push({ type: 'stats', data: toolResult });
          } else if (name === 'searchPlaces' && toolResult.places) {
            widgetMetadata.push({ type: 'places', data: toolResult.places });
          } else if (name === 'searchReviews' && toolResult.reviews) {
            widgetMetadata.push({ type: 'reviews', data: toolResult.reviews });
          }

          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify(toolResult),
          });
        }
      } else {
        return {
          text: choice.content || 'Đã thực hiện xong.',
          widgets: widgetMetadata,
        };
      }
    }

    const lastMsg = messages[messages.length - 1];
    return {
      text: typeof lastMsg?.content === 'string' ? lastMsg.content : 'Hoàn tất xử lý.',
      widgets: widgetMetadata,
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
