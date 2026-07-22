import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { ForumGateway } from './forum.gateway';

@Injectable()
export class ForumService {
  constructor(
    private prisma: PrismaService,
    private forumGateway: ForumGateway,
  ) {}

  // 1. Tạo bài viết mới
  async createPost(
    userId: number,
    content: string,
    placeId?: number,
    mediaList?: { url: string; mediaType: string }[],
  ) {
    // Lưu vào database
    const post = await this.prisma.forumPost.create({
      data: {
        userId: BigInt(userId),
        content,
        placeId: placeId ? BigInt(placeId) : null,
        media: mediaList
          ? {
              create: mediaList.map((m, index) => ({
                url: m.url,
                mediaType: m.mediaType,
                sortOrder: index,
              })),
            }
          : undefined,
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            avatar: true,
          },
        },
        place: {
          include: {
            category: true,
            photos: true,
          },
        },
        media: true,
        _count: {
          select: {
            likes: true,
            comments: true,
            saves: true,
          },
        },
      },
    });

    // Phát sóng qua socket để hiển thị bài viết mới trực tiếp
    this.forumGateway.broadcastNewPostAdded(post);

    return post;
  }

  // 2. Lấy danh sách bài viết (phân trang)
  async getFeed(
    userId?: number,
    page: number = 1,
    pageSize: number = 10,
    query?: string,
  ) {
    const skip = (page - 1) * pageSize;

    const whereCondition =
      query && query.trim().length > 0
        ? {
            OR: [
              { content: { contains: query, mode: 'insensitive' as const } },
              {
                place: {
                  name: { contains: query, mode: 'insensitive' as const },
                },
              },
            ],
          }
        : {};

    const posts = await this.prisma.forumPost.findMany({
      skip,
      take: pageSize,
      where: whereCondition,
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            avatar: true,
          },
        },
        place: {
          include: {
            category: true,
            photos: true,
          },
        },
        media: true,
        likes: {
          where: {
            userId: userId ? BigInt(userId) : BigInt(-1),
          },
          select: {
            userId: true,
          },
        },
        saves: {
          where: {
            userId: userId ? BigInt(userId) : BigInt(-1),
          },
          select: {
            userId: true,
          },
        },
        _count: {
          select: {
            likes: true,
            comments: true,
            saves: true,
          },
        },
      },
    });

    // Bản đồ dữ liệu để kiểm tra xem người dùng hiện tại đã like/save chưa
    return posts.map((post) => {
      const isLiked = post.likes.length > 0;
      const isSaved = post.saves.length > 0;

      // Loại bỏ các trường array trung gian để giảm kích thước payload
      const { likes, saves, ...rest } = post;
      return {
        ...rest,
        isLiked,
        isSaved,
      };
    });
  }

  // 3. Lấy chi tiết bài viết và tăng lượt xem
  async getPostDetail(postId: number, userId?: number) {
    // Tăng lượt xem
    const updatedPost = await this.prisma.forumPost.update({
      where: { id: BigInt(postId) },
      data: {
        viewCount: {
          increment: 1,
        },
      },
    });

    // Phát tín hiệu cập nhật lượt xem qua socket
    this.forumGateway.broadcastPostViewUpdate(
      postId.toString(),
      updatedPost.viewCount,
    );

    const post = await this.prisma.forumPost.findUnique({
      where: { id: BigInt(postId) },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            avatar: true,
          },
        },
        place: {
          include: {
            category: true,
            photos: true,
          },
        },
        media: true,
        comments: {
          orderBy: {
            createdAt: 'asc',
          },
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                avatar: true,
              },
            },
          },
        },
        likes: {
          where: {
            userId: userId ? BigInt(userId) : BigInt(-1),
          },
        },
        saves: {
          where: {
            userId: userId ? BigInt(userId) : BigInt(-1),
          },
        },
        _count: {
          select: {
            likes: true,
            comments: true,
            saves: true,
          },
        },
      },
    });

    if (!post) {
      throw new NotFoundException(`Không tìm thấy bài viết ID ${postId}`);
    }

    const isLiked = post.likes.length > 0;
    const isSaved = post.saves.length > 0;

    const { likes, saves, ...rest } = post;
    return {
      ...rest,
      isLiked,
      isSaved,
    };
  }

  // 4. Thả tim / Bỏ thả tim bài viết
  async toggleLike(postId: number, userId: number) {
    const likeExists = await this.prisma.forumLike.findUnique({
      where: {
        postId_userId: {
          postId: BigInt(postId),
          userId: BigInt(userId),
        },
      },
    });

    let isLiked = false;

    if (likeExists) {
      // Bỏ thích
      await this.prisma.forumLike.delete({
        where: {
          postId_userId: {
            postId: BigInt(postId),
            userId: BigInt(userId),
          },
        },
      });
      isLiked = false;
    } else {
      // Thích
      await this.prisma.forumLike.create({
        data: {
          postId: BigInt(postId),
          userId: BigInt(userId),
        },
      });
      isLiked = true;
    }

    // Lấy lại tổng số like mới
    const likeCount = await this.prisma.forumLike.count({
      where: { postId: BigInt(postId) },
    });

    // Phát sóng trực tiếp trạng thái like cho các client qua socket
    this.forumGateway.broadcastPostLikeUpdate(
      postId.toString(),
      likeCount,
      isLiked,
      userId.toString(),
    );

    return { isLiked, likeCount };
  }

  // 5. Lưu bài viết / Bỏ lưu
  async toggleSave(postId: number, userId: number) {
    const saveExists = await this.prisma.forumSave.findUnique({
      where: {
        postId_userId: {
          postId: BigInt(postId),
          userId: BigInt(userId),
        },
      },
    });

    let isSaved = false;

    if (saveExists) {
      await this.prisma.forumSave.delete({
        where: {
          postId_userId: {
            postId: BigInt(postId),
            userId: BigInt(userId),
          },
        },
      });
      isSaved = false;
    } else {
      await this.prisma.forumSave.create({
        data: {
          postId: BigInt(postId),
          userId: BigInt(userId),
        },
      });
      isSaved = true;
    }

    return { isSaved };
  }

  // 6. Thêm bình luận mới
  async addComment(
    postId: number,
    userId: number,
    content: string,
    mediaUrl?: string,
    mediaType?: string,
  ) {
    if ((!content || content.trim() === '') && !mediaUrl) {
      throw new BadRequestException('Nội dung bình luận không được để trống');
    }

    const comment = await this.prisma.forumComment.create({
      data: {
        postId: BigInt(postId),
        userId: BigInt(userId),
        content,
        mediaUrl,
        mediaType,
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            avatar: true,
          },
        },
      },
    });

    // Đếm lại tổng bình luận mới
    const commentCount = await this.prisma.forumComment.count({
      where: { postId: BigInt(postId) },
    });

    // Phát sóng bình luận mới trực tiếp qua socket
    this.forumGateway.broadcastPostCommentAdded(
      postId.toString(),
      comment,
      commentCount,
    );

    return comment;
  }

  // 6.2 Xóa bình luận bài viết
  async deleteComment(commentId: number, userId: number) {
    const comment = await this.prisma.forumComment.findUnique({
      where: { id: BigInt(commentId) },
      include: { post: true },
    });

    if (!comment) {
      throw new NotFoundException(`Không tìm thấy bình luận ID ${commentId}`);
    }

    // Cho phép xóa nếu user là chủ bình luận HOẶC user là chủ bài đăng
    const isCommentOwner = Number(comment.userId) === userId;
    const isPostOwner = Number(comment.post.userId) === userId;

    if (!isCommentOwner && !isPostOwner) {
      throw new ForbiddenException('Bạn không có quyền xóa bình luận này');
    }

    await this.prisma.forumComment.delete({
      where: { id: BigInt(commentId) },
    });

    const postId = comment.postId;

    // Đếm lại tổng bình luận mới
    const commentCount = await this.prisma.forumComment.count({
      where: { postId },
    });

    // Phát sóng qua socket để các client khác xóa bình luận thời gian thực
    this.forumGateway.broadcastPostCommentDeleted(
      postId.toString(),
      commentId.toString(),
      commentCount,
    );

    return { success: true, commentCount };
  }

  // 6.3 Chỉnh sửa bình luận bài viết
  async updateComment(
    commentId: number,
    userId: number,
    content: string,
    clearMedia: boolean,
    mediaUrl?: string,
    mediaType?: string,
  ) {
    const comment = await this.prisma.forumComment.findUnique({
      where: { id: BigInt(commentId) },
    });

    if (!comment) {
      throw new NotFoundException(`Không tìm thấy bình luận ID ${commentId}`);
    }

    if (Number(comment.userId) !== userId) {
      throw new ForbiddenException(
        'Bạn không có quyền chỉnh sửa bình luận này',
      );
    }

    const finalContent = content !== undefined ? content : comment.content;
    const hasMedia = clearMedia ? false : mediaUrl || comment.mediaUrl;

    if ((!finalContent || finalContent.trim() === '') && !hasMedia) {
      throw new BadRequestException('Nội dung bình luận không được để trống');
    }

    const updateData: any = {};
    if (content !== undefined) {
      updateData.content = content;
    }

    if (clearMedia) {
      updateData.mediaUrl = null;
      updateData.mediaType = null;
    } else if (mediaUrl) {
      updateData.mediaUrl = mediaUrl;
      updateData.mediaType = mediaType;
    }

    const updatedComment = await this.prisma.forumComment.update({
      where: { id: BigInt(commentId) },
      data: updateData,
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            avatar: true,
          },
        },
      },
    });

    // Phát sóng qua socket để các client cập nhật bình luận thời gian thực
    this.forumGateway.broadcastPostCommentUpdated(
      comment.postId.toString(),
      updatedComment,
    );

    return updatedComment;
  }

  // 7. Lấy danh sách bài viết đã lưu của người dùng
  async getSavedPosts(userId: number, page: number = 1, pageSize: number = 10) {
    const skip = (page - 1) * pageSize;

    const posts = await this.prisma.forumPost.findMany({
      skip,
      take: pageSize,
      where: {
        saves: {
          some: {
            userId: BigInt(userId),
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            avatar: true,
          },
        },
        place: {
          include: {
            category: true,
            photos: true,
          },
        },
        media: true,
        likes: {
          where: {
            userId: BigInt(userId),
          },
          select: {
            userId: true,
          },
        },
        saves: {
          where: {
            userId: BigInt(userId),
          },
          select: {
            userId: true,
          },
        },
        _count: {
          select: {
            likes: true,
            comments: true,
            saves: true,
          },
        },
      },
    });

    return posts.map((post) => {
      const isLiked = post.likes.length > 0;
      const isSaved = post.saves.length > 0;

      const { likes, saves, ...rest } = post;
      return {
        ...rest,
        isLiked,
        isSaved,
      };
    });
  }

  // 8. Chỉnh sửa bài viết
  async updatePost(
    postId: number,
    userId: number,
    content: string,
    placeId?: number,
    newMedia?: { url: string; mediaType: string }[],
    clearMedia?: boolean,
  ) {
    const post = await this.prisma.forumPost.findUnique({
      where: { id: BigInt(postId) },
    });

    if (!post) {
      throw new Error('Bài viết không tồn tại');
    }

    if (post.userId !== BigInt(userId)) {
      throw new Error('Bạn không có quyền chỉnh sửa bài viết này');
    }

    // Xóa tệp cũ nếu người dùng chọn xóa hoặc đăng tệp mới thay thế
    if (clearMedia || (newMedia && newMedia.length > 0)) {
      await this.prisma.forumMedia.deleteMany({
        where: { postId: BigInt(postId) },
      });
    }

    const updated = await this.prisma.forumPost.update({
      where: { id: BigInt(postId) },
      data: {
        content,
        placeId:
          placeId !== undefined
            ? placeId
              ? BigInt(placeId)
              : null
            : undefined,
        editedAt: new Date(),
        media:
          newMedia && newMedia.length > 0
            ? {
                create: newMedia.map((m, index) => ({
                  url: m.url,
                  mediaType: m.mediaType,
                  sortOrder: index,
                })),
              }
            : undefined,
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            avatar: true,
          },
        },
        place: {
          include: {
            category: true,
            photos: true,
          },
        },
        media: true,
        _count: {
          select: {
            likes: true,
            comments: true,
            saves: true,
          },
        },
      },
    });

    const isLiked =
      (await this.prisma.forumLike.count({
        where: { postId: BigInt(postId), userId: BigInt(userId) },
      })) > 0;

    const isSaved =
      (await this.prisma.forumSave.count({
        where: { postId: BigInt(postId), userId: BigInt(userId) },
      })) > 0;

    const finalPost = {
      ...updated,
      isLiked,
      isSaved,
    };

    // Phát sóng tin nhắn cập nhật qua socket
    this.forumGateway.broadcastPostUpdate(finalPost);

    return finalPost;
  }

  // 9. Xóa bài viết
  async deletePost(postId: number, userId: number) {
    const post = await this.prisma.forumPost.findUnique({
      where: { id: BigInt(postId) },
    });

    if (!post) {
      throw new Error('Bài viết không tồn tại');
    }

    if (post.userId !== BigInt(userId)) {
      throw new Error('Bạn không có quyền xóa bài viết này');
    }

    await this.prisma.forumPost.delete({
      where: { id: BigInt(postId) },
    });

    // Phát sóng tin nhắn xóa qua socket
    this.forumGateway.broadcastPostDeleted(postId.toString());

    return { success: true };
  }
}
