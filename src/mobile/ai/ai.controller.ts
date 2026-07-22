import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MobileAiService } from './ai.service';

class AskPlaceDto {
  placeName: string;
  message: string;
}

class ChatDto {
  sessionId?: string;
  destination: string;
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

  @UseGuards(AuthGuard('jwt'))
  @Get('chat-sessions')
  async getChatSessions(@Request() req: any) {
    const userId = BigInt(req.user.id);
    const sessions = await this.aiService.getChatSessions(userId);
    return {
      success: true,
      data: sessions.map((s) => ({
        ...s,
        id: s.id.toString(),
      })),
    };
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('chat-sessions/:id/messages')
  async getChatMessages(@Request() req: any, @Param('id') id: string) {
    const userId = BigInt(req.user.id);
    const messages = await this.aiService.getChatMessages(userId, BigInt(id));
    return {
      success: true,
      data: messages.map((m) => ({
        ...m,
        id: m.id.toString(),
        sessionId: m.sessionId.toString(),
      })),
    };
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('chat')
  async processChat(@Request() req: any, @Body() dto: ChatDto) {
    const userId = BigInt(req.user.id);
    const sessionId = dto.sessionId ? BigInt(dto.sessionId) : undefined;
    const result = await this.aiService.processChat(
      userId,
      sessionId,
      dto.destination,
      dto.message,
    );

    return {
      success: true,
      data: {
        sessionId: result.sessionId.toString(),
        reply: result.reply,
      },
    };
  }
}
