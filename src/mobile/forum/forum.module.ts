import { Module } from '@nestjs/common';
import { ForumController } from './forum.controller';
import { ForumService } from './forum.service';
import { ForumGateway } from './forum.gateway';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { CloudinaryModule } from '../../shared/cloudinary/cloudinary.module';

@Module({
  imports: [PrismaModule, CloudinaryModule],
  controllers: [ForumController],
  providers: [ForumService, ForumGateway],
  exports: [ForumService],
})
export class ForumModule {}
