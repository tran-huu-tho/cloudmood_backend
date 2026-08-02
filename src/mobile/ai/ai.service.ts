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
      'models/gemini-3.1-flash-lite',
      'models/gemini-flash-latest',
      'models/gemini-3.5-flash-lite',
      'models/gemini-3.6-flash',
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
      const response = await this.postWithKeyRotation('models/gemini-3.5-flash:generateContent', payload);
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
        const titleResponse = await this.postWithKeyRotation('models/gemini-3.5-flash:generateContent', titlePayload);
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
        'models/gemini-3.1-flash-lite',
        'models/gemini-flash-latest',
        'models/gemini-3.6-flash',
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
        const response = await this.postWithKeyRotation('models/gemini-3.5-flash:generateContent', payload);
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
      const response = await axios.post(customAiUrl, { text }, { timeout: 5000 });
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
          // Tránh ghi log cảnh báo uvicorn reload/watch bình thường thành warning
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
  // HYBRID RAG + GEMINI AI AGENT
  // Generate full itinerary from DB context + AI reasoning
  // ============================================

  async generateItinerary(dto: {
    destination: string;
    days: number;
    pace: string;
    companion: string;
    budget: string;
    categories: string[];
    startDate: string; // ISO date string
    customRequest?: string;
  }): Promise<{ days: Array<{ dayNumber: number; dayTitle: string; places: Array<{ placeId: number; note: string }> }> }> {
    const { destination, days, pace, companion, budget, categories, startDate, customRequest } = dto;
    let cleanDest = destination
      .replace(/^Thành phố\s+/i, '')
      .replace(/^Thành Phố\s+/i, '')
      .replace(/^Tỉnh\s+/i, '')
      .replace(/^TP\.\s*/i, '')
      .replace(/^TP\s+/i, '')
      .trim();
    if (!cleanDest) cleanDest = destination;

    // ─── STEP 1: RAG FETCH ALL APPROVED PLACES FROM DB (NO STAR RATING PENALTY) ───────

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
        reviews: { take: 2, orderBy: { rating: 'desc' } },
      },
      take: 200,
    });

    if (candidatePlaces.length === 0) {
      candidatePlaces = await this.prisma.place.findMany({
        where: { isApproved: true },
        include: {
          category: true,
          reviews: { take: 2, orderBy: { rating: 'desc' } },
        },
        take: 200,
      });
    }

    // ─── STEP 1b: FETCH EXPLICITLY REQUESTED PLACES (70% TEXT WEIGHT) ─────────────
    const extractedKeywords = this.ruleEngine.extractSearchKeywords(customRequest);
    const mustVisitPlaces: any[] = [];
    const chuaPlaces: any[] = [];
    const specificNamedPlaces: any[] = [];

    const reqLower = (customRequest || '').toLowerCase();
    const isChuaRequested = reqLower.includes('chùa') || reqLower.includes('phật') || reqLower.includes('thiền viện') || reqLower.includes('tịnh xá') || reqLower.includes('đền');
    const isBienDongRequested = reqLower.includes('biển đông');
    const isNinhKieuRequested = reqLower.includes('ninh kiều');

    // 1. Tìm chính xác Nhà hàng Biển Đông nếu khách gõ "biển đông"
    if (isBienDongRequested) {
      const bienDongMatches = await this.prisma.place.findMany({
        where: {
          isApproved: true,
          name: { contains: 'Biển Đông', mode: 'insensitive' },
        },
        include: { category: true },
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
        include: { category: true },
      });
      for (const nk of ninhKieuMatches) {
        if (!candidatePlaces.some((cp) => Number(cp.id) === Number(nk.id))) candidatePlaces.push(nk);
        if (!mustVisitPlaces.some((mv) => Number(mv.id) === Number(nk.id))) mustVisitPlaces.push(nk);
        if (!specificNamedPlaces.some((sp) => Number(sp.id) === Number(nk.id))) specificNamedPlaces.push(nk);
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
        include: { category: true },
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
          include: { category: true },
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
        include: { category: true },
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
            include: { category: true },
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

    // 1. Hard Rule: Lọc theo thời tiết
    candidatePlaces = this.ruleEngine.filterByWeather(scoredPlaces, isRainy);

    // 2. Hard Rule: Lọc theo ngân sách (Budget Filter)
    candidatePlaces = this.ruleEngine.filterByBudget(candidatePlaces, budget);

    // Group candidates by role
    const { hotels, dining, cafes, activities } = this.ruleEngine.groupPlacesByRole(candidatePlaces);

    // Pick 1 single hotel for Day 1 Check-in (13:00 - 14:00)
    const anchorHotel = hotels.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))[0] || candidatePlaces[0];

    // ─── STEP 4: PREPARE PROMPT & CONTEXT FOR GEMINI ─────────────────────────
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

    const pLower = (pace || '').toLowerCase();
    let minPlacesPerDay = 5; // Default: 'Vừa phải' (4-5 điểm, tối ưu là 5)
    let pacePromptInstruction = '- NHỊP ĐỘ VỪA PHẢI (4-5 ĐIỂM/NGÀY): BẮT BUỘC MỖI NGÀY PHẢI CÓ TỪ 4 ĐẾN 5 ĐỊA ĐIỂM (TỐI ƯU LÀ 5 ĐỊA ĐIỂM).';

    if (pLower.includes('thong thả')) {
      minPlacesPerDay = 4; // 'Thong thả' (3-4 điểm, tối ưu là 4)
      pacePromptInstruction = '- NHỊP ĐỘ THONG THẢ (3-4 ĐIỂM/NGÀY): BẮT BUỘC MỖI NGÀY PHẢI CÓ TỪ 3 ĐẾN 4 ĐỊA ĐIỂM (TỐI ƯU LÀ 4 ĐỊA ĐIỂM).';
    } else if (pLower.includes('dày đặc')) {
      minPlacesPerDay = 6; // 'Dày đặc' (6 điểm)
      pacePromptInstruction = '- NHỊP ĐỘ DÀY ĐẶC (6 ĐIỂM/NGÀY): BẮT BUỘC MỖI NGÀY PHẢI CÓ ĐỦ 6 ĐỊA ĐIỂM CHẤT LƯỢNG.';
    }

    const systemInstruction = `Bạn là AI Agent Chuyên gia Lập & Điều phối Lịch trình Du lịch Thông minh số 1 của ứng dụng CloudMood.
Nhiệm vụ: Thấu hiểu NGỮ CẢNH sâu sắc từ INPUT người dùng, kết hợp dữ liệu thực tế 100% từ CSDL Cloudmood và Bộ Thước Đo Luật để xây dựng lịch trình ${days} ngày tối ưu nhất.

PHÂN TÍCH CHÂN DUNG CHUYẾN ĐI (USER CONTEXT):
- Điểm đến: ${destination} (${days} ngày)
- Nhịp độ: ${pace || 'Vừa phải'}
- Bạn đồng hành: ${companion || 'Tự do'} (Hãy chọn địa điểm phù hợp với phong cách đối tượng này: Cặp đôi -> Lãng mạn/View đẹp; Gia đình -> An toàn/Rộng rãi; Bạn bè -> Năng động/Check-in).
- Ngân sách: ${budget || 'Vừa phải'}
- Sở thích Văn bản (70% Trọng số tối cao): "${customRequest || 'Không có'}"
  -> AI hãy đọc kỹ các ĐỊA ĐIỂM TÊN RIÊNG VÀ SỞ THÍCH trong văn bản này.
  ${isBienDongRequested ? `-> BẮT BUỘC: Khách yêu cầu ăn ở Nhà Hàng Biển Đông! BẮT BUỘC chọn "Nhà Hàng Biển Đông" (ID: ${specificNamedPlaces.find((s) => s.name.includes('Biển Đông'))?.id || 1185}) cho 1 bữa ăn trưa hoặc tối.` : ''}
  ${isNinhKieuRequested ? `-> BẮT BUỘC: Khách muốn đi Cầu/Bến Ninh Kiều buổi tối! BẮT BUỘC chọn "Cầu Đi Bộ Bến Ninh Kiều" (ID: ${specificNamedPlaces.find((s) => s.name.includes('Ninh Kiều'))?.id || 1170}) vào BUỔI TỐI (18:30 - 21:30).` : ''}
  ${isChuaRequested ? `-> BẮT BUỘC: Khách muốn đi Chùa, hãy chọn 1-2 ngôi Chùa trong danh sách: ${chuaPlaces.map((c) => `${c.name} (ID: ${c.id})`).join(', ')}. KHÔNG ĐƯỢC XẾP NỀN NỀN CÁC NGÔI CHÙA LIÊN TIẾP CÙNG 1 BUỔI SÁNG.` : ''}
  ${resolvedDayConstraints.map((c) => `-> BẮT BUỘC THEO YÊU CẦU ĐẶC BIỆT CỦA KHÁCH: Địa điểm "${c.place.name}" (ID: ${c.place.id}) BẮT BUỘC PHẢI ĐƯỢC XẾP VÀO NGÀY ${c.targetDay} (theo đúng yêu cầu "${c.rawQuery} ${c.dayLabel}"). TUYỆT ĐỐI KHÔNG XẾP SANG NGÀY KHÁC!`).join('\n')}

======================================================================
THUẬT TOÁN PHÂN LOẠI ĐỊA ĐIỂM TỰ ĐỘNG (Dựa trên thông tin có sẵn trong CSDL)
======================================================================
- EARLY_MORNING (05:30 - 07:30): Chợ nổi (Chợ nổi Cái Răng), ngắm bình minh trên sông.
- NOON_REST (12:30 - 14:30): Quán ăn trưa, Nhà hàng, Quán Cà phê máy lạnh, Khách sạn nghỉ ngơi.
- NIGHT_ONLY (18:30 - 21:30): Chợ đêm, Cầu đi bộ (Cầu Ninh Kiều), Bến tàu/Du thuyền đêm, Phố đi bộ, Pub/Bar, Cà phê view đêm.
- DAYTIME (08:30 - 11:30 & 15:00 - 17:30): Chùa, Bảo tàng, Di tích lịch sử, Khu du lịch sinh thái, Vườn trái cây.

======================================================================
CÁC RÀNG BUỘC CỨNG VỀ THỜI GIAN & ĐỊA LÝ (HARD CONSTRAINTS)
======================================================================
1. QUY TẮC ĐẶC THÙ THỜI GIAN:
   - SÁNG SỚM (05:30 - 07:30): Nếu điểm đến là "Cần Thơ" và có "Chợ nổi Cái Răng", BẮT BUỘC xếp Chợ Nổi vào vị trí ĐẦU TIÊN (Place 1) của Ngày 1, sau đó mới đến điểm điểm tâm sáng.
   - TRÁNH NẮNG TRƯA (12:30 - 14:30): TUYỆT ĐỐI KHÔNG xếp các địa điểm ngoài trời, sông nước, di tích, khu sinh thái không có mái che vào khung giờ này. Chỉ xếp ăn trưa và cà phê nghỉ ngơi.
   - BUỔI TỐI (18:30 - 21:30): Chỉ chọn địa điểm NIGHT_ONLY, Nhà hàng ăn tối hoặc Cà phê. TUYỆT ĐỐI KHÔNG xếp Chùa, Bảo tàng, Di tích lịch sử vào buổi tối.
2. QUY TẮC PHÂN BỔ NHỊP SINH HOẠT & CỤM ĐỊA LÝ:
   - Mở đầu ngày (07:00 - 08:30) bắt buộc là Ăn sáng / Cà phê sáng (trừ trường hợp đi Chợ nổi).
   - Tối ưu cụm địa lý (< 5km): Các địa điểm được chọn trong cùng một Buổi (Sáng / Chiều / Tối) BẮT BUỘC phải nằm gần nhau (bán kính di chuyển giữa 2 điểm liên tiếp < 5km).
   - Xen kẽ loại hình: Tuyệt đối không xếp 2 điểm cùng thể loại liên tiếp (Cấm 2 nhà hàng liên tiếp, Cấm 2 chùa liên tiếp).
   - KHOẢNG NGHỈ VÀ DI CHUYỂN (30 - 45 PHÚT): Khoảng nghỉ giữa điểm kết thúc của địa điểm trước (endTime) và điểm bắt đầu của địa điểm kế tiếp (startTime) BẮT BUỘC TỪ 30 ĐẾN 45 PHÚT để du khách di chuyển và nghỉ ngơi thoải mái. TUYỆT ĐỐI KHÔNG xếp khoảng nghỉ quá sát (dưới 30 phút).
3. CHỈ DÙNG ID ĐỊA ĐIỂM CÓ TRONG DANH SÁCH JSON BÊN DƯỚI. TUYỆT ĐỐI KHÔNG BỊA ĐỊA ĐIỂM HOẶC ID MỚI.
4. Trả về JSON thuần túy theo đúng format.

FORMAT JSON TRẢ VỀ:
{
  "days": [
    {
      "dayNumber": 1,
      "dayTitle": "Tiêu đề ngày 1 sinh động, đúng chủ đề",
      "places": [
        {
          "placeId": 123,
          "startTime": "08:30",
          "endTime": "09:45",
          "status": "UNCHANGED",
          "note": "Ghi chú tinh tế giải thích lý do chọn địa điểm này cho khách (1-2 câu)"
        }
      ]
    }
  ],
  "systemNote": "Ghi chú ngắn từ AI nếu có điều chỉnh thời gian đặc biệt"
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


    // ─── STEP 5: CALL GEMINI AI ──────────────────────────────────────────────
    let rawText = '';
    try {
      const response = await this.postWithKeyRotation('models/gemini-3.5-flash:generateContent', payload);
      const data = response.data as GeminiResponseData;
      rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } catch (error: any) {
      this.logger.error('Gemini API error in generateItinerary', error?.message);
      throw new Error(`Trợ lý AI gặp lỗi khi tạo lịch trình: ${error?.message || 'Không xác định'}. Vui lòng thử lại.`);
    }

    if (!rawText) {
      throw new Error('Trợ lý AI không trả về kết quả. Vui lòng thử lại sau.');
    }

    // ─── STEP 6: PARSE & SANITIZE ────────────────────────────────────────────
    let parsed: any;
    try {
      const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      this.logger.error('Failed to parse Gemini JSON response', rawText.substring(0, 500));
      throw new Error('Trợ lý AI trả về dữ liệu không hợp lệ. Vui lòng thử lại.');
    }

    const validIdSet = new Set(candidatePlaces.map((p) => Number(p.id)));
    const usedIdSet = new Set<number>();

    const validatedDays = (parsed.days || []).map((day: any, idx: number) => {
      const validatedPlaces = (day.places || [])
        .filter((p: any) => {
          const pid = Number(p.placeId);
          if (!validIdSet.has(pid)) return false;
          if (usedIdSet.has(pid)) return false;
          usedIdSet.add(pid);
          return true;
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

    // ─── STEP 7: DAILY RHYTHM & ALTERNATING SANITIZER ─────────────
    for (const day of validatedDays) {
      // 1. Tự động bù đắp địa điểm cho đủ định mức số lượng địa điểm/ngày
      while (day.places.length < minPlacesPerDay) {
        const unusedCandidate = candidatePlaces.find(
          (cp) => !usedIdSet.has(Number(cp.id)) && !this.ruleEngine.isVagueOrInvalidPlaceName(cp.name, cleanDest),
        );
        if (!unusedCandidate) break;

        const pid = Number(unusedCandidate.id);
        usedIdSet.add(pid);
        day.places.push({
          placeId: pid,
          note: `Ghé thăm ${unusedCandidate.name} (${unusedCandidate.category?.name || 'Điểm đến'}) cho lịch trình trọn vẹn của bạn.`,
        });
      }

      // 2. Kiểm tra & Bắt buộc Địa điểm mở đầu ngày (07:00-08:30) phải là Bữa Ăn/Cà phê
      if (day.places.length > 0) {
        const firstPlaceObj = candidatePlaces.find((cp) => Number(cp.id) === Number(day.places[0].placeId));
        const firstCat = ((firstPlaceObj?.category?.name || '') + ' ' + (firstPlaceObj?.name || '')).toLowerCase();
        const isFirstDining = firstCat.includes('quán') || firstCat.includes('nhà hàng') || firstCat.includes('cà phê') || firstCat.includes('phở') || firstCat.includes('bún');

        if (!isFirstDining) {
          const unusedBreakfast = candidatePlaces.find(
            (cp) =>
              !usedIdSet.has(Number(cp.id)) &&
              ((cp.category?.name || '') + ' ' + (cp.name || '')).toLowerCase().match(/(cà phê|cafe|bún|phở|quán|nhà hàng)/i),
          );
          if (unusedBreakfast) {
            const pid = Number(unusedBreakfast.id);
            usedIdSet.add(pid);
            day.places.unshift({
              placeId: pid,
              note: `Thưởng thức điểm tâm sáng & cà phê nạp năng lượng tại ${unusedBreakfast.name}.`,
            });
          }
        }
      }

      // 3. Tách rời nếu có 2 ngôi Chùa / Tham quan bị xếp liên tiếp cùng một buổi
      for (let i = 0; i < day.places.length - 1; i++) {
        const p1 = candidatePlaces.find((cp) => Number(cp.id) === Number(day.places[i].placeId));
        const p2 = candidatePlaces.find((cp) => Number(cp.id) === Number(day.places[i + 1].placeId));

        const cat1 = this.ruleEngine.getGeneralCategoryGroup(p1);
        const cat2 = this.ruleEngine.getGeneralCategoryGroup(p2);

        // 3a. Nếu 2 điểm tham quan liên tiếp ➔ Chèn 1 quán ăn/cà phê vào giữa
        if (cat1 === 'ATTRACTION' && cat2 === 'ATTRACTION') {
          const unusedFood = candidatePlaces.find(
            (cp) =>
              !usedIdSet.has(Number(cp.id)) &&
              ['DINING', 'CAFE'].includes(this.ruleEngine.getGeneralCategoryGroup(cp)),
          );

          if (unusedFood) {
            const pid = Number(unusedFood.id);
            usedIdSet.add(pid);
            day.places.splice(i + 1, 0, {
              placeId: pid,
              note: `Nghỉ chân và dùng bữa tại ${unusedFood.name} giữa các điểm tham quan.`,
            });
            i++;
          }
        }
        // 3b. Nếu 2 điểm Ăn uống / Quán ăn / Nhà hàng (DINING) liên tiếp ➔ Chèn 1 điểm tham quan vào giữa
        else if (cat1 === 'DINING' && cat2 === 'DINING') {
          const unusedAttraction = candidatePlaces.find(
            (cp) =>
              !usedIdSet.has(Number(cp.id)) &&
              this.ruleEngine.getGeneralCategoryGroup(cp) === 'ATTRACTION',
          );

          if (unusedAttraction) {
            const pid = Number(unusedAttraction.id);
            usedIdSet.add(pid);
            day.places.splice(i + 1, 0, {
              placeId: pid,
              note: `Tham quan ${unusedAttraction.name} để giải trí giữa các bữa ăn.`,
            });
            i++;
          }
        }
      }
    }

    // ─── STEP 8: POST-VALIDATION SAFETY NET FOR NAMED PLACES ──
    // 8a. Auto-inject Nhà Hàng Biển Đông nếu khách có yêu cầu mà AI bỏ sót
    if (isBienDongRequested) {
      const bienDongPlace = candidatePlaces.find((cp) => (cp.name || '').toLowerCase().includes('biển đông'));
      if (bienDongPlace) {
        let hasBienDong = false;
        for (const d of validatedDays) {
          if (d.places.some((p: any) => Number(p.placeId) === Number(bienDongPlace.id))) {
            hasBienDong = true;
            break;
          }
        }
        if (!hasBienDong && validatedDays.length > 0) {
          const targetDay = validatedDays[0];
          targetDay.places.push({
            placeId: Number(bienDongPlace.id),
            note: `Thưởng thức hải sản tươi ngon đặc sắc tại ${bienDongPlace.name} theo đúng sở thích của bạn.`,
          });
          this.logger.log(`[SAFETY NET] Auto-injected ${bienDongPlace.name} (ID: ${bienDongPlace.id}) into Day ${targetDay.dayNumber}.`);
        }
      }
    }

    // 8b. Auto-inject Cầu Ninh Kiều vào buổi tối nếu khách có yêu cầu mà AI bỏ sót
    if (isNinhKieuRequested) {
      const ninhKieuPlace = candidatePlaces.find((cp) => (cp.name || '').toLowerCase().includes('ninh kiều'));
      if (ninhKieuPlace) {
        let hasNinhKieu = false;
        for (const d of validatedDays) {
          if (d.places.some((p: any) => Number(p.placeId) === Number(ninhKieuPlace.id))) {
            hasNinhKieu = true;
            break;
          }
        }
        if (!hasNinhKieu && validatedDays.length > 0) {
          const targetDay = validatedDays[0];
          targetDay.places.push({
            placeId: Number(ninhKieuPlace.id),
            note: `Dạo bước ngắm cảnh lung linh về đêm tại ${ninhKieuPlace.name}.`,
          });
          this.logger.log(`[SAFETY NET] Auto-injected ${ninhKieuPlace.name} (ID: ${ninhKieuPlace.id}) into Day ${targetDay.dayNumber}.`);
        }
      }
    }

    // 8c. Auto-inject Chùa nếu khách có yêu cầu mà AI bỏ sót
    if (isChuaRequested && chuaPlaces.length > 0) {
      let containsChua = false;
      for (const d of validatedDays) {
        for (const p of d.places) {
          const matchChua = candidatePlaces.find((cp) => Number(cp.id) === Number(p.placeId));
          if (matchChua) {
            const nameL = (matchChua.name || '').toLowerCase();
            const catL = (matchChua.category?.name || '').toLowerCase();
            if (nameL.includes('chùa') || nameL.includes('thiền viện') || nameL.includes('tịnh xá') || nameL.includes('pagoda') || catL.includes('chùa')) {
              containsChua = true;
              break;
            }
          }
        }
      }

      // Nếu AI trót bỏ sót Chùa, Backend tự động thay thế 1 điểm tham quan Ngày 2 bằng Chùa top 1 từ DB
      if (!containsChua && validatedDays.length > 0) {
        const topChua = chuaPlaces[0];
        const targetDay = validatedDays[1] || validatedDays[0];
        if (targetDay && targetDay.places.length > 1) {
          targetDay.places[1] = {
            placeId: Number(topChua.id),
            note: `Viếng ${topChua.name} thanh tịnh, cầu bình an cho gia đình theo đúng nguyện vọng chuyến đi của bạn.`,
          };
          this.logger.log(`[SAFETY NET] Auto-injected Chùa ${topChua.name} (ID: ${topChua.id}) into Day ${targetDay.dayNumber}.`);
        }
      }
    }

    // 8d. Tự động áp đặt Ràng buộc Ngày chỉ định (Day Constraint Safety Net) nếu AI trót xếp sai ngày hoặc bỏ sót
    for (const constraint of resolvedDayConstraints) {
      const { place, targetDay } = constraint;
      const targetDayObj = validatedDays.find((d: any) => d.dayNumber === targetDay);
      if (!targetDayObj) continue;

      const isAlreadyInTargetDay = targetDayObj.places.some(
        (p: any) => Number(p.placeId) === Number(place.id),
      );

      if (!isAlreadyInTargetDay) {
        // Xóa địa điểm khỏi bất kỳ ngày nào khác nếu AI trót xếp nhầm
        for (const d of validatedDays) {
          if (d.dayNumber !== targetDay) {
            d.places = d.places.filter(
              (p: any) => Number(p.placeId) !== Number(place.id),
            );
          }
        }

        // Chèn địa điểm vào đúng Ngày yêu cầu
        targetDayObj.places.push({
          placeId: Number(place.id),
          note: `Ghé thăm ${place.name} vào Ngày ${targetDay} theo đúng mong muốn và yêu cầu sở thích của bạn.`,
        });

        this.logger.log(
          `[DAY CONSTRAINT SAFETY NET] Enforced ${place.name} (ID: ${place.id}) into Day ${targetDay}.`,
        );
      }
    }

    // ─── STEP 9: BIOLOGICAL & GEOGRAPHIC ROUTE OPTIMIZER ────────────
    const candidatePlacesMap = new Map<number, any>(candidatePlaces.map((cp) => [Number(cp.id), cp]));

    const finalOptimizedDays = validatedDays.map((d) => {
      const placesWithTime = this.ruleEngine.sortDayPlacesByBiologicalSchedule(
        d.places,
        candidatePlacesMap,
        d.dayNumber,
        {
          destination,
          customRequest,
          hasHotel: (dto as any).hasHotel !== false,
          isRainy,
        },
      );
      return {
        ...d,
        places: placesWithTime,
      };
    });

    this.logger.log(`generateItinerary: ${finalOptimizedDays.length} days generated using Upgraded Rule-Engine (6 Hard Rules + Exception Matrix + Elastic Timeline).`);
    return { days: finalOptimizedDays };
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

    // Fetch approved candidate places
    const candidates = await this.prisma.place.findMany({
      where: {
        isApproved: true,
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
      include: { category: true },
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

