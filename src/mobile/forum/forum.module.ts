import { Module } from '@nestjs/common';
import { ForumController } from './forum.controller';
import { ForumService } from './forum.service';
import { ForumGateway } from './forum.gateway';
import { ForumModerationService } from './forum-moderation.service';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { CloudinaryModule } from '../../shared/cloudinary/cloudinary.module';
import { MobileAiModule } from '../ai/ai.module';

@Module({
  imports: [PrismaModule, CloudinaryModule, MobileAiModule],
  controllers: [ForumController],
  providers: [ForumService, ForumGateway, ForumModerationService],
  exports: [ForumService, ForumModerationService],
})
export class ForumModule {}
