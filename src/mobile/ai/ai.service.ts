import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { ChildProcess, spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

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
  private readonly apiKeys: string[] = [];
  private currentKeyIndex = 0;
  private pythonProcess: ChildProcess | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const rawKeys = this.configService.get<string>('AI_API_KEY') || '';
    this.apiKeys = rawKeys
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
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

  private async postWithKeyRotation(
    urlPath: string,
    payload: any,
  ): Promise<any> {
    if (this.apiKeys.length === 0) {
      throw new Error('Chưa cấu hình AI_API_KEY trong tệp .env.');
    }

    const isGemini35 = urlPath.includes('gemini-3.5-flash');
    const operation = urlPath.includes(':')
      ? urlPath.split(':')[1]
      : 'generateContent';

    const modelsToTry = isGemini35
      ? [
          'models/gemini-3.5-flash',
          'models/gemini-2.5-flash',
          'models/gemini-2.5-flash-lite',
        ]
      : [urlPath.split(':')[0]];

    const maxAttempts = Math.max(this.apiKeys.length, 1);
    let lastError: any;

    for (const model of modelsToTry) {
      let attempts = 0;
      while (attempts < maxAttempts) {
        attempts++;
        const currentKey = this.getApiKey();
        const url = `https://generativelanguage.googleapis.com/v1beta/${model}:${operation}?key=${currentKey}`;

        try {
          const response = await axios.post(url, payload, { timeout: 30000 });
          return response;
        } catch (err: any) {
          lastError = err;
          const apiErrorMessage = err.response?.data?.error?.message || '';
          const isQuotaExceeded =
            err.response?.status === 429 ||
            apiErrorMessage.toLowerCase().includes('quota') ||
            err.message.toLowerCase().includes('quota') ||
            err.message.includes('429');

          if (isQuotaExceeded) {
            this.logger.warn(
              `API Key index ${this.currentKeyIndex} hit rate limit for ${model}.`,
            );
            if (attempts < maxAttempts) {
              this.logger.warn(`Rotating to next key...`);
              this.rotateApiKey();
              continue;
            } else {
              this.logger.warn(
                `All keys exhausted for ${model}. Falling back to next model...`,
              );
              this.rotateApiKey(); // rotate for the next model's first attempt
              break; // breaks while loop, moves to next model
            }
          }
          throw err;
        }
      }
    }

    throw lastError || new Error('All models and keys failed.');
  }

  async askPlaceQuestion(placeName: string, question: string): Promise<string> {
    const systemInstruction = `Bạn là trợ lý du lịch AI thông minh. Nhiệm vụ của bạn là trả lời các câu hỏi về địa điểm: "${placeName}". Hãy trả lời ngắn gọn, chính xác, thân thiện bằng tiếng Việt. Nếu bạn không biết hoặc câu hỏi không liên quan đến địa điểm, hãy từ chối một cách lịch sự.`;

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

    // Fetch context
    const previousMessages = await this.prisma.chatMessage.findMany({
      where: { sessionId: currentSessionId },
      orderBy: { createdAt: 'asc' },
    });

    const systemInstruction = `Bạn là trợ lý du lịch AI thông minh của ứng dụng CloudMood. Nhiệm vụ của bạn là hỗ trợ người dùng về chuyến đi tới: "${destination}". Hãy trả lời ngắn gọn, chính xác, thân thiện bằng tiếng Việt.`;

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

  async moderateContent(text: string): Promise<{ isViolation: boolean; category: string | null; reason: string | null }> {
    const customAiUrl = this.configService.get<string>('CUSTOM_AI_MODERATION_URL') || 'http://localhost:8000/moderate';

    try {
      this.logger.log(`Using custom AI moderation model at ${customAiUrl}...`);
      const response = await axios.post(customAiUrl, { text }, { timeout: 5000 });
      if (response.status === 200 && response.data) {
        const { isViolation, category, reason } = response.data;
        this.logger.log(`Custom AI result: isViolation=${isViolation}, category=${category}`);
        return {
          isViolation: !!isViolation,
          category: category || null,
          reason: reason || null,
        };
      }
      throw new Error(`Failed to call Custom AI service: status code ${response.status}`);
    } catch (error: any) {
      this.logger.error(`⚠️ Custom AI moderation failed: ${error.message}`);
      // Mặc định cho phép nội dung nếu dịch vụ AI offline để không block diễn đàn
      return { isViolation: false, category: null, reason: null };
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
