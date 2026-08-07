import {
  Controller,
  Post,
  Body,
  Get,
  Delete,
  Param,
  Query,
  UseGuards,
  Request,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MobileAiService } from './ai.service';
import * as express from 'express';

class AskPlaceDto {
  placeName: string;
  message: string;
}

export class TripConfigDto {
  days?: number;
  companions?: string;
  categories?: string[];
  budget?: string;
  currency?: string;
}

export class GenerateItineraryDto {
  destination: string;
  days: number;
  companion: string;
  budget: string;
  categories: string[];
  startDate: string;
  customRequest?: string;
}

export class ReplacePlaceDto {
  destination?: string;
  currentLat: number;
  currentLng: number;
  oldPlaceId: number;
  isRainy?: boolean;
  categoryNeeded?: string;
}

class ChatDto {
  sessionId?: string;
  destination: string;
  message: string;
  tripConfig?: TripConfigDto;
}

@Controller('mobile/ai')
export class MobileAiController {
  constructor(private readonly aiService: MobileAiService) { }

  @Post('ask-place')
  async askPlace(@Body() dto: AskPlaceDto) {
    const { placeName, message } = dto;
    const reply = await this.aiService.askPlaceQuestion(placeName, message);
    return { success: true, reply };
  }

  // Endpoint kiểm tra thống kê CSDL thực tế
  @Get('db-stats')
  async getDbStats() {
    const data = await this.aiService.getDbStats();
    return { success: true, data };
  }

  // Suggestions API: trả về câu hỏi gợi ý dựa trên dữ liệu thực
  @Get('suggestions')
  async getSuggestions(
    @Query('placeName') placeName: string,
    @Query('type') type: string = 'place',
  ) {
    const suggestions = await this.aiService.getSuggestions(
      placeName || '',
      type === 'trip' ? 'trip' : 'place',
    );
    return { success: true, data: suggestions };
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
  @Delete('chat-sessions/:id')
  async deleteChatSession(@Request() req: any, @Param('id') id: string) {
    const userId = BigInt(req.user.id);
    await this.aiService.deleteChatSession(userId, BigInt(id));
    return { success: true, message: 'Đã xóa cuộc trò chuyện' };
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
      dto.tripConfig,
    );

    return {
      success: true,
      data: {
        sessionId: result.sessionId.toString(),
        reply: result.reply,
      },
    };
  }

  // Streaming Chat — POST endpoint that manually writes SSE
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  @Post('chat/stream')
  async streamChat(
    @Request() req: any,
    @Body() dto: ChatDto,
    @Res() res: express.Response,
  ) {
    const userId = BigInt(req.user.id);
    const sessionId = dto.sessionId ? BigInt(dto.sessionId) : undefined;

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const observable = this.aiService.streamChat(
      userId,
      sessionId,
      dto.destination,
      dto.message,
      dto.tripConfig,
    );

    observable.subscribe({
      next: (event) => {
        res.write(`data: ${event.data}\n\n`);
      },
      complete: () => {
        res.end();
      },
      error: (err) => {
        res.write(`data: ${JSON.stringify({ type: 'error', content: 'Có lỗi xảy ra.' })}\n\n`);
        res.end();
      },
    });

    // Handle client disconnect
    req.on('close', () => {
      // Client disconnected
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // HYBRID RAG + GEMINI AI AGENT — Generate full itinerary
  // ────────────────────────────────────────────────────────────────────────────
  @UseGuards(AuthGuard('jwt'))
  @Post('generate-itinerary')
  async generateItinerary(@Body() dto: GenerateItineraryDto) {
    const result = await this.aiService.generateItinerary(dto);
    return { success: true, data: result };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // EMERGENCY REPLACEMENT API — Real-time place replacement
  // ────────────────────────────────────────────────────────────────────────────
  @UseGuards(AuthGuard('jwt'))
  @Post('replace-place')
  async replacePlace(@Body() dto: ReplacePlaceDto) {
    const result = await this.aiService.replacePlace(dto);
    return { success: true, data: result.replacementPlace };
  }
}

