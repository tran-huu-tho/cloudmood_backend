import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: 'forum',
})
export class ForumGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger = new Logger('ForumGateway');

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join_post')
  handleJoinPost(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { postId: string },
  ) {
    const roomName = `post_${data.postId}`;
    client.join(roomName);
    this.logger.log(`Client ${client.id} joined room ${roomName}`);
    return { status: 'joined', room: roomName };
  }

  @SubscribeMessage('leave_post')
  handleLeavePost(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { postId: string },
  ) {
    const roomName = `post_${data.postId}`;
    client.leave(roomName);
    this.logger.log(`Client ${client.id} left room ${roomName}`);
    return { status: 'left', room: roomName };
  }

  // Phát sóng lượt thích mới
  broadcastPostLikeUpdate(postId: string, likeCount: number, isLiked: boolean, userId: string) {
    this.server.to(`post_${postId}`).emit('like_update', {
      postId,
      likeCount,
      isLiked,
      userId,
    });
    // Phát cập nhật cho cả bảng tin chính (feed)
    this.server.emit('feed_like_update', { postId, likeCount });
  }

  // Phát sóng bình luận mới
  broadcastPostCommentAdded(postId: string, comment: any, commentCount: number) {
    this.server.to(`post_${postId}`).emit('new_comment', {
      postId,
      comment,
      commentCount,
    });
    // Phát cập nhật cho cả bảng tin chính (feed)
    this.server.emit('feed_comment_update', { postId, commentCount });
  }

  // Phát sóng xóa bình luận
  broadcastPostCommentDeleted(postId: string, commentId: string, commentCount: number) {
    this.server.to(`post_${postId}`).emit('comment_deleted', {
      postId,
      commentId,
      commentCount,
    });
    // Phát cập nhật cho cả bảng tin chính (feed)
    this.server.emit('feed_comment_update', { postId, commentCount });
  }

  // Phát sóng cập nhật bình luận
  broadcastPostCommentUpdated(postId: string, comment: any) {
    this.server.to(`post_${postId}`).emit('comment_updated', {
      postId,
      comment,
    });
  }

  // Phát sóng cập nhật lượt xem
  broadcastPostViewUpdate(postId: string, viewCount: number) {
    this.server.to(`post_${postId}`).emit('view_update', {
      postId,
      viewCount,
    });
    this.server.emit('feed_view_update', { postId, viewCount });
  }

  // Phát sóng có bài đăng mới
  broadcastNewPostAdded(post: any) {
    this.server.emit('new_post', post);
  }

  // Phát sóng cập nhật bài đăng
  broadcastPostUpdate(post: any) {
    const postId = post.id.toString();
    this.server.to(`post_${postId}`).emit('post_update', post);
    this.server.emit('feed_post_update', post);
  }

  // Phát sóng bài đăng bị xóa
  broadcastPostDeleted(postId: string) {
    this.server.to(`post_${postId}`).emit('post_deleted', { postId });
    this.server.emit('feed_post_deleted', { postId });
  }
}
