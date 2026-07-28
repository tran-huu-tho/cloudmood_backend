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

    const systemInstruction = `Bạn là trợ lý du lịch AI thông minh của ứng dụng CloudMood. Nhiệm vụ của bạn là hỗ trợ người dùng về chuyến đi tới: "${destination}". Hãy trả lời ngắn gọn, chính xác, thân thiện bằng tiếng Việt. Sử dụng Markdown để format câu trả lời cho dễ đọc (bold, danh sách, tiêu đề con).${destinationContext}`;

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
  ): Observable<MessageEvent> {
    const subject = new Subject<MessageEvent>();

    this.handleStreamChat(userId, sessionId, destination, message, subject)
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

    const systemInstruction = `Bạn là trợ lý du lịch AI thông minh của ứng dụng CloudMood. Nhiệm vụ của bạn là hỗ trợ người dùng về chuyến đi tới: "${destination}". Hãy trả lời ngắn gọn, chính xác, thân thiện bằng tiếng Việt. Sử dụng Markdown để format câu trả lời cho dễ đọc.${destinationContext}`;

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
}
