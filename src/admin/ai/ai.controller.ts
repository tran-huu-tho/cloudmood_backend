import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { AiService } from './ai.service';

@Controller('admin/ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('chat')
  async chat(@Body() body: { message: string; history?: any[] }) {
    if (!body.message || typeof body.message !== 'string') {
      throw new BadRequestException(
        'Trường "message" là bắt buộc và phải là một chuỗi.',
      );
    }
    return this.aiService.chat(body.message, body.history || []);
  }
}
