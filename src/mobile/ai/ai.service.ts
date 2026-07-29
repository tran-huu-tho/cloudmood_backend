import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrismaService } from '../../shared/prisma/prisma.service';
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
  ) {
    const rawKey = this.configService.get<string>('AI_API_KEY') || '';
    this.apiKey = rawKey.split(',')[0].trim();
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
    let cleanDest = destination
      .replace(/^Thành phố\s+/i, '')
      .replace(/^Thành Phố\s+/i, '')
      .replace(/^Tỉnh\s+/i, '')
      .replace(/^TP\.\s*/i, '')
      .replace(/^TP\s+/i, '')
      .trim();
    if (!cleanDest) cleanDest = destination;

    // ─── STEP 1: RAG FETCH — Lấy địa điểm thực từ Database ───────────────────
    const rawPlaces = await this.prisma.place.findMany({
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
        reviews: {
          take: 2,
          orderBy: { rating: 'desc' },
        },
      },
      orderBy: [
        { userRatingCount: { sort: 'desc', nulls: 'last' } },
        { rating: { sort: 'desc', nulls: 'last' } },
      ],
      take: 80,
    });

    let candidatePlaces = rawPlaces;

    if (candidatePlaces.length === 0) {
      // Fallback: Lấy các địa điểm nổi tiếng nhất hệ thống nếu chưa có dữ liệu riêng cho thành phố này
      candidatePlaces = await this.prisma.place.findMany({
        where: { isApproved: true },
        include: {
          category: true,
          reviews: { take: 2, orderBy: { rating: 'desc' } },
        },
        orderBy: [
          { userRatingCount: { sort: 'desc', nulls: 'last' } },
          { rating: { sort: 'desc', nulls: 'last' } },
        ],
        take: 80,
      });
    }

    // ─── FILTER: Loại bỏ địa điểm đã đóng cửa ────────────────────────────────
    // Hai format được dùng:
    //   1. Google weekday_text: { weekday_text: ["Monday: Closed", "Tuesday: 08:00–22:00", ...] }
    //   2. Internal map: { monday: ["08:00", "22:00"], tuesday: null, ... }
    const dayKeys = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

    const isPlaceClosed = (p: (typeof candidatePlaces)[number]): boolean => {
      if (!p.openingHours) return false;
      try {
        const h = typeof p.openingHours === 'string'
          ? JSON.parse(p.openingHours as string)
          : p.openingHours as Record<string, unknown>;

        if (!h || typeof h !== 'object') return false;

        // Format 1: weekday_text array — nếu tất cả đều "Closed" → đóng cửa
        if (Array.isArray((h as Record<string, unknown>).weekday_text)) {
          const texts = (h as Record<string, unknown[]>).weekday_text as string[];
          const allClosed = texts.every(t =>
            typeof t === 'string' && t.toLowerCase().includes('closed')
          );
          return allClosed && texts.length > 0;
        }

        // Format 2: map { monday: [...], tuesday: null, ... }
        // Nếu map có chứa ít nhất 1 ngày key nhưng tất cả giá trị đều null/empty → đóng cửa
        const hasDayKeys = dayKeys.some(d => Object.prototype.hasOwnProperty.call(h, d));
        if (hasDayKeys) {
          const allNull = dayKeys.every(d => {
            const val = (h as Record<string, unknown>)[d];
            if (val == null) return true;
            if (Array.isArray(val) && val.length === 0) return true;
            if (typeof val === 'string') {
              const lower = val.toLowerCase();
              return lower.includes('closed') || lower.includes('đóng cửa');
            }
            return false;
          });
          return allNull;
        }
      } catch { /* ignore */ }
      return false;
    };

    const openPlaces = candidatePlaces.filter(p => !isPlaceClosed(p));
    // Chỉ áp dụng filter nếu vẫn còn đủ địa điểm (ít nhất 2 địa điểm/ngày)
    if (openPlaces.length >= days * 2) {
      candidatePlaces = openPlaces;
    }


    // Filter by categories if specified
    if (categories && categories.length > 0 && !categories.includes('Tất cả')) {
      const filtered = candidatePlaces.filter(p => {
        const catName = (p.category?.name || '').toLowerCase();
        return categories.some(c => {
          const cl = c.toLowerCase().split('&')[0].trim();
          return catName.includes(cl) || cl.includes(catName);
        });
      });
      if (filtered.length >= days * 2) {
        candidatePlaces = filtered;
      }
    }

    // ─── STEP 1b: GEOGRAPHIC CLUSTERING ─────────────────────────────────────────
    // Loại outlier địa lý: tính centroid từ top-20 địa điểm nổi bật nhất,
    // sau đó chỉ giữ các địa điểm trong bán kính hợp lý.
    const haversineKm = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
      const R = 6371;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLng = (lng2 - lng1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    // Lấy centroid từ top-20 địa điểm có toạ độ và rating cao nhất
    const geoPlaces = candidatePlaces.filter(p => p.latitude && p.longitude);
    if (geoPlaces.length >= days * 2) {
      // Score = rating * log(userRatingCount + 1) — ưu tiên nơi vừa nổi vừa nhiều review
      const scored = geoPlaces
        .map(p => ({
          p,
          score: (p.rating ?? 3.5) * Math.log((p.userRatingCount ?? 1) + 1),
        }))
        .sort((a, b) => b.score - a.score);

      const top20 = scored.slice(0, 20).map(s => s.p);
      const centLat = top20.reduce((sum, p) => sum + p.latitude, 0) / top20.length;
      const centLng = top20.reduce((sum, p) => sum + p.longitude, 0) / top20.length;

      // Tính khoảng cách mỗi địa điểm đến centroid
      const withDist = candidatePlaces
        .filter(p => p.latitude && p.longitude)
        .map(p => ({
          p,
          distKm: haversineKm(centLat, centLng, p.latitude, p.longitude),
          score: (p.rating ?? 3.5) * Math.log((p.userRatingCount ?? 1) + 1),
        }));

      // Chọn bán kính phù hợp: ít nhất đủ days*4 địa điểm nhưng không quá 25km
      const RADII = [5, 8, 12, 16, 20, 25];
      let chosenRadius = 25;
      for (const r of RADII) {
        const inRadius = withDist.filter(x => x.distKm <= r);
        if (inRadius.length >= days * 4) { chosenRadius = r; break; }
      }

      // Sắp xếp: gần centroid + rating cao lên trước; lấy tối đa 60
      const filtered = withDist
        .filter(x => x.distKm <= chosenRadius)
        .sort((a, b) => {
          // Normalize: điểm gần (dist nhỏ) được thưởng, rating cao được thưởng
          const distScore = -a.distKm * 0.3 + a.score;
          const distScoreB = -b.distKm * 0.3 + b.score;
          return distScoreB - distScore;
        })
        .slice(0, 60)
        .map(x => x.p);

      if (filtered.length >= days * 2) {
        candidatePlaces = filtered;
        this.logger.log(`Geo-cluster: radius=${chosenRadius}km, centroid=(${centLat.toFixed(4)},${centLng.toFixed(4)}), kept ${filtered.length} places`);
      }
    }

    // ─── STEP 2: BUILD CONTEXT & PROMPT FOR GEMINI ────────────────────────────

    const startDateObj = new Date(startDate);
    const weekdayNames = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

    // Build day-by-date mapping for opening hours context
    const dayDateList: string[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(startDateObj);
      d.setDate(d.getDate() + i);
      dayDateList.push(`Ngày ${i + 1}: ${weekdayNames[d.getDay()]} (${d.toLocaleDateString('vi-VN')})`);
    }

    // Serialize candidate places with clear per-day availability for Gemini
    const dayKeyMap: Record<string, string> = {
      monday: 'T2', tuesday: 'T3', wednesday: 'T4',
      thursday: 'T5', friday: 'T6', saturday: 'T7', sunday: 'CN',
    };

    const getOpenDays = (hoursData: unknown): string => {
      if (!hoursData) return 'Không có thông tin';
      try {
        const h = typeof hoursData === 'string' ? JSON.parse(hoursData) : hoursData;

        // Format 1: Google weekday_text
        if (h?.weekday_text && Array.isArray(h.weekday_text) && h.weekday_text.length === 7) {
          const wt = h.weekday_text as string[];
          // weekday_text[0] = Monday, [6] = Sunday
          const dayLabels = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
          const open: string[] = [];
          const closed: string[] = [];
          wt.forEach((text: string, i: number) => {
            const t = text.toLowerCase();
            // Extract time range from string like "Monday: 08:00 – 22:00"
            if (t.includes('closed') || t.includes('đóng')) {
              closed.push(dayLabels[i]);
            } else {
              const timeMatch = text.match(/(\d{1,2}:\d{2})\s*[–\-]\s*(\d{1,2}:\d{2})/);
              open.push(timeMatch ? `${dayLabels[i]}(${timeMatch[1]}-${timeMatch[2]})` : dayLabels[i]);
            }
          });
          if (closed.length === 7) return 'Tạm đóng cửa';
          if (open.length === 7) return 'Mở cả tuần';
          return `Mở: ${open.join(', ')} | Đóng: ${closed.join(', ')}`;
        }

        // Format 2: internal map { monday: ['08:00', '22:00'], tuesday: null, ... }
        const hasDayKeys = dayKeys.some(d => Object.prototype.hasOwnProperty.call(h, d));
        if (hasDayKeys) {
          const open: string[] = [];
          const closed: string[] = [];
          dayKeys.forEach(d => {
            const label = dayKeyMap[d];
            const val = h[d];
            if (!val || (Array.isArray(val) && val.length === 0)) {
              closed.push(label);
            } else if (Array.isArray(val) && val.length >= 2) {
              open.push(`${label}(${val[0]}-${val[1]})`);
            } else {
              const s = String(val).toLowerCase();
              if (s.includes('closed') || s.includes('đóng')) closed.push(label);
              else open.push(`${label}(${val})`);
            }
          });
          if (closed.length === 7) return 'Tạm đóng cửa';
          if (open.length === 7) return 'Mở cả tuần';
          return `Mở: ${open.join(', ')} | Đóng: ${closed.join(', ')}`;
        }
      } catch { /* ignore */ }
      return 'Không có thông tin';
    };

    const placesJson = candidatePlaces.map(p => {
      const topReview = p.reviews?.[0]?.comment?.substring(0, 100) || null;

      return {
        id: Number(p.id),
        name: p.name,
        category: p.category?.name || 'Khác',
        address: p.address || '',
        rating: p.rating ? Number(p.rating) : null,
        priceLevel: p.priceLevel || null,
        description: p.description ? p.description.substring(0, 150) : null,
        openDays: getOpenDays(p.openingHours),
        lat: p.latitude ? Number(p.latitude) : null,
        lng: p.longitude ? Number(p.longitude) : null,
        topReview,
      };
    });


    const paceLabel = pace.includes('Thong thả') ? '2-3 địa điểm mỗi ngày (thư thái, nghỉ dưỡng)'
      : pace.includes('Dày đặc') ? '5-6 địa điểm mỗi ngày (khám phá tối đa)'
        : '3-4 địa điểm mỗi ngày (cân bằng trải nghiệm và nghỉ ngơi)';

    const systemInstruction = `Bạn là chuyên gia lập lịch trình du lịch hàng đầu Việt Nam với 20 năm kinh nghiệm.
Nhiệm vụ của bạn: Phân tích yêu cầu chuyến đi, tuyển chọn địa điểm phù hợp từ danh sách được cung cấp, và tạo ra lịch trình ${days} ngày hoàn hảo.

QUY TẮC QUAN TRỌNG (PHẢI TUÂN THỦ NGHIÊM NGẶT):
1. Chỉ được dùng các "id" địa điểm có trong danh sách JSON bên dưới — KHÔNG được bịa hoặc tự tạo id mới.
2. Mỗi địa điểm chỉ xuất hiện đúng 1 lần trong toàn bộ lịch trình.
3. BẮT BUỘC KIỂM TRA NGÀY MỞ CỬA: Mỗi địa điểm có trường "openDays" cho biết ngày nào mở (T2=Thứ Hai, T3=Thứ Ba, T4=Thứ Tư, T5=Thứ Năm, T6=Thứ Sáu, T7=Thứ Bảy, CN=Chủ Nhật). Ví dụ "Mở: T2(08:00-22:00) | Đóng: T3, T4, T5, T6, T7, CN" nghĩa là địa điểm CHỈ mở Thứ Hai. Bạn TUYỆT ĐỐI KHÔNG được xếp địa điểm này vào ngày T3, T4, T5, T6, T7 hay CN. Lịch cụ thể từng ngày trong tuần đã có trong "Lịch từng ngày" — hãy đối chiếu trước khi xếp.
4. BẮT BUỘC VỀ ĐỊA LÝ: Các địa điểm trong CÙNG MỘT NGÀY phải nằm trong cùng một khu vực, khoảng cách giữa chúng không vượt quá 6-8km (dùng lat/lng để ước tính). Không được xếp địa điểm ở đầu thành phố và cuối thành phố vào cùng một ngày. Hãy tưởng tượng người đi bộ hoặc đi xe máy — họ nên đi theo một hành trình mạch lạc, không zigzag.
5. ƯU TIÊN ĐỊA ĐIỂM HOT: Trước tiên chọn các địa điểm có rating cao (>= 4.0) và nhiều review (userRatingCount lớn). Đây là những nơi được du khách yêu thích nhất. Chỉ dùng địa điểm ít nổi hơn khi không đủ địa điểm hot trong khu vực đó.
6. Đảm bảo đúng số lượng địa điểm theo nhịp độ được yêu cầu.
7. Trả về JSON hợp lệ, không thêm markdown, không thêm giải thích, không thêm text trước hoặc sau JSON.

FORMAT JSON TRẢ VỀ (chính xác theo cấu trúc này):
{
  "days": [
    {
      "dayNumber": 1,
      "dayTitle": "Tên chủ đề ngày 1 sáng tạo, gợi cảm xúc",
      "places": [
        {
          "placeId": 123,
          "note": "Câu ghi chú chi tiết, sinh động, cá nhân hóa cho địa điểm này (1-2 câu, không dùng emoji)"
        }
      ]
    }
  ]
}`;

    const userPrompt = `THÔNG TIN CHUYẾN ĐI:
- Điểm đến: ${destination}
- Số ngày: ${days} ngày
- Lịch từng ngày: ${dayDateList.join(', ')}
- Nhịp độ: ${paceLabel}
- Đi cùng: ${companion || 'Không xác định'}
- Ngân sách: ${budget || 'Vừa phải'}
${customRequest ? `- Yêu cầu riêng: "${customRequest}"` : ''}

DANH SÁCH ĐỊA ĐIỂM THỰC TẾ TỪ CLOUDMOOD DATABASE:
${JSON.stringify(placesJson, null, 2)}

Hãy tạo lịch trình ${days} ngày với nhịp độ ${paceLabel}. Viết tiêu đề ngày sáng tạo và ghi chú địa điểm chi tiết, tự nhiên, thể hiện đúng văn hóa và đặc trưng của từng nơi. Trả về JSON thuần túy.`;

    const payload = {
      system_instruction: {
        parts: [{ text: systemInstruction }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: userPrompt }],
        },
      ],
      generationConfig: {
        temperature: 0.75,
        responseMimeType: 'application/json',
      },
    };

    // ─── STEP 3: CALL GEMINI AI ────────────────────────────────────────────────
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

    // ─── STEP 4: PARSE & VALIDATE JSON FROM GEMINI ────────────────────────────
    let parsed: any;
    try {
      // Strip possible markdown code fences
      const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      this.logger.error('Failed to parse Gemini JSON response', rawText.substring(0, 500));
      throw new Error('Trợ lý AI trả về dữ liệu không hợp lệ. Vui lòng thử lại.');
    }

    // Build valid ID set + hoursMap for post-validation
    const validIdSet = new Set(candidatePlaces.map(p => Number(p.id)));
    const usedIdSet = new Set<number>();
    const placeHoursMap = new Map(candidatePlaces.map(p => [Number(p.id), p.openingHours]));

    // weekday: JS Date.getDay() => 0=Sun,1=Mon,...,6=Sat
    const weekdayToKeyLocal = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

    const isOpenOnWeekday = (hoursData: unknown, weekdayIdx: number): boolean => {
      if (!hoursData) return true;
      try {
        const h = typeof hoursData === 'string' ? JSON.parse(hoursData as string) : hoursData as Record<string, unknown>;

        // Format 1: weekday_text (0=Monday, 6=Sunday)
        const wt = (h as Record<string, unknown>)?.weekday_text;
        if (wt && Array.isArray(wt) && (wt as unknown[]).length === 7) {
          const wtIdx = weekdayIdx === 0 ? 6 : weekdayIdx - 1;
          const text = ((wt as string[])[wtIdx] || '').toLowerCase();
          return !text.includes('closed') && !text.includes('dong');
        }

        // Format 2: internal map { monday: [...], ... }
        const dayKey = weekdayToKeyLocal[weekdayIdx];
        const hasDayKeysHere = dayKeys.some(d => Object.prototype.hasOwnProperty.call(h, d));
        if (hasDayKeysHere) {
          if (!Object.prototype.hasOwnProperty.call(h, dayKey)) return false;
          const val = (h as Record<string, unknown>)[dayKey];
          if (!val) return false;
          if (Array.isArray(val)) return (val as unknown[]).length > 0;
          const s = String(val).toLowerCase();
          return !s.includes('closed') && !s.includes('dong');
        }
      } catch { /* ignore */ }
      return true;
    };

    // Validate and sanitize (includes per-weekday opening hours check)
    const startDateObjFinal = new Date(startDate);

    const validatedDays = (parsed.days || []).map((day: any, idx: number) => {
      const tripDate = new Date(startDateObjFinal);
      tripDate.setDate(tripDate.getDate() + idx);
      const weekdayIdx = tripDate.getDay();

      const validatedPlaces = (day.places || [])
        .filter((p: any) => {
          const pid = Number(p.placeId);
          if (!validIdSet.has(pid)) {
            this.logger.warn('Gemini invalid placeId ' + pid + ' - skipping');
            return false;
          }
          if (usedIdSet.has(pid)) {
            this.logger.warn('Gemini duplicate placeId ' + pid + ' - skipping');
            return false;
          }
          const hoursData = placeHoursMap.get(pid);
          if (!isOpenOnWeekday(hoursData, weekdayIdx)) {
            this.logger.warn('Gemini placed id=' + pid + ' on closed weekday ' + weekdayIdx + ' - removing');
            return false;
          }
          usedIdSet.add(pid);
          return true;
        })
        .map((p: any) => ({
          placeId: Number(p.placeId),
          note: (p.note || '').toString().trim(),
        }));

      return {
        dayNumber: day.dayNumber || idx + 1,
        dayTitle: (day.dayTitle || ('Ngay ' + (idx + 1))).toString().trim(),
        places: validatedPlaces,
      };
    });

    this.logger.log('generateItinerary: ' + validatedDays.length + ' days, ' + usedIdSet.size + ' places for "' + destination + '"');

    return { days: validatedDays };
  }
}

