// signaling.js — Socket.IO 信令层
// 职责: 房间/频道管理 + 转发 WebRTC 信令（SDP/ICE），媒体面走 P2P 不经过服务器

import { logger } from './logger.js';

export function setupSignaling(io, rooms) {
  io.on('connection', (socket) => {
    const ip = socket.handshake.address;
    logger.work(`client connected ${socket.id} from ${ip} (${io.engine.clientsCount} 在线)`);
    socket.on('client:error', ({ message, stack, url } = {}) => {
      logger.error(`[client:${socket.id}] JS错误: ${message}`, stack ? `\n${stack}` : '', url ? `url=${url}` : '');
    });
    socket.on('room:create', ({ username }, ack) => {
      const room = rooms.createRoom();
      const res = rooms.joinRoom(room.id, socket.id, username);
      if (res.error) return ack?.({ error: res.error });
      socket.join(room.id);
      socket.data.roomId = room.id;
      logger.work(`room:create ${room.id} user=${username} by ${socket.id}`);
      ack?.({ roomId: room.id, roomState: rooms.serialize(room) });
    });

    socket.on('room:join', ({ roomId, username }, ack) => {
      const res = rooms.joinRoom(String(roomId || '').trim().toUpperCase(), socket.id, username);
      if (res.error) return ack?.({ error: res.error });
      socket.join(res.room.id);
      socket.data.roomId = res.room.id;
      io.to(res.room.id).emit('room:state', rooms.serialize(res.room));
      logger.work(`room:join ${res.room.id} user=${username} by ${socket.id} (共 ${res.room.users.size} 人)`);
      ack?.({ roomId: res.room.id, roomState: rooms.serialize(res.room) });
    });

    socket.on('room:leave', (_payload, ack) => {
      leaveRoom(socket);
      ack?.({ ok: true });
    });

    // 加入语音频道: 返回同频道已有成员，让新成员逐个发起 P2P offer
    socket.on('channel:join', ({ channelId }, ack) => {
      const room = rooms.rooms.get(socket.data.roomId);
      if (!room) return ack?.({ error: '未加入房间' });
      const res = rooms.joinChannel(room, socket.id, channelId);
      if (res.error) return ack?.({ error: res.error });

      const peers = rooms.peersInChannel(room, channelId, socket.id);
      const me = room.users.get(socket.id);
      logger.work(`channel:join room=${room.id} channel=${channelId} user=${me?.username} peers=${peers.length}`);
      // 通知频道内已有成员: 新成员加入了
      for (const p of peers) {
        io.to(p.id).emit('user:joined', { user: { id: socket.id, username: me.username } });
      }
      broadcastRoom(io, room, rooms);
      ack?.({ channelId, peers });
    });

    socket.on('channel:leave', (_payload, ack) => {
      const room = rooms.rooms.get(socket.data.roomId);
      if (room) {
        const u = rooms.leaveChannel(room, socket.id);
        logger.work(`channel:leave room=${room.id} user=${u?.username}`);
        broadcastRoom(io, room, rooms);
      }
      ack?.({ ok: true });
    });

    // 转发 WebRTC 信令（offer / answer / ice / rollback）
    socket.on('signal', ({ to, data }) => {
      const from = socket.id;
      logger.debug(`signal relay ${from} -> ${to} (${data?.sdp?.type || 'ice'})`);
      io.to(to).emit('signal', { from, data });
    });

    // 媒体状态同步（麦克风/闭麦/共享屏幕）
    socket.on('media:update', ({ mic, deaf, screen }, ack) => {
      const room = rooms.rooms.get(socket.data.roomId);
      if (room) {
        const user = room.users.get(socket.id);
        if (user) {
          if (typeof mic === 'boolean') user.mic = mic;
          if (typeof deaf === 'boolean') user.deaf = deaf;
          if (typeof screen === 'boolean') user.screen = screen;
          logger.debug(`media:update room=${room.id} user=${user.username} mic=${user.mic} deaf=${user.deaf} screen=${user.screen}`);
          broadcastRoom(io, room, rooms);
        }
      }
      ack?.({ ok: true });
    });

    // 房间内文字聊天
    socket.on('chat:send', ({ text }, ack) => {
      const room = rooms.rooms.get(socket.data.roomId);
      if (room && typeof text === 'string' && text.trim()) {
        const user = room.users.get(socket.id);
        logger.debug(`chat room=${room.id} from=${user?.username}: ${text.trim().slice(0, 80)}`);
        io.to(room.id).emit('chat:message', {
          id: `${socket.id}-${Date.now()}`,
          from: user?.username || '未知',
          fromId: socket.id,
          text: text.trim().slice(0, 500),
          ts: Date.now(),
        });
        ack?.({ ok: true });
      }
    });

    socket.on('disconnect', () => {
      logger.work(`client disconnected ${socket.id} (${io.engine.clientsCount} 在线)`);
      leaveRoom(socket);
    });
  });

  function leaveRoom(socket) {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const left = rooms.leaveRoom(socket.id);
    if (left) {
      socket.leave(roomId);
      io.to(roomId).emit('room:state', rooms.serialize(left.room));
    }
    delete socket.data.roomId;
  }
}

function broadcastRoom(io, room, rooms) {
  io.to(room.id).emit('room:state', rooms.serialize(room));
}



