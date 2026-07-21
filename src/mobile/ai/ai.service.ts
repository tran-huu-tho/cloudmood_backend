import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class MobileAiService {
  private readonly logger = new Logger(MobileAiService.name);
  private readonly apiKeys: string[] = [];
  private currentKeyIndex = 0;

  constructor(private readonly configService: ConfigService) {
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
          this.logger.warn(`API Key index ${this.currentKeyIndex} hit rate limit. Rotating to next key...`);
          this.rotateApiKey();
          continue; 
        }
        throw err;
      }
    }
  }

  async askPlaceQuestion(placeName: string, question: string): Promise<string> {
    const systemInstruction = `Bạn là trợ lý du lịch AI thông minh. Nhiệm vụ của bạn là trả lời các câu hỏi về địa điểm: "${placeName}". Hãy trả lời ngắn gọn, chính xác, thân thiện bằng tiếng Việt. Nếu bạn không biết hoặc câu hỏi không liên quan đến địa điểm, hãy từ chối một cách lịch sự.`;
    
    const payload = {
      system_instruction: {
        parts: [{ text: systemInstruction }]
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: question }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
      }
    };

    try {
      const response = await this.postWithKeyRotation('models/gemini-3.5-flash:generateContent', payload);
      const candidates = response.data?.candidates;
      if (candidates && candidates.length > 0) {
        return candidates[0].content.parts[0].text;
      }
      return 'Xin lỗi, tôi không thể trả lời câu hỏi này lúc này.';
    } catch (error) {
      this.logger.error('Error in askPlaceQuestion', error);
      throw error;
    }
  }
}
