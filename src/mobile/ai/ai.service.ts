import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { RuleEngineService } from './rule-engine.service';
import { WeatherService } from '../../shared/weather/weather.service';
import { ChildProcess, spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { Observable, Subject } from 'rxjs';

interface GeminiPart {
  text?: string;
}
interface GeminiContent {
  parts?: GeminiPart[];
}
interface GeminiCandidate {
  content?: GeminiContent;
}
interface GeminiResponseData {
  candidates?: GeminiCandidate[];
}

@Injectable()
export class MobileAiService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MobileAiService.name);
  private readonly apiKey: string = '';
  private pythonProcess: ChildProcess | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly ruleEngine: RuleEngineService,
    private readonly weatherService: WeatherService,
  ) {
    const rawKey = this.configService.get<string>('AI_API_KEY') || '';
    this.apiKey = rawKey.split(',')[0].trim();
  }


  async getDbStats() {
    const totalPlaces = await this.prisma.place.count();
    const places = await this.prisma.place.findMany({
      select: { id: true, name: true, address: true, category: { select: { name: true } } },
    });

    const cityCounts: Record<string, number> = {};
    const categoryCounts: Record<string, number> = {};

    for (const p of places) {
      const cat = p.category?.name || 'Khác';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;

      const addr = p.address || '';
      let city = 'Khác / Chưa rõ';
      if (addr.includes('Cần Thơ')) city = 'Cần Thơ';
      else if (addr.includes('HCM') || addr.includes('Hồ Chí Minh') || addr.includes('Sài Gòn') || addr.includes('Quận') || addr.includes('Thủ Đức')) city = 'TP. Hồ Chí Minh';
      else if (addr.includes('Đà Lạt') || addr.includes('Lâm Đồng')) city = 'Đà Lạt';
      else if (addr.includes('Vũng Tàu') || addr.includes('Bà Rịa')) city = 'Vũng Tàu';
      else if (addr.includes('An Giang') || addr.includes('Long Xuyên')) city = 'An Giang';
      else if (addr.includes('Hà Nội')) city = 'Hà Nội';
      else if (addr.includes('Đà Nẵng')) city = 'Đà Nẵng';

      cityCounts[city] = (cityCounts[city] || 0) + 1;
    }

    return {
      totalPlaces,
      cityCounts,
      categoryCounts,
      samplePlaces: places.slice(0, 15).map((p) => ({
        id: Number(p.id),
        name: p.name,
        address: p.address,
        category: p.category?.name,
      })),
    };
  }

  private async postWithKeyRotation(
    urlPath: string,
    payload: any,
  ): Promise<any> {
    if (!this.apiKey) {
      throw new Error('Chưa cấu hình AI_API_KEY trong tệp .env.');
    }

    const operation = urlPath.includes(':')
      ? urlPath.split(':')[1]
      : 'generateContent';

    const modelsToTry = [
      'models/gemini-3.5-flash',
      'models/gemini-3.6-flash',
      'models/gemini-2.5-flash',
      'models/gemini-2.5-flash-lite',
      'models/gemini-2.0-flash',
      'models/gemini-1.5-flash',
      'models/gemini-1.5-pro',
    ];

    let lastError: any;

    for (const model of modelsToTry) {
      const url = `https://generativelanguage.googleapis.com/v1beta/${model}:${operation}?key=${this.apiKey}`;

      try {
        const response = await axios.post(url, payload, { timeout: 30000 });
        return response;
      } catch (err: any) {
        lastError = err;
        const status = err.response?.status;
        const apiErrorMessage = err.response?.data?.error?.message || '';
        this.logger.warn(
          `Mô hình ${model} không khả dụng (Mã ${status}): ${apiErrorMessage || err.message}. Đang thử mô hình tiếp theo...`,
        );
      }
    }

    throw lastError || new Error('Tất cả mô hình AI đều gặp lỗi.');
  }

  private async postOpenAIChatCompletion(
    systemInstruction: string,
    userPrompt: string,
  ): Promise<any> {
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      throw new Error('Chưa cấu hình OPENAI_API_KEY trong tệp .env.');
    }

    const models = ['gpt-4o', 'gpt-4o-mini'];
    let lastError: any = null;

    for (const model of models) {
      try {
        this.logger.log(`[OPENAI] Calling ${model}...`);
        const payload = {
          model,
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: userPrompt },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.7,
        };

        const response = await axios.post(
          'https://api.openai.com/v1/chat/completions',
          payload,
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${openaiApiKey}`,
            },
            timeout: 45000,
          },
        );
        return response;
      } catch (err: any) {
        lastError = err;
        const status = err.response?.status;
        const apiErrorMessage = err.response?.data?.error?.message || '';
        this.logger.warn(
          `OpenAI model ${model} failed (Status ${status}): ${apiErrorMessage || err.message}. trying next...`,
        );
      }
    }

    throw lastError || new Error('Tất cả mô hình OpenAI đều gặp lỗi.');
  }

  // ============================================
  // RAG-LITE: Query dữ liệu thực từ database
  // ============================================

  private async getPlaceContext(placeName: string): Promise<string> {
    try {
      // Tìm place trong DB (fuzzy match)
      const place = await this.prisma.place.findFirst({
        where: {
          OR: [
            { name: { contains: placeName, mode: 'insensitive' } },
            { address: { contains: placeName, mode: 'insensitive' } },
          ],
        },
        include: {
          category: true,
          reviews: {
            take: 5,
            orderBy: { rating: 'desc' },
          },
        },
      });

      if (!place) return '';

      const parts: string[] = [];
      parts.push(`\n--- DỮ LIỆU THỰC TẾ TỪ HỆ THỐNG CLOUDMOOD ---`);
      parts.push(`Tên: ${place.name}`);
      parts.push(`Địa chỉ: ${place.address}`);
      if (place.description) parts.push(`Mô tả: ${place.description}`);
      if (place.category) parts.push(`Danh mục: ${place.category.name}`);
      if (place.rating) parts.push(`Đánh giá trung bình: ${place.rating}/5 (${place.userRatingCount || 0} lượt đánh giá)`);

      // Price
      if (place.price && place.price !== 'Liên hệ') {
        parts.push(`Giá/Chi phí: ${place.price}`);
      }
      if (place.priceLevel) {
        const priceLevelMap: Record<string, string> = {
          'BUDGET': 'Giá rẻ',
          'MODERATE': 'Trung bình',
          'EXPENSIVE': 'Cao cấp',
          'LUXURY': 'Sang trọng',
        };
        parts.push(`Mức giá: ${priceLevelMap[place.priceLevel] || place.priceLevel}`);
      }

      // Opening hours
      if (place.openingHours) {
        try {
          const hours = typeof place.openingHours === 'string'
            ? JSON.parse(place.openingHours)
            : place.openingHours;
          if (Array.isArray(hours) && hours.length > 0) {
            parts.push(`Giờ mở cửa: ${hours.join('; ')}`);
          } else if (typeof hours === 'object' && hours !== null) {
            parts.push(`Giờ mở cửa: ${JSON.stringify(hours)}`);
          }
        } catch { /* ignore parse error */ }
      }

      // Contact
      if (place.phone) parts.push(`Điện thoại: ${place.phone}`);
      if (place.website) parts.push(`Website: ${place.website}`);

      // Reviews
      if (place.reviews && place.reviews.length > 0) {
        parts.push(`\nĐánh giá từ người dùng:`);
        place.reviews.forEach((r, i) => {
          const author = r.authorName || 'Người dùng';
          parts.push(`  ${i + 1}. ${author} (${r.rating}⭐): "${r.comment.substring(0, 150)}${r.comment.length > 150 ? '...' : ''}"`);
        });
      }

      parts.push(`--- HẾT DỮ LIỆU ---`);
      parts.push(`Hãy ưu tiên dùng dữ liệu thực ở trên để trả lời. Nếu dữ liệu không đủ, hãy dùng kiến thức chung nhưng nói rõ "theo thông tin chung".`);

      return parts.join('\n');
    } catch (error) {
      this.logger.error('Error fetching place context', error);
      return '';
    }
  }

  private async getDestinationContext(destination: string): Promise<string> {
    try {
      // Lấy top places tại destination
      const places = await this.prisma.place.findMany({
        where: {
          address: { contains: destination, mode: 'insensitive' },
          isApproved: true,
        },
        include: { category: true },
        orderBy: [{ userRatingCount: { sort: 'desc', nulls: 'last' } }],
        take: 10,
      });

      if (places.length === 0) return '';

      const parts: string[] = [];
      parts.push(`\n--- DỮ LIỆU THỰC TẾ TỪ HỆ THỐNG CLOUDMOOD ---`);
      parts.push(`Các địa điểm nổi bật tại ${destination}:`);

      // Nhóm theo category
      const byCategory: Record<string, any[]> = {};
      places.forEach(p => {
        const cat = p.category?.name || 'Khác';
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(p);
      });

      Object.entries(byCategory).forEach(([cat, items]) => {
        parts.push(`\n📌 ${cat}:`);
        items.forEach(p => {
          const ratingStr = p.rating ? ` (${p.rating}⭐)` : '';
          parts.push(`  - ${p.name}${ratingStr} — ${p.address}`);
        });
      });

      parts.push(`\n--- HẾT DỮ LIỆU ---`);
      parts.push(`Hãy ưu tiên gợi ý các địa điểm có trong dữ liệu trên. Nếu cần thêm, hãy dùng kiến thức chung nhưng nói rõ.`);

      return parts.join('\n');
    } catch (error) {
      this.logger.error('Error fetching destination context', error);
      return '';
    }
  }

  // ============================================
  // SUGGESTIONS API: Câu hỏi gợi ý thông minh
  // ============================================

  async getSuggestions(placeName: string, type: 'place' | 'trip' = 'place'): Promise<string[]> {
    if (type === 'trip') {
      return this.getTripSuggestions(placeName);
    }
    return this.getPlaceSuggestions(placeName);
  }

  private async getPlaceSuggestions(placeName: string): Promise<string[]> {
    const suggestions: string[] = [];

    try {
      const place = await this.prisma.place.findFirst({
        where: {
          OR: [
            { name: { contains: placeName, mode: 'insensitive' } },
            { address: { contains: placeName, mode: 'insensitive' } },
          ],
        },
        include: {
          reviews: { take: 1 },
          category: true,
        },
      });

      if (place) {
        // Chỉ hiện câu hỏi giờ mở cửa nếu có dữ liệu
        if (place.openingHours) {
          suggestions.push(`Giờ mở cửa ở đây thế nào?`);
        }

        // Chỉ hiện câu hỏi giá nếu có dữ liệu price thực
        if (place.price && place.price !== 'Liên hệ' && place.price.trim() !== '') {
          suggestions.push(`Chi phí tham quan ở đây là bao nhiêu?`);
        }

        // Chỉ hiện câu hỏi review nếu có reviews
        if (place.reviews && place.reviews.length > 0) {
          suggestions.push(`Mọi người đánh giá nơi này thế nào?`);
        }

        // Câu hỏi theo category
        const catName = place.category?.name?.toLowerCase() || '';
        if (catName.includes('nhà hàng') || catName.includes('quán') || catName.includes('ăn')) {
          suggestions.push(`Món nào ngon nhất ở đây?`);
        } else if (catName.includes('khách sạn') || catName.includes('hotel')) {
          suggestions.push(`Nơi này có tiện nghi nổi bật gì?`);
        }
      }

      // Câu hỏi chung (AI trả lời tốt với kiến thức chung)
      suggestions.push(`Nên dành bao lâu để tham quan ở đây?`);
      suggestions.push(`Có lưu ý hay mẹo gì khi ghé thăm không?`);
      suggestions.push(`Xung quanh đây có gì đáng tham quan?`);

    } catch (error) {
      this.logger.error('Error generating suggestions', error);
      // Fallback: câu hỏi an toàn
      suggestions.push(`Nên dành bao lâu để tham quan ở đây?`);
      suggestions.push(`Có lưu ý hay mẹo gì khi ghé thăm không?`);
      suggestions.push(`Xung quanh đây có gì đáng tham quan?`);
    }

    // Giới hạn tối đa 6 câu hỏi
    return suggestions.slice(0, 6);
  }

  private async getTripSuggestions(destination: string): Promise<string[]> {
    const suggestions: string[] = [];

    try {
      // Kiểm tra xem destination có bao nhiêu places trong DB
      const placeCount = await this.prisma.place.count({
        where: {
          address: { contains: destination, mode: 'insensitive' },
          isApproved: true,
        },
      });

      // Kiểm tra categories có sẵn
      const categories = await this.prisma.place.findMany({
        where: {
          address: { contains: destination, mode: 'insensitive' },
          isApproved: true,
        },
        select: { category: { select: { name: true } } },
        distinct: ['categoryId'],
      });

      const catNames = categories.map(c => c.category.name.toLowerCase());

      if (placeCount > 0) {
        suggestions.push(`Gợi ý lịch trình 3 ngày du lịch`);
      }

      if (catNames.some(c => c.includes('nhà hàng') || c.includes('quán') || c.includes('ăn'))) {
        suggestions.push(`Ẩm thực nổi bật ở đây là gì?`);
      } else {
        suggestions.push(`Ẩm thực ở đây có gì đặc biệt?`);
      }

      suggestions.push(`Nên đi vào tháng nào là đẹp nhất?`);
      suggestions.push(`Phương tiện di chuyển thế nào?`);

      if (placeCount > 5) {
        suggestions.push(`Top 5 địa điểm phải đến nhất?`);
      }

      suggestions.push(`Ngân sách dự kiến khoảng bao nhiêu?`);

    } catch (error) {
      this.logger.error('Error generating trip suggestions', error);
      suggestions.push(`Gợi ý lịch trình 3 ngày du lịch`);
      suggestions.push(`Ẩm thực ở đây có gì đặc biệt?`);
      suggestions.push(`Nên đi vào tháng nào đẹp nhất?`);
    }

    return suggestions.slice(0, 6);
  }

  // ============================================
  // ASK PLACE QUESTION (nâng cấp với RAG-lite)
  // ============================================

  async askPlaceQuestion(placeName: string, question: string): Promise<string> {
    const placeContext = await this.getPlaceContext(placeName);

    const systemInstruction = `Bạn là trợ lý du lịch AI thông minh của ứng dụng CloudMood. Nhiệm vụ của bạn là trả lời các câu hỏi về địa điểm: "${placeName}". Hãy trả lời ngắn gọn, chính xác, thân thiện bằng tiếng Việt. Sử dụng Markdown để format câu trả lời (bold, danh sách, tiêu đề con). Nếu bạn không biết hoặc câu hỏi không liên quan đến địa điểm, hãy từ chối một cách lịch sự.${placeContext}`;

    const payload = {
      system_instruction: {
        parts: [{ text: systemInstruction }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: question }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
      },
    };

    try {
      const response = await this.postWithKeyRotation('models/gemini-2.5-flash:generateContent', payload);
      const data = response.data as GeminiResponseData;
      const candidates = data?.candidates;
      if (candidates && candidates.length > 0) {
        return candidates[0].content?.parts?.[0]?.text || 'Xin lỗi, tôi không thể trả lời câu hỏi này lúc này.';
      }
      return 'Xin lỗi, tôi không thể trả lời câu hỏi này lúc này.';
    } catch (error) {
      this.logger.error('Error in askPlaceQuestion', error);
      throw error;
    }
  }

  // --- New Chat History Methods ---

  async getChatSessions(userId: bigint) {
    return this.prisma.chatSession.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        destination: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async getChatMessages(userId: bigint, sessionId: bigint) {
    const session = await this.prisma.chatSession.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.userId !== userId) {
      throw new Error('Session not found or unauthorized');
    }

    return this.prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
    });
  }

  // ============================================
  // PROCESS CHAT (nâng cấp RAG-lite + Context Window)
  // ============================================

  async processChat(
    userId: bigint,
    sessionId: bigint | undefined,
    destination: string,
    message: string,
    tripConfig?: any,
  ) {
    let currentSessionId = sessionId;

    if (!currentSessionId) {
      // Generate a title based on the first message
      let chatTitle = `Du lịch ${destination}`;
      try {
        const titlePayload = {
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: `Tóm tắt câu hỏi này thành một tiêu đề ngắn gọn (khoảng 2-5 từ) cho một cuộc hội thoại, không cần dấu ngoặc kép, chỉ trả về tiêu đề: "${message}"`,
                },
              ],
            },
          ],
          generationConfig: { temperature: 0.3 },
        };
        const titleResponse = await this.postWithKeyRotation(
          'models/gemini-3.5-flash:generateContent',
          titlePayload,
        );
        const titleCandidates = titleResponse.data?.candidates;
        if (titleCandidates && titleCandidates.length > 0) {
          const generatedTitle =
            titleCandidates[0].content.parts[0].text.trim();
          if (generatedTitle) {
            chatTitle = generatedTitle;
          }
        }
      } catch (error) {
        this.logger.error('Error generating title', error);
      }

      const newSession = await this.prisma.chatSession.create({
        data: {
          userId,
          title: chatTitle,
          destination,
        },
      });
      currentSessionId = newSession.id;
    }

    // Save user message
    await this.prisma.chatMessage.create({
      data: {
        sessionId: currentSessionId,
        role: 'USER',
        content: message,
      },
    });

    // Context Window Management: chỉ lấy 20 tin nhắn gần nhất
    const recentMessages = await this.prisma.chatMessage.findMany({
      where: { sessionId: currentSessionId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const previousMessages = recentMessages.reverse();

    // RAG-lite: Enriched prompt với dữ liệu thực
    const placeContext = await this.getPlaceContext(destination);
    const destinationContext = placeContext || await this.getDestinationContext(destination);

    let configInstruction = '';
    if (tripConfig) {
      const parts: string[] = [];
      if (tripConfig.days) parts.push(`- Thời lượng chuyến đi: ${tripConfig.days} ngày (Giới hạn tối đa 7 ngày).`);
      if (tripConfig.companions) parts.push(`- Thành viên đi cùng: ${tripConfig.companions}.`);
      if (tripConfig.categories && Array.isArray(tripConfig.categories) && tripConfig.categories.length > 0) {
        parts.push(`- Thể loại du lịch yêu thích: ${tripConfig.categories.join(', ')}.`);
      }
      if (tripConfig.pace) parts.push(`- Nhịp độ di chuyển: ${tripConfig.pace}.`);
      if (tripConfig.budget) parts.push(`- Ngân sách: ${tripConfig.budget} ${tripConfig.currency || 'VND'}.`);

      if (parts.length > 0) {
        configInstruction = `\n\n[CẤU HÌNH CHUYẾN ĐI NGƯỜI DÙNG ĐÃ CHỌN]:\n${parts.join('\n')}\n\nLƯU Ý BẮT BUỘC:\n1. Phân chia rõ lịch trình theo từng ngày (Ngày 1, Ngày 2, ...).\n2. Căn cứ vào nhịp độ "${tripConfig.pace || 'Vừa phải'}": nếu "Thong thả" hãy gợi ý 2-3 địa điểm/ngày; nếu "Vừa phải" gợi ý 3-4 địa điểm/ngày; nếu "Dày đặc" gợi ý 5-6 địa điểm/ngày.\n3. Đơn vị tiền tệ ước tính chi phí sử dụng là: ${tripConfig.currency || 'VND'}.`;
      }
    }

    const systemInstruction = `Bạn là trợ lý du lịch AI thông minh của ứng dụng CloudMood. Nhiệm vụ của bạn là hỗ trợ người dùng về chuyến đi tới: "${destination}". Hãy trả lời ngắn gọn, chính xác, thân thiện bằng tiếng Việt. Sử dụng Markdown để format câu trả lời cho dễ đọc (bold, danh sách, tiêu đề con).${destinationContext}${configInstruction}`;

    const contents = previousMessages.map((msg) => ({
      role: msg.role === 'AI' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

    const payload = {
      system_instruction: {
        parts: [{ text: systemInstruction }],
      },
      contents,
      generationConfig: {
        temperature: 0.7,
      },
    };

    let aiReply = 'Xin lỗi, có lỗi xảy ra.';
    try {
      const response = await this.postWithKeyRotation('models/gemini-3.5-flash:generateContent', payload);
      const data = response.data as GeminiResponseData;
      const candidates = data?.candidates;
      if (candidates && candidates.length > 0) {
        const text = candidates[0].content?.parts?.[0]?.text;
        if (text) {
          aiReply = text;
        }
      }
    } catch (error) {
      this.logger.error('Error generating AI response', error);
    }

    // Save AI message
    await this.prisma.chatMessage.create({
      data: {
        sessionId: currentSessionId,
        role: 'AI',
        content: aiReply,
      },
    });

    // Update session timestamp
    await this.prisma.chatSession.update({
      where: { id: currentSessionId },
      data: { updatedAt: new Date() },
    });

    return {
      sessionId: currentSessionId!,
      reply: aiReply,
    };
  }

  // ============================================
  // STREAMING CHAT (SSE)
  // ============================================

  streamChat(
    userId: bigint,
    sessionId: bigint | undefined,
    destination: string,
    message: string,
    tripConfig?: any,
  ): Observable<MessageEvent> {
    const subject = new Subject<MessageEvent>();

    this.handleStreamChat(userId, sessionId, destination, message, subject, tripConfig)
      .catch((err) => {
        this.logger.error('Stream chat error', err);
        subject.next({ data: JSON.stringify({ type: 'error', content: 'Có lỗi xảy ra.' }) } as MessageEvent);
        subject.complete();
      });

    return subject.asObservable();
  }

  private async handleStreamChat(
    userId: bigint,
    sessionId: bigint | undefined,
    destination: string,
    message: string,
    subject: Subject<MessageEvent>,
    tripConfig?: any,
  ) {
    let currentSessionId = sessionId;

    if (!currentSessionId) {
      let chatTitle = `Du lịch ${destination}`;
      try {
        const titlePayload = {
          contents: [{ role: 'user', parts: [{ text: `Tóm tắt câu hỏi này thành một tiêu đề ngắn gọn (khoảng 2-5 từ), không dấu ngoặc kép, chỉ trả về tiêu đề: "${message}"` }] }],
          generationConfig: { temperature: 0.3 },
        };
        const titleResponse = await this.postWithKeyRotation('models/gemini-2.5-flash:generateContent', titlePayload);
        const t = titleResponse.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (t) chatTitle = t;
      } catch { /* use default */ }

      const newSession = await this.prisma.chatSession.create({
        data: { userId, title: chatTitle, destination },
      });
      currentSessionId = newSession.id;
    }

    // Send sessionId immediately
    subject.next({ data: JSON.stringify({ type: 'session', sessionId: currentSessionId.toString() }) } as MessageEvent);

    // Save user message
    await this.prisma.chatMessage.create({
      data: { sessionId: currentSessionId, role: 'USER', content: message },
    });

    // Context window: last 20 messages
    const recentMessages = await this.prisma.chatMessage.findMany({
      where: { sessionId: currentSessionId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const previousMessages = recentMessages.reverse();

    // RAG-lite context
    const placeContext = await this.getPlaceContext(destination);
    const destinationContext = placeContext || await this.getDestinationContext(destination);

    let configInstruction = '';
    if (tripConfig) {
      const parts: string[] = [];
      if (tripConfig.days) parts.push(`- Thời lượng chuyến đi: ${tripConfig.days} ngày (Giới hạn tối đa 7 ngày).`);
      if (tripConfig.companions) parts.push(`- Thành viên đi cùng: ${tripConfig.companions}.`);
      if (tripConfig.categories && Array.isArray(tripConfig.categories) && tripConfig.categories.length > 0) {
        parts.push(`- Thể loại du lịch yêu thích: ${tripConfig.categories.join(', ')}.`);
      }
      if (tripConfig.pace) parts.push(`- Nhịp độ di chuyển: ${tripConfig.pace}.`);
      if (tripConfig.budget) parts.push(`- Ngân sách: ${tripConfig.budget} ${tripConfig.currency || 'VND'}.`);

      if (parts.length > 0) {
        configInstruction = `\n\n[CẤU HÌNH CHUYẾN ĐI NGƯỜI DÙNG ĐÃ CHỌN]:\n${parts.join('\n')}\n\nLƯU Ý BẮT BUỘC:\n1. Phân chia rõ lịch trình theo từng ngày (Ngày 1, Ngày 2, ...).\n2. Căn cứ vào nhịp độ "${tripConfig.pace || 'Vừa phải'}": nếu "Thong thả" hãy gợi ý 2-3 địa điểm/ngày; nếu "Vừa phải" gợi ý 3-4 địa điểm/ngày; nếu "Dày đặc" gợi ý 5-6 địa điểm/ngày.\n3. Đơn vị tiền tệ ước tính chi phí sử dụng là: ${tripConfig.currency || 'VND'}.`;
      }
    }

    const systemInstruction = `Bạn là trợ lý du lịch AI thông minh của ứng dụng CloudMood. Nhiệm vụ của bạn là hỗ trợ người dùng về chuyến đi tới: "${destination}". Hãy trả lời ngắn gọn, chính xác, thân thiện bằng tiếng Việt. Sử dụng Markdown để format câu trả lời cho dễ đọc.${destinationContext}${configInstruction}`;

    const contents = previousMessages.map((msg) => ({
      role: msg.role === 'AI' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

    const payload = {
      system_instruction: { parts: [{ text: systemInstruction }] },
      contents,
      generationConfig: { temperature: 0.7 },
    };

    // Stream from Gemini
    let fullReply = '';
    try {
      const modelsToTry = [
        'models/gemini-3.5-flash',
        'models/gemini-3.6-flash',
        'models/gemini-2.5-flash',
        'models/gemini-2-flash',
        'models/gemini-2.5-flash-lite',
        'models/gemini-2.0-flash',
        'models/gemini-1.5-flash',
        'models/gemini-1.5-pro',
      ];

      let streamSuccess = false;
      for (const model of modelsToTry) {
        if (streamSuccess) break;
        const url = `https://generativelanguage.googleapis.com/v1beta/${model}:streamGenerateContent?alt=sse&key=${this.apiKey}`;
        try {
          const response = await axios.post(url, payload, {
            responseType: 'stream',
            timeout: 60000,
          });

          await new Promise<void>((resolve, reject) => {
            let buffer = '';
            response.data.on('data', (chunk: Buffer) => {
              buffer += chunk.toString();
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const jsonStr = line.substring(6).trim();
                  if (!jsonStr) continue;
                  try {
                    const parsed = JSON.parse(jsonStr);
                    const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (text) {
                      fullReply += text;
                      subject.next({ data: JSON.stringify({ type: 'token', content: text }) } as MessageEvent);
                    }
                  } catch { /* skip unparseable */ }
                }
              }
            });
            response.data.on('end', () => resolve());
            response.data.on('error', (err: any) => reject(err));
          });

          streamSuccess = true;
        } catch (err: any) {
          this.logger.warn(`Stream model ${model} failed: ${err.message}`);
        }
      }

      if (!streamSuccess || !fullReply) {
        // Fallback to non-streaming
        const response = await this.postWithKeyRotation('models/gemini-2.5-flash:generateContent', payload);
        const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          fullReply = text;
          subject.next({ data: JSON.stringify({ type: 'token', content: text }) } as MessageEvent);
        }
      }
    } catch (error) {
      this.logger.error('Error in stream chat', error);
      fullReply = 'Xin lỗi, có lỗi xảy ra khi xử lý câu hỏi.';
      subject.next({ data: JSON.stringify({ type: 'token', content: fullReply }) } as MessageEvent);
    }

    // Save AI message
    if (fullReply) {
      await this.prisma.chatMessage.create({
        data: { sessionId: currentSessionId, role: 'AI', content: fullReply },
      });
    }

    await this.prisma.chatSession.update({
      where: { id: currentSessionId },
      data: { updatedAt: new Date() },
    });

    subject.next({ data: JSON.stringify({ type: 'done' }) } as MessageEvent);
    subject.complete();
  }

  async moderateContent(text: string): Promise<{
    isViolation: boolean;
    label: string | null;
    category: string | null;
    reason: string | null;
    confidence?: number;
  }> {
    const customAiUrl =
      this.configService.get<string>('CUSTOM_AI_MODERATION_URL') ||
      'http://localhost:8000/moderate';

    try {
      this.logger.log(`Using custom AI moderation model at ${customAiUrl}...`);
      const response = await axios.post(customAiUrl, { text }, { timeout: 12000 });
      if (response.status === 200 && response.data) {
        const { isViolation, label, category, reason, confidence } = response.data;
        this.logger.log(
          `Custom AI result: isViolation=${isViolation}, label=${label}, category=${category}`,
        );
        return {
          isViolation: !!isViolation,
          label: label || null,
          category: category || null,
          reason: reason || null,
          confidence,
        };
      }
      throw new Error(
        `Failed to call Custom AI service: status code ${response.status}`,
      );
    } catch (error: any) {
      this.logger.error(`⚠️ Custom AI moderation failed: ${error.message}`);
      // Mặc định cho phép nội dung nếu dịch vụ AI offline để không block diễn đàn
      return { isViolation: false, label: null, category: null, reason: null };
    }
  }

  async onModuleInit() {
    const customAiUrl = this.configService.get<string>('CUSTOM_AI_MODERATION_URL') || 'http://localhost:8000/moderate';

    if (customAiUrl.includes('localhost') || customAiUrl.includes('127.0.0.1')) {
      const aiDir = this.configService.get<string>('AI_DIR') || path.resolve(process.cwd(), '../cloudmood_ai');
      const modelDir = path.join(aiDir, 'model_forum');
      const userHome = process.env.USERPROFILE || process.env.HOME || '';
      const downloadsModelDir = path.join(userHome, 'Downloads', 'model_forum');

      // 1. Tự động copy mô hình nếu chưa có từ thư mục Downloads
      if (!fs.existsSync(modelDir)) {
        if (fs.existsSync(downloadsModelDir)) {
          this.logger.log(`Tìm thấy thư mục mô hình trong thư mục Downloads. Đang tự động sao chép sang ${modelDir}...`);
          try {
            fs.mkdirSync(modelDir, { recursive: true });
            fs.cpSync(downloadsModelDir, modelDir, { recursive: true });
            this.logger.log('Sao chép mô hình thành công!');
          } catch (copyErr: any) {
            this.logger.error(`Không thể tự động sao chép mô hình: ${copyErr.message}`);
          }
        } else {
          this.logger.warn(`⚠️ Không tìm thấy thư mục mô hình tại: ${modelDir} và cũng không thấy trong Downloads: ${downloadsModelDir}. Vui lòng sao chép thủ công.`);
          return;
        }
      }

      this.logger.log('Đang khởi chạy dịch vụ Python AI Service...');

      // 2. Xác định câu lệnh python (ưu tiên môi trường ảo venv nếu có)
      let pythonCmd = 'python';
      const venvPython = path.join(aiDir, 'venv', 'Scripts', 'python.exe');
      if (fs.existsSync(venvPython)) {
        pythonCmd = venvPython;
      }

      // Khởi chạy tiến trình uvicorn app:app
      this.pythonProcess = spawn(pythonCmd, ['-m', 'uvicorn', 'app:app', '--port', '8000'], {
        cwd: aiDir,
      });

      this.pythonProcess.stdout?.on('data', (data) => {
        const message = data.toString().trim();
        if (message) this.logger.log(`[Python AI] ${message}`);
      });

      this.pythonProcess.stderr?.on('data', (data) => {
        const message = data.toString().trim();
        if (message) {
          if (message.includes('INFO') || message.includes('Application startup complete')) {
            this.logger.log(`[Python AI] ${message}`);
          } else {
            this.logger.warn(`[Python AI] ${message}`);
          }
        }
      });

      this.pythonProcess.on('close', (code) => {
        this.logger.warn(`Dịch vụ Python AI đã dừng với mã thoát ${code}`);
        this.pythonProcess = null;
      });

      this.logger.log(`Khởi chạy tiến trình Python AI thành công (PID: ${this.pythonProcess.pid})`);
    }
  }

  onModuleDestroy() {
    if (this.pythonProcess) {
      this.logger.log('Đang tắt tiến trình Python AI...');
      this.pythonProcess.kill();
    }
  }

  // ============================================
  // HYBRID RAG + OPENAI GPT AI AGENT
  // Generate full itinerary from DB context + AI reasoning
  // ============================================

  async generateItinerary(dto: {
    destination: string;
    days: number;
    companion: string;
    budget: string;
    categories: string[];
    startDate: string; // ISO date string
    customRequest?: string;
  }): Promise<{ days: Array<{ dayNumber: number; dayTitle: string; places: Array<any> }> }> {
    const { destination, days, companion, budget, categories, startDate, customRequest } = dto;
    let cleanDest = destination
      .replace(/^Thành phố\s+/i, '')
      .replace(/^Thành Phố\s+/i, '')
      .replace(/^Tỉnh\s+/i, '')
      .replace(/^TP\.\s*/i, '')
      .replace(/^TP\s+/i, '')
      .trim();
    if (!cleanDest) cleanDest = destination;

    // ─── STEP 1: RAG FETCH ALL APPROVED PLACES FROM DB (NO LIMIT, NO STAR PENALTY, NO NAME FILTER) ───────
    const totalDbPlaces = await this.prisma.place.count();
    const totalApprovedPlaces = await this.prisma.place.count({ where: { isApproved: true } });

    let candidatePlaces: any[] = await this.prisma.place.findMany({
      where: {
        isApproved: true,
        OR: [
          { address: { contains: cleanDest, mode: 'insensitive' } },
          { address: { contains: destination, mode: 'insensitive' } },
          { name: { contains: cleanDest, mode: 'insensitive' } },
        ],
      },
      include: {
        category: true,
        photos: { take: 1 },
      },
    });

    // Bổ sung thêm địa điểm từ DB nếu số lượng theo thành phố chưa đủ (Đảm bảo luôn thừa địa điểm cho tất cả các ngày)
    const minRequiredPlaces = Math.max(100, days * 15);
    if (candidatePlaces.length < minRequiredPlaces) {
      const allExtraPlaces = await this.prisma.place.findMany({
        where: {
          isApproved: true,
        },
        include: {
          category: true,
          photos: { take: 1 },
        },
        take: 300,
      });
      for (const ep of allExtraPlaces) {
        if (!candidatePlaces.some((cp) => Number(cp.id) === Number(ep.id))) {
          candidatePlaces.push(ep);
        }
      }
    }

    this.logger.log(`[DB STATS] Total DB Places: ${totalDbPlaces}, Approved: ${totalApprovedPlaces}, Places in ${cleanDest}: ${candidatePlaces.length}`);

    // ─── STEP 1b: FETCH EXPLICITLY REQUESTED PLACES (70% TEXT WEIGHT) ─────────────
    const extractedKeywords = this.ruleEngine.extractSearchKeywords(customRequest);
    const mustVisitPlaces: any[] = [];
    const chuaPlaces: any[] = [];
    const specificNamedPlaces: any[] = [];

    const reqLower = (customRequest || '').toLowerCase();
    const isChuaRequested = reqLower.includes('chùa') || reqLower.includes('phật') || reqLower.includes('thiền viện') || reqLower.includes('tịnh xá') || reqLower.includes('đền');
    const isBienDongRequested = reqLower.includes('biển đông');
    const isNinhKieuRequested = reqLower.includes('ninh kiều');
    const isCaiRangRequested = reqLower.includes('cái răng') || reqLower.includes('chợ nổi') || reqLower.includes('cho noi');
    const isHuTieuRequested = reqLower.includes('hủ tiếu') || reqLower.includes('hu tieu');
    const isConSonRequested = reqLower.includes('cồn sơn') || reqLower.includes('con son');
    const isBinhThuyRequested = reqLower.includes('bình thủy') || reqLower.includes('nhà cổ');

    // 1. Tìm chính xác Nhà hàng Biển Đông nếu khách gõ "biển đông"
    if (isBienDongRequested) {
      const bienDongMatches = await this.prisma.place.findMany({
        where: {
          isApproved: true,
          name: { contains: 'Biển Đông', mode: 'insensitive' },
        },
        include: { category: true, photos: { take: 1 } },
      });
      for (const bd of bienDongMatches) {
        if (!candidatePlaces.some((cp) => Number(cp.id) === Number(bd.id))) candidatePlaces.push(bd);
        if (!mustVisitPlaces.some((mv) => Number(mv.id) === Number(bd.id))) mustVisitPlaces.push(bd);
        if (!specificNamedPlaces.some((sp) => Number(sp.id) === Number(bd.id))) specificNamedPlaces.push(bd);
      }
    }

    // 2. Tìm chính xác Ninh Kiều / Cầu Ninh Kiều nếu khách gõ "ninh kiều"
    if (isNinhKieuRequested) {
      const ninhKieuMatches = await this.prisma.place.findMany({
        where: {
          isApproved: true,
          OR: [
            { name: { contains: 'Ninh Kiều', mode: 'insensitive' } },
            { description: { contains: 'Ninh Kiều', mode: 'insensitive' } },
          ],
        },
        include: { category: true, photos: { take: 1 } },
      });
      for (const nk of ninhKieuMatches) {
        if (!candidatePlaces.some((cp) => Number(cp.id) === Number(nk.id))) candidatePlaces.push(nk);
        if (!mustVisitPlaces.some((mv) => Number(mv.id) === Number(nk.id))) mustVisitPlaces.push(nk);
        if (!specificNamedPlaces.some((sp) => Number(sp.id) === Number(nk.id))) specificNamedPlaces.push(nk);
      }
    }

    // 2b. Tìm chính xác Chợ Nổi Cái Răng nếu khách gõ "cái răng" hoặc "chợ nổi"
    if (isCaiRangRequested) {
      const caiRangMatches = await this.prisma.place.findMany({
        where: {
          isApproved: true,
          OR: [
            { name: { contains: 'Cái Răng', mode: 'insensitive' } },
            { name: { contains: 'Chợ nổi', mode: 'insensitive' } },
            { name: { contains: 'Chợ Nổi', mode: 'insensitive' } },
            { description: { contains: 'Cái Răng', mode: 'insensitive' } },
            { description: { contains: 'chợ nổi', mode: 'insensitive' } },
          ],
        },
        include: { category: true, photos: { take: 1 } },
      });
      for (const cr of caiRangMatches) {
        if (!candidatePlaces.some((cp) => Number(cp.id) === Number(cr.id))) candidatePlaces.push(cr);
        if (!mustVisitPlaces.some((mv) => Number(mv.id) === Number(cr.id))) mustVisitPlaces.push(cr);
        if (!specificNamedPlaces.some((sp) => Number(sp.id) === Number(cr.id))) specificNamedPlaces.push(cr);
      }
    }

    // 2c. Tìm chính xác Hủ tiếu / Lò hủ tiếu nếu khách gõ "hủ tiếu"
    if (isHuTieuRequested) {
      const huTieuMatches = await this.prisma.place.findMany({
        where: {
          isApproved: true,
          OR: [
            { name: { contains: 'Hủ tiếu', mode: 'insensitive' } },
            { name: { contains: 'Hủ Tiếu', mode: 'insensitive' } },
            { description: { contains: 'Hủ tiếu', mode: 'insensitive' } },
            { description: { contains: 'hủ tiếu', mode: 'insensitive' } },
          ],
        },
        include: { category: true, photos: { take: 1 } },
      });
      for (const ht of huTieuMatches) {
        if (!candidatePlaces.some((cp) => Number(cp.id) === Number(ht.id))) candidatePlaces.push(ht);
        if (!mustVisitPlaces.some((mv) => Number(mv.id) === Number(ht.id))) mustVisitPlaces.push(ht);
        if (!specificNamedPlaces.some((sp) => Number(sp.id) === Number(ht.id))) specificNamedPlaces.push(ht);
      }
    }

    // 2d. Tìm Cồn Sơn / Bình Thủy
    if (isConSonRequested || isBinhThuyRequested) {
      const extraMatches = await this.prisma.place.findMany({
        where: {
          isApproved: true,
          OR: [
            { name: { contains: 'Cồn Sơn', mode: 'insensitive' } },
            { name: { contains: 'Bình Thủy', mode: 'insensitive' } },
            { description: { contains: 'Cồn Sơn', mode: 'insensitive' } },
            { description: { contains: 'Bình Thủy', mode: 'insensitive' } },
          ],
        },
        include: { category: true, photos: { take: 1 } },
      });
      for (const em of extraMatches) {
        if (!candidatePlaces.some((cp) => Number(cp.id) === Number(em.id))) candidatePlaces.push(em);
        if (!mustVisitPlaces.some((mv) => Number(mv.id) === Number(em.id))) mustVisitPlaces.push(em);
        if (!specificNamedPlaces.some((sp) => Number(sp.id) === Number(em.id))) specificNamedPlaces.push(em);
      }
    }

    // 3. Nếu người dùng nhập sở thích có "chùa", chủ động truy vấn TẤT CẢ các ngôi Chùa ở điểm đến trong DB
    if (isChuaRequested) {
      const dbChuas = await this.prisma.place.findMany({
        where: {
          isApproved: true,
          OR: [
            { name: { contains: 'Chùa', mode: 'insensitive' } },
            { name: { contains: 'Thiền viện', mode: 'insensitive' } },
            { name: { contains: 'Tịnh xá', mode: 'insensitive' } },
            { name: { contains: 'Pagoda', mode: 'insensitive' } },
            { description: { contains: 'chùa', mode: 'insensitive' } },
          ],
        },
        include: { category: true, photos: { take: 1 } },
        take: 10,
      });

      for (const c of dbChuas) {
        if (!candidatePlaces.some((cp) => Number(cp.id) === Number(c.id))) {
          candidatePlaces.push(c);
        }
        if (!chuaPlaces.some((cp) => Number(cp.id) === Number(c.id))) {
          chuaPlaces.push(c);
        }
        if (!mustVisitPlaces.some((mv) => Number(mv.id) === Number(c.id))) {
          mustVisitPlaces.push(c);
        }
      }
    }

    if (extractedKeywords.length > 0) {
      for (const kw of extractedKeywords) {
        const matches = await this.prisma.place.findMany({
          where: {
            isApproved: true,
            OR: [
              { name: { contains: kw, mode: 'insensitive' } },
              { description: { contains: kw, mode: 'insensitive' } },
            ],
          },
          include: { category: true, photos: { take: 1 } },
          take: 5,
        });

        for (const m of matches) {
          if (!candidatePlaces.some((cp) => Number(cp.id) === Number(m.id))) {
            candidatePlaces.push(m);
          }
          if (!mustVisitPlaces.some((mv) => Number(mv.id) === Number(m.id))) {
            mustVisitPlaces.push(m);
          }
        }
      }
    }

    // 4. Trích xuất & Giải mã Ràng buộc Địa điểm theo Ngày cụ thể (Day-Specific Place Constraints)
    const rawDayConstraints = this.ruleEngine.extractDayConstraints(customRequest, days);
    const resolvedDayConstraints: Array<{ place: any; targetDay: number; rawQuery: string; dayLabel: string }> = [];

    for (const dc of rawDayConstraints) {
      const matches = await this.prisma.place.findMany({
        where: {
          isApproved: true,
          OR: [
            { name: { contains: dc.rawPlaceQuery, mode: 'insensitive' } },
            { description: { contains: dc.rawPlaceQuery, mode: 'insensitive' } },
          ],
        },
        include: { category: true, photos: { take: 1 } },
        take: 5,
      });

      let matchedPlace = matches[0];
      if (!matchedPlace && dc.rawPlaceQuery.includes(' ')) {
        const subKws = dc.rawPlaceQuery.split(' ').filter((w) => w.length >= 3);
        for (const skw of subKws) {
          const subMatches = await this.prisma.place.findMany({
            where: {
              isApproved: true,
              OR: [
                { name: { contains: skw, mode: 'insensitive' } },
                { description: { contains: skw, mode: 'insensitive' } },
              ],
            },
            include: { category: true, photos: { take: 1 } },
            take: 3,
          });
          if (subMatches.length > 0) {
            matchedPlace = subMatches[0];
            break;
          }
        }
      }

      if (matchedPlace) {
        if (!candidatePlaces.some((cp) => Number(cp.id) === Number(matchedPlace.id))) candidatePlaces.push(matchedPlace);
        if (!mustVisitPlaces.some((mv) => Number(mv.id) === Number(matchedPlace.id))) mustVisitPlaces.push(matchedPlace);
        if (!specificNamedPlaces.some((sp) => Number(sp.id) === Number(matchedPlace.id))) specificNamedPlaces.push(matchedPlace);

        resolvedDayConstraints.push({
          place: matchedPlace,
          targetDay: dc.targetDay,
          rawQuery: dc.rawPlaceQuery,
          dayLabel: dc.dayLabel,
        });
        this.logger.log(`[DAY CONSTRAINT DETECTED] "${matchedPlace.name}" (ID: ${matchedPlace.id}) => Target Day ${dc.targetDay} (${dc.dayLabel})`);
      }
    }

    // ─── STEP 1c: FILTER OUT VAGUE / GENERIC PLACE NAMES (e.g. "Cần Thơ") ────
    candidatePlaces = candidatePlaces.filter(
      (p) => !this.ruleEngine.isVagueOrInvalidPlaceName(p.name, cleanDest),
    );

    // ─── STEP 2: WEATHER CHECK FROM WEATHER SERVICE ───────────────────────────
    let isRainy = false;
    try {
      const tripStartDate = new Date(startDate);
      const today = new Date();
      const diffDays = Math.ceil((tripStartDate.getTime() - today.getTime()) / (1000 * 3600 * 24));

      if (diffDays <= 7) {
        const weatherInfo = (await this.weatherService.getWeatherForCity(cleanDest)) as any;
        const cond = (weatherInfo?.condition || weatherInfo?.description || '').toLowerCase();
        if (cond.includes('rain') || cond.includes('drizzle') || cond.includes('thunderstorm') || cond.includes('mưa') || cond.includes('bão')) {
          isRainy = true;
          this.logger.log(`Weather for ${cleanDest} is rainy (${cond}). Outdoor places will be filtered for indoor alternatives.`);
        }
      } else {
        this.logger.log(`Trip date is ${diffDays} days in future. Defaulting weather to clear/sunny.`);
      }
    } catch (err: any) {
      this.logger.warn(`Could not fetch weather forecast for ${cleanDest}: ${err.message}. Assuming clear weather.`);
    }

    // ─── STEP 3: RULE-BASED RELEVANCE SCORING & HARD FILTERS ────────────────
    const scoredPlaces = candidatePlaces.map((p) => {
      const relevanceScore = this.ruleEngine.scorePlaceRelevance(p, { categories, budget, customRequest });
      return { ...p, relevanceScore };
    });

    // Keeping all approved places in candidate pool (no filtering out low score or price level places)
    candidatePlaces = scoredPlaces;

    // Group candidates by role
    const { hotels, dining, cafes, activities } = this.ruleEngine.groupPlacesByRole(candidatePlaces);

    // Pick 1 single hotel for Day 1 Check-in (13:00 - 14:00)
    const anchorHotel = hotels.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))[0] || candidatePlaces[0];

    // ─── STEP 4: PREPARE PROMPT & CONTEXT FOR GEMINI / OPENAI ────────────────
    const startDateObj = new Date(startDate);
    const weekdayNames = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

    const dayDateList: string[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(startDateObj);
      d.setDate(d.getDate() + i);
      dayDateList.push(`Ngày ${i + 1}: ${weekdayNames[d.getDay()]} (${d.toLocaleDateString('vi-VN')})`);
    }

    const placesJson = candidatePlaces.map((p) => ({
      id: Number(p.id),
      name: p.name,
      category: p.category?.name || 'Khác',
      address: p.address || '',
      priceLevel: p.priceLevel || null,
      openingHours: p.openingHours || null,
      description: p.description ? p.description.substring(0, 150) : null,
      lat: p.latitude ? Number(p.latitude) : null,
      lng: p.longitude ? Number(p.longitude) : null,
      isOutdoor: this.ruleEngine.isOutdoorPlace(p),
      score: (p as any).relevanceScore || 50,
    }));

    const systemInstruction = `Bạn là Trợ lý AI lập lịch trình du lịch chuyên nghiệp của CloudMood.
Nhiệm vụ của bạn là sắp xếp các địa điểm từ danh sách CSDL được cung cấp thành một lịch trình du lịch ${days} ngày hợp lý, thú vị và tuân thủ nghiêm ngặt tất cả các ràng buộc.

= = = CÁC RÀNG BUỘC CHUNG = = =
1. ĐỊA ĐIỂM THỰC TẾ: Chỉ chọn địa điểm có trong danh sách JSON được cung cấp (khớp ID và tên). TUYỆT ĐỐI không bịa đặt địa điểm hoặc tự tạo ID mới.
2. ĐỐI TƯỢNG ĐỒNG HÀNH: "${companion || 'Tự do'}". Chọn địa điểm có phong cách phù hợp.
3. KHÁCH SẠN ANCHOR: Khách sạn CHỈ được phép xuất hiện 1 lần duy nhất vào Slot Check-in (13:30) của NGÀY 1 (Khách sạn "${anchorHotel.name}", ID: ${anchorHotel.id}). Tuyệt đối CẤM xếp Khách sạn vào Ngày 2, Ngày 3 trở đi trong toàn bộ chuyến đi!


= = = CẤU TRÚC LỊCH TRÌNH CỐ ĐỊNH BẮT BUỘC ĐÚNG 9 SLOT/NGÀY = = =
BẮT BUỘC tất cả các ngày trong lịch trình từ Ngày 1 đến Ngày ${days} ĐỀU PHẢI CÓ ĐỦ ĐÚNG 9 ĐỊA ĐIỂM (9 slot giờ cố định). TUYỆT ĐỐI KHÔNG ĐƯỢC TẠO NGÀY ÍT HƠN 9 ĐỊA ĐIỂM (Không tạo ngày 2, 3, 7 hay 8 địa điểm).

Cấu trúc 9 slot cho mỗi ngày:
- Slot 0 (07:00 - 08:30): Cà phê sáng & Điểm tâm
- Slot 1 (08:30 - 10:30): Điểm tham quan 1
- Slot 2 (10:30 - 12:30): Điểm tham quan 2
- Slot 3 (12:30 - 13:30): Ăn trưa
- Slot 4 (13:30 - 15:00): Check-in Khách sạn (Ngày 1) / Cà phê nghỉ trưa (Ngày 2+)
- Slot 5 (15:00 - 16:30): Điểm tham quan 3
- Slot 6 (16:30 - 18:00): Điểm tham quan 4
- Slot 7 (18:00 - 19:00): Ăn tối
- Slot 8 (19:00 - 22:00): Vui chơi tối / Cà phê đêm

= = = QUY TẮC PHÂN BỔ THỜI GIAN BUỔI TỐI (BẮT BUỘC) = = =
- SLOT CUỐI CÙNG trong ngày (Slot 8) BẮT BUỘC chỉ được xếp là Quán Cà phê (Cafe) hoặc Điểm ngắm cảnh đêm. TUYỆT ĐỐI không xếp địa điểm tham quan như bảo tàng, chùa chiền, khu di tích, vườn sinh thái hay địa danh thiên nhiên vào slot này.
- SLOT SÁT CUỐI (Slot 7) là bữa ăn tối.

LƯU Ý QUAN TRỌNG: Tất cả các ngày đều phải bắt buộc có đủ 3 bữa ăn (Ăn sáng, Ăn trưa, Ăn tối) nằm xen kẽ với các điểm đi chơi/cà phê.

= = = QUY TẮC CẤM LIÊN TIẾP = = =
- CẤM xếp 2 địa điểm ăn uống (Nhà hàng, Quán ăn, Cà phê) liên tiếp nhau.
- CẤM xếp 2 địa điểm khách sạn liên tiếp nhau (Và Ngày 2 trở đi CẤM HOÀN TOÀN khách sạn).
- CẤM xếp 2 địa điểm cùng danh mục chi tiết liên tiếp nhau (Ví dụ: 2 siêu thị kề nhau, 2 trung tâm thương mại kề nhau).
- NGOẠI LỆ DUY NHẤT: Slot 1 & Slot 2 (2 địa điểm đi chơi buổi sáng) được phép xếp liên tiếp nhưng phải là 2 địa điểm khác nhau.

= = = YÊU CẦU ĐẶC BIỆT CỦA KHÁCH (TRỌNG SỐ CAO NHẤT) = = =
Phải đọc kỹ yêu cầu văn bản của khách để xếp đúng địa điểm và đúng ngày:
${isBienDongRequested ? `- BẮT BUỘC: Khách yêu cầu ăn ở Nhà Hàng Biển Đông! BẮT BUỘC chọn "Nhà Hàng Biển Đông" (ID: ${specificNamedPlaces.find((s) => s.name.includes('Biển Đông'))?.id || 1185}) cho 1 bữa ăn trưa hoặc tối.` : ''}
${isNinhKieuRequested ? `- BẮT BUỘC: Khách muốn đi Cầu/Bến Ninh Kiều buổi tối! BẮT BUỘC chọn "Cầu Đi Bộ Bến Ninh Kiều" (ID: ${specificNamedPlaces.find((s) => s.name.includes('Ninh Kiều'))?.id || 1170}) vào BUỔI TỐI (Slot 7 hoặc 8).` : ''}
${isChuaRequested ? `- BẮT BUỘC: Khách muốn đi Chùa, hãy chọn 1-2 ngôi Chùa trong danh sách: ${chuaPlaces.map((c) => `${c.name} (ID: ${c.id})`).join(', ')}. KHÔNG xếp liên tiếp các ngôi chùa trong cùng một buổi sáng.` : ''}
${resolvedDayConstraints.map((c) => `- BẮT BUỘC: Xếp địa điểm "${c.place.name}" (ID: ${c.place.id}) vào đúng Ngày ${c.targetDay}.`).join('\n')}

= = = ĐỊNH DẠNG ĐẦU RA JSON = = =
Trả về cấu trúc JSON thuần túy, hợp lệ, không chứa ký tự markdown hay văn bản ngoài JSON.
Format mẫu:
{
  "days": [
    {
      "dayNumber": 1,
      "dayTitle": "Ngày 1: Tiêu đề ngày ngắn gọn, hấp dẫn",
      "places": [
        {
          "placeId": 12,
          "note": "Giải thích ngắn gọn lý do chọn địa điểm này phù hợp với thời điểm này trong ngày."
        }
      ]
    }
  ]
}`;

    const userPrompt = `THÔNG TIN CHUYẾN ĐI:
- Điểm đến: ${destination}
- Số ngày: ${days} ngày
- Lịch từng ngày: ${dayDateList.join(', ')}
- Khách sạn Check-in Ngày 1: ${anchorHotel.name} (ID: ${anchorHotel.id})
- YÊU CẦU TEXT ĐẶC BIỆT CỦA KHÁCH (TRỌNG SỐ 70%): "${customRequest || 'Không có'}"
- CÁC ĐỊA ĐIỂM ƯU TIÊN BẮT BUỘC PHẢI CÓ TRONG LỊCH TRÌNH: ${mustVisitPlaces.map((m) => `${m.name} (ID: ${m.id})`).join(', ')}
- Danh mục lựa chọn (Trọng số 30%): ${categories?.join(', ') || 'Tất cả'}
- Ngân sách: ${budget || 'Vừa phải'}

DANH SÁCH ĐỊA ĐIỂM THỰC TẾ TỪ CLOUDMOOD CSDL:
${JSON.stringify(placesJson, null, 2)}

Hãy tạo lịch trình ${days} ngày (07:00 - 22:00) đáp ứng toàn bộ quy tắc trên. Trả về JSON thuần túy.`;

    const payload = {
      system_instruction: { parts: [{ text: systemInstruction }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: { temperature: 0.7, responseMimeType: 'application/json' },
    };



    // ─── STEP 5: CALL AI ENGINE (STRICTLY OPENAI) ───────────────────────────
    let rawText = '';
    let parsed: any = null;

    const useOpenAI = !!process.env.OPENAI_API_KEY;
    if (!useOpenAI) {
      throw new Error('Chưa cấu hình OPENAI_API_KEY trong tệp .env. Không thể tạo lịch trình.');
    }

    try {
      this.logger.log('[AI SERVICE] Generating itinerary using OpenAI (gpt-4o)...');
      const response = await this.postOpenAIChatCompletion(systemInstruction, userPrompt);
      rawText = response.data?.choices?.[0]?.message?.content || '';
      if (!rawText) {
        throw new Error('OpenAI phản hồi dữ liệu rỗng.');
      }
      parsed = JSON.parse(rawText.trim());
    } catch (error: any) {
      this.logger.error(`[OPENAI ERROR] Failed to generate itinerary: ${error?.message || error}`);
      throw new Error(`Lỗi kết nối OpenAI hoặc phản hồi không hợp lệ: ${error?.message || error}`);
    }

    if (!parsed || !parsed.days || parsed.days.length === 0) {
      throw new Error('Kết quả trả về từ OpenAI không chứa dữ liệu ngày hợp lệ.');
    }

    const validIdSet = new Set(candidatePlaces.map((p) => Number(p.id)));

    const validatedDays = (parsed.days || []).map((day: any, idx: number) => {
      const validatedPlaces = (day.places || [])
        .filter((p: any) => {
          const pid = Number(p.placeId);
          return validIdSet.has(pid);
        })
        .map((p: any) => ({
          placeId: Number(p.placeId),
          note: (p.note || '').toString().trim(),
        }));

      return {
        dayNumber: day.dayNumber || idx + 1,
        dayTitle: (day.dayTitle || `Ngày ${idx + 1}`).toString().trim(),
        places: validatedPlaces,
      };
    });

    // Đảm bảo 100% validatedDays có đủ số lượng ngày theo yêu cầu (ví dụ: 7 ngày)
    while (validatedDays.length < days) {
      const nextDayNum = validatedDays.length + 1;
      validatedDays.push({
        dayNumber: nextDayNum,
        dayTitle: `Ngày ${nextDayNum}: Khám phá điểm đến tuyệt vời`,
        places: [],
      });
    }

    // Đảm bảo 100% các địa điểm bắt buộc (như Chợ nổi Cái Răng, Hủ tiếu, Biển Đông...) phải có mặt trong lịch trình
    for (const mv of mustVisitPlaces) {
      const mvId = Number(mv.id);
      const isAlreadyInValidatedDays = validatedDays.some((vd: any) =>
        (vd.places || []).some((p: any) => Number(p.placeId || p.id) === mvId),
      );
      if (!isAlreadyInValidatedDays) {
        if (validatedDays.length > 0) {
          validatedDays[0].places.unshift({
            placeId: mvId,
            note: `Trải nghiệm điểm đến ưu tiên theo yêu cầu đặc biệt của bạn.`,
          });
          this.logger.log(`[AI SERVICE] Guaranteed inclusion of must-visit place: ${mv.name} (ID: ${mvId})`);
        }
      }
    }

    const isEarlyMarketPresent = specificNamedPlaces.some((s) => (s.name || '').toLowerCase().includes('chợ nổi')) || mustVisitPlaces.some((s) => (s.name || '').toLowerCase().includes('chợ nổi'));
    const minPlacesPerDay = isEarlyMarketPresent && destination.toLowerCase().includes('cần thơ') ? 8 : 7;
    const maxPlacesPerDay = isEarlyMarketPresent && destination.toLowerCase().includes('cần thơ') ? 10 : 9;

    // ─── STEP 7: STREAMLINED PIPELINE (PASS TO RULE-ENGINE BIOLOGICAL SCHEDULER & STRICT SANITIZER) ───
    const candidatePlacesMap = new Map<number, any>(candidatePlaces.map((cp) => [Number(cp.id), cp]));
    const step9GlobalUsedIds = new Set<number>();
    const step9GlobalUsedNames = new Set<string>();
    const finalOptimizedDays: any[] = [];

    // Fetch weather info realtime cho city
    let weatherData: any = null;
    try {
      weatherData = await this.weatherService.getWeatherForCity(cleanDest);
    } catch {
      /* ignore weather fetch failure fallback */
    }

    for (const d of validatedDays) {
      const placesWithTime = this.ruleEngine.sortDayPlacesByBiologicalSchedule(
        d.places,
        candidatePlacesMap,
        d.dayNumber,
        {
          destination,
          customRequest,
          hasHotel: (dto as any).hasHotel !== false,
          isRainy,
          globalUsedIds: step9GlobalUsedIds, // cross-day dedup
          globalUsedNames: step9GlobalUsedNames, // cross-day name dedup
        },
      );

      // Đánh dấu tất cả place trong ngày này là đã dùng
      for (const p of placesWithTime) {
        const pid = Number(p.placeId || p.id || p.place?.id);
        if (pid) step9GlobalUsedIds.add(pid);
        const pObj = candidatePlacesMap.get(pid);
        const pNorm = this.ruleEngine.normalizePlaceName(pObj?.name || p.name);
        if (pNorm) step9GlobalUsedNames.add(pNorm);
      }

      // LOẠI BỎ HOÀN TOÀN TRƯỜNG NOTE VÀ GẮN WEATHER REALTIME TRÊN TỪNG THẺ ĐỊA ĐIỂM
      const cleanedPlaces = placesWithTime.map((p: any) => {
        const { note, ...rest } = p;
        return {
          ...rest,
          weatherForecast: weatherData ? {
            temperature: weatherData.temperature || weatherData.temp || 28,
            condition: weatherData.condition || weatherData.description || 'Nắng đẹp',
            icon: weatherData.icon || '01d',
            humidity: weatherData.humidity || null,
          } : null,
        };
      });

      finalOptimizedDays.push({
        dayNumber: d.dayNumber,
        dayTitle: d.dayTitle,
        places: cleanedPlaces,
      });
    }

    // THẦN HỘ VỆ SLOT (STRICT ENFORCER): Lọc và thanh trừng tuyệt đối 100% mọi điểm vi phạm cấm ở các slot
    const strictlySanitizedDays = this.ruleEngine.strictSanitizeItinerarySlots(
      finalOptimizedDays,
      candidatePlacesMap,
      destination,
    );

    this.logger.log(`generateItinerary: ${strictlySanitizedDays.length} days generated using Upgraded Rule-Engine (6 Hard Rules + OpenAI GPT + Strict Slot Sanitizer + Realtime Weather + Cross-Day Dedup + Stripped Note).`);
    return { days: strictlySanitizedDays };
  }

  private generateFallbackItinerary(candidatePlaces: any[], days: number): any {
    const daysArray: any[] = [];
    let placeIdx = 0;

    for (let d = 1; d <= days; d++) {
      const placesList: any[] = [];
      for (let s = 0; s < 9; s++) {
        if (candidatePlaces.length > 0) {
          const item = candidatePlaces[placeIdx % candidatePlaces.length];
          placesList.push({
            placeId: Number(item.id),
            note: `Ghé thăm ${item.name} theo lịch trình du lịch của bạn.`,
          });
          placeIdx++;
        }
      }

      daysArray.push({
        dayNumber: d,
        dayTitle: `Ngày ${d}: Khám phá điểm đến tuyệt vời`,
        places: placesList,
      });
    }

    return { days: daysArray };
  }

  // ============================================
  // EMERGENCY REPLACEMENT API (Đổi địa điểm đột xuất)
  // ============================================
  async replacePlace(dto: {
    destination?: string;
    currentLat: number;
    currentLng: number;
    oldPlaceId: number;
    isRainy?: boolean;
    categoryNeeded?: string;
  }): Promise<{ success: boolean; replacementPlace: any }> {
    const { destination, currentLat, currentLng, oldPlaceId, isRainy, categoryNeeded } = dto;

    // Fetch approved candidate places (bắt buộc phải có ảnh)
    const candidates = await this.prisma.place.findMany({
      where: {
        isApproved: true,
        photos: { some: {} },
        id: { not: BigInt(oldPlaceId) },
        ...(destination
          ? {
            OR: [
              { address: { contains: destination, mode: 'insensitive' } },
              { name: { contains: destination, mode: 'insensitive' } },
            ],
          }
          : {}),
      },
      include: { category: true, photos: { take: 1 } },
      take: 100,
    });

    if (candidates.length === 0) {
      throw new Error('Không tìm thấy địa điểm thay thế phù hợp trong CSDL.');
    }

    // 1. Calculate proximity (< 6km from current location)
    const withDistance = candidates.map((p) => {
      const distKm = p.latitude && p.longitude
        ? this.ruleEngine.calculateHaversineKm(currentLat, currentLng, p.latitude, p.longitude)
        : 999;
      return { ...p, distKm };
    });

    let validCandidates = withDistance.filter((p) => p.distKm <= 6);
    if (validCandidates.length === 0) {
      // Fallback: broaden radius to 10km if 6km is too tight
      validCandidates = withDistance.filter((p) => p.distKm <= 10);
    }

    if (validCandidates.length === 0) {
      validCandidates = withDistance;
    }

    // 2. Filter by weather if rainy
    if (isRainy) {
      validCandidates = this.ruleEngine.filterByWeather(validCandidates, true);
    }

    // 3. Match requested category if specified
    if (categoryNeeded) {
      const catLower = categoryNeeded.toLowerCase();
      const matched = validCandidates.filter((p) => (p.category?.name || '').toLowerCase().includes(catLower));
      if (matched.length > 0) validCandidates = matched;
    }

    // Sort by proximity & score
    validCandidates.sort((a, b) => a.distKm - b.distKm);
    const chosen = validCandidates[0];

    return {
      success: true,
      replacementPlace: {
        id: Number(chosen.id),
        name: chosen.name,
        category: chosen.category?.name || 'Khác',
        address: chosen.address,
        image: chosen.image,
        price: chosen.price,
        latitude: chosen.latitude,
        longitude: chosen.longitude,
        distanceKm: Number(chosen.distKm.toFixed(2)),
        isOutdoor: this.ruleEngine.isOutdoorPlace(chosen),
        note: `Địa điểm gợi ý thay thế gần bạn (${chosen.distKm.toFixed(1)} km), phù hợp với điều kiện thực tế hiện tại.`,
      },
    };
  }

}

