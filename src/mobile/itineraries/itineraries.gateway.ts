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
  namespace: 'itinerary',
})
export class ItinerariesGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger = new Logger('ItinerariesGateway');

  // Lưu thông tin người dùng active trong từng chuyến đi: Map<itineraryId, Map<socketId, {userId, fullName, avatarUrl}>>
  private activeMembers = new Map<string, Map<string, any>>();

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    // Xóa user khỏi các room active khi disconnect
    this.activeMembers.forEach((usersMap, itineraryId) => {
      if (usersMap.has(client.id)) {
        usersMap.delete(client.id);
        this.broadcastActiveMembers(itineraryId);
      }
    });
  }

  @SubscribeMessage('join_itinerary')
  handleJoinItinerary(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { itineraryId: string; user?: any },
  ) {
    const itineraryId = data.itineraryId.toString();
    const roomName = `itinerary_${itineraryId}`;
    client.join(roomName);
    this.logger.log(`Client ${client.id} joined room ${roomName}`);

    if (data.user && data.user.id) {
      if (!this.activeMembers.has(itineraryId)) {
        this.activeMembers.set(itineraryId, new Map());
      }
      this.activeMembers.get(itineraryId)!.set(client.id, {
        userId: data.user.id.toString(),
        fullName: data.user.fullName || data.user.name || 'Thành viên',
        avatarUrl: data.user.avatarUrl || data.user.avatar || null,
        joinedAt: new Date().toISOString(),
      });
      this.broadcastActiveMembers(itineraryId);
    }

    return { status: 'joined', room: roomName };
  }

  @SubscribeMessage('leave_itinerary')
  handleLeaveItinerary(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { itineraryId: string },
  ) {
    const itineraryId = data.itineraryId.toString();
    const roomName = `itinerary_${itineraryId}`;
    client.leave(roomName);
    this.logger.log(`Client ${client.id} left room ${roomName}`);

    if (this.activeMembers.has(itineraryId)) {
      this.activeMembers.get(itineraryId)!.delete(client.id);
      this.broadcastActiveMembers(itineraryId);
    }

    return { status: 'left', room: roomName };
  }

  private broadcastActiveMembers(itineraryId: string) {
    const roomName = `itinerary_${itineraryId}`;
    const usersMap = this.activeMembers.get(itineraryId);
    const membersList = usersMap ? Array.from(usersMap.values()) : [];
    this.server.to(roomName).emit('active_members_updated', {
      itineraryId,
      activeMembers: membersList,
    });
  }

  @SubscribeMessage('typing_note')
  handleTypingNote(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { itineraryId: string; noteId: number; text: string; isItineraryDetail: boolean; userId?: string },
  ) {
    const roomName = `itinerary_${data.itineraryId}`;
    client.to(roomName).emit('note_typing_updated', {
      itineraryId: data.itineraryId,
      noteId: data.noteId,
      text: data.text,
      isItineraryDetail: data.isItineraryDetail,
      updatedByUserId: data.userId,
    });
  }

  // Chỉ phát tin nhắn duy nhất 1 lần tới đúng phòng (Room) của chuyến đi
  broadcastItineraryUpdate(itineraryId: number | string, updatedByUserId?: string, actionType?: string) {
    const roomName = `itinerary_${itineraryId}`;
    this.logger.log(`Broadcasting itinerary update for room ${roomName}, action: ${actionType}`);
    const payload = {
      itineraryId: itineraryId.toString(),
      updatedByUserId,
      actionType: actionType || 'UPDATE',
      timestamp: new Date().toISOString(),
    };

    this.server.to(roomName).emit('itinerary_updated', payload);
  }
}
