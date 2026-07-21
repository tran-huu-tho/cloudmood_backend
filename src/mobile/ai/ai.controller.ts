import { Controller, Post, Body } from '@nestjs/common';
import { MobileAiService } from './ai.service';

class AskPlaceDto {
  placeName: string;
  message: string;
}

@Controller('mobile/ai')
export class MobileAiController {
  constructor(private readonly aiService: MobileAiService) {}

  @Post('ask-place')
  async askPlace(@Body() dto: AskPlaceDto) {
    const { placeName, message } = dto;
    const reply = await this.aiService.askPlaceQuestion(placeName, message);
    return { success: true, reply };
  }
}
