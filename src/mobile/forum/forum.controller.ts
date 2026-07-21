import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFiles,
  UploadedFile,
  Injectable,
} from '@nestjs/common';
import { ForumService } from './forum.service';
import { AuthGuard } from '@nestjs/passport';
import { FilesInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { CloudinaryService } from '../../shared/cloudinary/cloudinary.service';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err, user, info, context) {
    return user || null;
  }
}

@Controller('forum')
export class ForumController {
  constructor(
    private readonly forumService: ForumService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  // 1. Lấy bảng tin bài đăng (Feed)
  @Get('feed')
  @UseGuards(OptionalJwtAuthGuard)
  getFeed(
    @Request() req,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('query') query?: string,
  ) {
    const userId = req.user ? Number(req.user.id) : undefined;
    return this.forumService.getFeed(
      userId,
      page ? parseInt(page) : 1,
      pageSize ? parseInt(pageSize) : 10,
      query,
    );
  }

  // 1.2 Lấy danh sách bài viết đã lưu
  @Get('saved')
  @UseGuards(AuthGuard('jwt'))
  getSavedPosts(
    @Request() req,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const userId = Number(req.user.id);
    return this.forumService.getSavedPosts(
      userId,
      page ? parseInt(page) : 1,
      pageSize ? parseInt(pageSize) : 10,
    );
  }

  // 2. Chi tiết bài đăng & bình luận
  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  findOne(@Request() req, @Param('id', ParseIntPipe) id: number) {
    const userId = req.user ? Number(req.user.id) : undefined;
    return this.forumService.getPostDetail(id, userId);
  }

  // 3. Đăng bài viết mới (kèm tải ảnh/video lên Cloudinary)
  @Post()
  @UseGuards(AuthGuard('jwt'))
  @UseInterceptors(FilesInterceptor('media'))
  async create(
    @Request() req,
    @Body('content') content: string,
    @Body('placeId') placeId?: string,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    const userId = Number(req.user.id);
    const mediaList: { url: string; mediaType: string }[] = [];

    if (files && files.length > 0) {
      for (const file of files) {
        const isVideo = file.mimetype.startsWith('video/');
        try {
          const uploadResult = await this.cloudinaryService.uploadFile(
            file,
            isVideo ? 'video' : 'image',
          );
          mediaList.push({
            url: uploadResult.secure_url || uploadResult.url,
            mediaType: isVideo ? 'VIDEO' : 'IMAGE',
          });
        } catch (error) {
          console.error('Lỗi khi tải tệp lên Cloudinary:', error);
        }
      }
    }

    const parsedPlaceId = placeId && placeId !== 'null' && placeId !== 'undefined'
      ? Number(placeId)
      : undefined;

    return this.forumService.createPost(
      userId,
      content,
      parsedPlaceId,
      mediaList,
    );
  }

  // 4. Thả tim / Bỏ thích bài viết
  @Post(':id/like')
  @UseGuards(AuthGuard('jwt'))
  likePost(@Request() req, @Param('id', ParseIntPipe) id: number) {
    const userId = Number(req.user.id);
    return this.forumService.toggleLike(id, userId);
  }

  // 5. Lưu bài viết / Bỏ lưu
  @Post(':id/save')
  @UseGuards(AuthGuard('jwt'))
  savePost(@Request() req, @Param('id', ParseIntPipe) id: number) {
    const userId = Number(req.user.id);
    return this.forumService.toggleSave(id, userId);
  }

  // 6. Bình luận vào bài viết (Hỗ trợ đính kèm 1 ảnh/video)
  @Post(':id/comment')
  @UseGuards(AuthGuard('jwt'))
  @UseInterceptors(FileInterceptor('media'))
  async addComment(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body('content') content: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const userId = Number(req.user.id);
    let mediaUrl: string | undefined = undefined;
    let mediaType: string | undefined = undefined;

    if (file) {
      const isVideo = file.mimetype.startsWith('video/');
      try {
        const uploadResult = await this.cloudinaryService.uploadFile(
          file,
          isVideo ? 'video' : 'image',
        );
        mediaUrl = uploadResult.secure_url || uploadResult.url;
        mediaType = isVideo ? 'VIDEO' : 'IMAGE';
      } catch (error) {
        console.error('Lỗi khi tải tệp đính kèm bình luận lên Cloudinary:', error);
      }
    }

    return this.forumService.addComment(id, userId, content, mediaUrl, mediaType);
  }

  // 6.2 Xóa bình luận bài viết
  @Delete('comment/:commentId')
  @UseGuards(AuthGuard('jwt'))
  deleteComment(
    @Request() req,
    @Param('commentId', ParseIntPipe) commentId: number,
  ) {
    const userId = Number(req.user.id);
    return this.forumService.deleteComment(commentId, userId);
  }

  // 6.3 Chỉnh sửa bình luận bài viết
  @Patch('comment/:commentId')
  @UseGuards(AuthGuard('jwt'))
  @UseInterceptors(FileInterceptor('media'))
  async updateComment(
    @Request() req,
    @Param('commentId', ParseIntPipe) commentId: number,
    @Body('content') content: string,
    @Body('clearMedia') clearMedia?: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const userId = Number(req.user.id);
    let mediaUrl: string | undefined = undefined;
    let mediaType: string | undefined = undefined;

    if (file) {
      const isVideo = file.mimetype.startsWith('video/');
      try {
        const uploadResult = await this.cloudinaryService.uploadFile(
          file,
          isVideo ? 'video' : 'image',
        );
        mediaUrl = uploadResult.secure_url || uploadResult.url;
        mediaType = isVideo ? 'VIDEO' : 'IMAGE';
      } catch (error) {
        console.error('Lỗi khi tải tệp đính kèm chỉnh sửa bình luận:', error);
      }
    }

    const clearMediaBool = clearMedia === 'true';

    return this.forumService.updateComment(
      commentId,
      userId,
      content,
      clearMediaBool,
      mediaUrl,
      mediaType,
    );
  }

  // 7. Chỉnh sửa bài đăng
  @Patch(':id')
  @UseGuards(AuthGuard('jwt'))
  @UseInterceptors(FilesInterceptor('media'))
  async updatePost(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body('content') content: string,
    @Body('placeId') placeId?: string,
    @Body('clearMedia') clearMedia?: string,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    const userId = Number(req.user.id);
    const mediaList: { url: string; mediaType: string }[] = [];

    if (files && files.length > 0) {
      for (const file of files) {
        const isVideo = file.mimetype.startsWith('video/');
        try {
          const uploadResult = await this.cloudinaryService.uploadFile(
            file,
            isVideo ? 'video' : 'image',
          );
          mediaList.push({
            url: uploadResult.secure_url || uploadResult.url,
            mediaType: isVideo ? 'VIDEO' : 'IMAGE',
          });
        } catch (error) {
          console.error('Lỗi khi tải tệp lên Cloudinary:', error);
        }
      }
    }

    const parsedPlaceId = placeId && placeId !== 'null' && placeId !== 'undefined'
      ? Number(placeId)
      : undefined;

    return this.forumService.updatePost(
      id,
      userId,
      content,
      parsedPlaceId,
      mediaList.length > 0 ? mediaList : undefined,
      clearMedia === 'true',
    );
  }

  // 8. Xóa bài đăng
  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  deletePost(@Request() req, @Param('id', ParseIntPipe) id: number) {
    const userId = Number(req.user.id);
    return this.forumService.deletePost(id, userId);
  }
}
