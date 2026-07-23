import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { MobileAiService } from '../ai/ai.service';

@Injectable()
export class ForumModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: MobileAiService,
  ) { }

  // 1. Kiểm duyệt bài viết
  async validatePostContent(userId: number, content: string): Promise<void> {
    if (!content || content.trim() === '') {
      throw new BadRequestException('Nội dung không được để trống.');
    }

    // A. Rule-based checks (Quy tắc cứng)
    this.runRuleBasedChecks(content);

    // B. Kiểm tra giới hạn tần suất đăng bài (Rate Limit)
    await this.checkPostRateLimit(userId);

    // C. Kiểm duyệt bằng AI (Gemini)
    await this.runAiModeration(content);
  }

  // 2. Kiểm duyệt bình luận
  async validateCommentContent(userId: number, content: string): Promise<void> {
    if (!content || content.trim() === '') {
      throw new BadRequestException('Nội dung bình luận không được để trống.');
    }

    // A. Rule-based checks (Quy tắc cứng)
    this.runRuleBasedChecks(content);

    // B. Kiểm tra giới hạn tần suất bình luận (Rate Limit)
    await this.checkCommentRateLimit(userId);

    // C. Kiểm duyệt bằng AI (Gemini)
    await this.runAiModeration(content);
  }

  // --- Hỗ trợ kiểm duyệt dựa trên Quy tắc (Rule-based) ---
  private runRuleBasedChecks(text: string) {
    const trimmedText = text.trim();

    // 1. Chặn Nội dung quá ngắn
    if (trimmedText.length < 3) {
      throw new BadRequestException(
        'Nội dung vi phạm nguyên tắc cộng đồng. Lý do: Nội dung quá ngắn (tối thiểu 3 ký tự).',
      );
    }

    // 2. Chống Spam Ký tự lặp (5+ ký tự liên tiếp giống nhau)
    const repetitiveCharRegex = /(\S)\1{4,}/g;
    if (repetitiveCharRegex.test(trimmedText)) {
      throw new BadRequestException(
        'Nội dung vi phạm nguyên tắc cộng đồng. Lý do: Phát hiện spam ký tự lặp liên tiếp.',
      );
    }

    // 3. Chống Spam Emojis (quá 5 emoji liên tiếp)
    const consecutiveEmojiRegex = /([\u{1F300}-\u{1F9FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]){6,}/gu;
    if (consecutiveEmojiRegex.test(trimmedText)) {
      throw new BadRequestException(
        'Nội dung vi phạm nguyên tắc cộng đồng. Lý do: Spam quá nhiều biểu tượng (emoji) liên tiếp.',
      );
    }

    // 4. Chống Spam Liên kết (chứa > 2 liên kết bất kỳ)
    const linkRegex = /https?:\/\/[^\s]+/gi;
    const links = trimmedText.match(linkRegex) || [];
    if (links.length > 2) {
      throw new BadRequestException(
        'Nội dung vi phạm nguyên tắc cộng đồng. Lý do: Không được chia sẻ quá 2 liên kết.',
      );
    }

    // 5. Chặn các liên kết quảng cáo bán hàng / Zalo / Telegram / Rút gọn link
    const blockedDomains = [
      /shopee\.vn/i, /lazada\.vn/i, /tiki\.vn/i, /tiktok\.com\/t\//i,
      /t\.me\//i, /zalo\.me\//i, /bit\.ly/i, /tinyurl\.com/i, /goo\.gl/i
    ];
    const hasBlockedDomain = blockedDomains.some((domain) => domain.test(trimmedText));
    if (hasBlockedDomain) {
      throw new BadRequestException(
        'Nội dung vi phạm nguyên tắc cộng đồng. Lý do: Không được chia sẻ các liên kết không rõ ràng.',
      );
    }

    // 6. Chặn Tiết lộ Thông tin cá nhân (PII Protection)
    // - Số CCCD/CMND Việt Nam (9 số hoặc 12 số)
    const cccdRegex = /\b(\d{9}|\d{12})\b/;
    if (cccdRegex.test(trimmedText)) {
      throw new BadRequestException(
        'Nội dung vi phạm nguyên tắc cộng đồng. Lý do: Không được công khai số CCCD/CMND.',
      );
    }
    // - Số thẻ ngân hàng (thông thường 16 số liên tiếp hoặc ngăn cách bởi khoảng trắng/dấu gạch)
    const bankCardRegex = /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/;
    if (bankCardRegex.test(trimmedText)) {
      throw new BadRequestException(
        'Nội dung vi phạm nguyên tắc cộng đồng. Lý do: Không được công khai thông tin thẻ ngân hàng.',
      );
    }
    // - API Key / Token / Passwords (chứa mã nhạy cảm như JWT hay Google API Key)
    const jwtRegex = /\beyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_=]*\b/;
    const googleApiKeyRegex = /\bAIzaSy[A-Za-z0-9-_]{33}\b/;
    if (jwtRegex.test(trimmedText) || googleApiKeyRegex.test(trimmedText)) {
      throw new BadRequestException(
        'Nội dung vi phạm nguyên tắc cộng đồng. Lý do: Phát hiện mã JWT hoặc API Key nhạy cảm.',
      );
    }
    // - Email & Số điện thoại (Chặn spam số điện thoại và email công khai để tránh bị doxxing)
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
    const phoneRegex = /\b(0[3|5|7|8|9]\d{8})\b/; // Định dạng số điện thoại Việt Nam
    if (emailRegex.test(trimmedText) || phoneRegex.test(trimmedText)) {
      throw new BadRequestException(
        'Nội dung vi phạm nguyên tắc cộng đồng. Lý do: Không chia sẻ thông tin liên lạc cá nhân công khai.',
      );
    }

    // 7. Bảo mật hệ thống (Chống SQL Injection & XSS)
    const sqlInjectionRegex = /\b(union\s+select|select\s+.*\s+from|insert\s+into|drop\s+table|delete\s+from|update\s+.*\s+set)\b/i;
    const htmlXssRegex = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/i;
    const jsUriRegex = /javascript:/i;
    if (sqlInjectionRegex.test(trimmedText) || htmlXssRegex.test(trimmedText) || jsUriRegex.test(trimmedText)) {
      throw new BadRequestException(
        'Nội dung vi phạm nguyên tắc cộng đồng. Lý do: Phát hiện hành vi tấn công hệ thống (SQL Injection / XSS).',
      );
    }

    // 8. Các mẫu thù ghét/quảng cáo nhạy cảm phổ biến (Hate speech / Sensitive patterns)
    const hatePatterns = [
      /china\s*dog/i,
      /china\s*shit/i,
      /sex\.com/i,
      /porn\.com/i,
      /vlxx/i,
      /lauxanh/i,
      /thiendia/i,
    ];
    const hasHatePattern = hatePatterns.some((pattern) => pattern.test(trimmedText));
    if (hasHatePattern) {
      throw new BadRequestException(
        'Nội dung vi phạm nguyên tắc cộng đồng. Lý do: Phát hiện ngôn từ kích động thù ghét hoặc liên kết nhạy cảm.',
      );
    }

    // 9. Danh sách từ cấm nội bộ (Việt hóa + English nhạy cảm phổ biến) để lọc nhanh
    const normalizedText = trimmedText
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, ''); // loại bỏ dấu tiếng Việt

    const localBadWords = [
      'dm', 'dkm', 'deo', 'lon', 'cac', 'vcl', 'vkl', 'du', 'cho', 'ngu', 'bu',
      'con cac', 'con lon', 'dcm', 'dcmm', 'dit me', 'ditme', 'dit', 'clm', 'clmm', 'clgt',
      'sex', 'porn', 'shit', 'dam', 'damdang', 'dambang', '18+', 'vlxx', 'lauxanh', 'thiendia',
      'cobac', 'ca do', 'ma tuy', 'keo da', 'thuoc phien'
    ];

    const words = normalizedText.split(/[\s,.\-!?]+/);
    const hasBadWord = words.some((word) => localBadWords.includes(word));
    if (hasBadWord) {
      throw new BadRequestException(
        'Nội dung vi phạm nguyên tắc cộng đồng. Lý do: Chứa từ ngữ thô tục hoặc nhạy cảm không phù hợp.',
      );
    }
  }

  // --- Hỗ trợ kiểm tra Rate Limit (Giới hạn tần suất) ---
  private async checkPostRateLimit(userId: number) {
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    const recentPostsCount = await this.prisma.forumPost.count({
      where: {
        userId: BigInt(userId),
        createdAt: { gte: oneMinuteAgo },
      },
    });

    if (recentPostsCount >= 3) {
      throw new BadRequestException(
        'Bạn đang đăng bài quá nhanh. Vui lòng đợi 1 phút trước khi đăng bài mới.',
      );
    }
  }

  private async checkCommentRateLimit(userId: number) {
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    const recentCommentsCount = await this.prisma.forumComment.count({
      where: {
        userId: BigInt(userId),
        createdAt: { gte: oneMinuteAgo },
      },
    });

    if (recentCommentsCount >= 5) {
      throw new BadRequestException(
        'Bạn đang bình luận quá nhanh. Vui lòng đợi 1 phút trước khi gửi bình luận mới.',
      );
    }
  }

  // --- Hỗ trợ kiểm duyệt bằng AI ---
  private async runAiModeration(text: string) {
    try {
      const result = await this.aiService.moderateContent(text);
      if (result.isViolation) {
        throw new BadRequestException(
          `Nội dung vi phạm nguyên tắc cộng đồng. Lý do: ${result.category || 'Không xác định'} - ${result.reason || ''}`,
        );
      }
    } catch (error) {
      // Bỏ qua lỗi AI nếu do quá hạn mức quota/lỗi mạng để không block người dùng hoàn toàn,
      // nhưng sẽ ném lỗi nếu đó là BadRequestException từ kiểm duyệt bên trên.
      if (error instanceof BadRequestException) {
        throw error;
      }
      console.warn('⚠️ Lỗi AI Moderation (kiểm tra lại AI_API_KEY):', error.message);
    }
  }
}
