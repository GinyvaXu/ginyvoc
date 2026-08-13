// signaling.js — Socket.IO 信令层
// 职责: 房间/成员/共享状态管理 + 转发 WebRTC 信令（SDP/ICE），媒体面走 P2P 不经过服务器
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
      const me = res.room.users.get(socket.id);
      // 通知房内已有成员：新成员加入（正在共享的人会向他发起 sendonly offer）
      socket.to(res.room.id).emit('member:joined', { user: { id: socket.id, username: me.username, share: false } });
      io.to(res.room.id).emit('room:state', rooms.serialize(res.room));
      logger.work(`room:join ${res.room.id} user=${username} by ${socket.id} (共 ${res.room.users.size} 人)`);
      ack?.({ roomId: res.room.id, roomState: rooms.serialize(res.room) });
    });

    socket.on('room:leave', (_payload, ack) => {
      leaveRoom(socket);
      ack?.({ ok: true });
    });

    // 共享状态切换：广播给房内其他成员（自己从 room:state 同步）
    socket.on('share:update', ({ share }, ack) => {
      const room = rooms.rooms.get(socket.data.roomId);
      if (room) {
        const user = rooms.setShare(room, socket.id, share);
        socket.to(room.id).emit('share:update', { id: socket.id, share: user.share });
        io.to(room.id).emit('room:state', rooms.serialize(room));
        logger.debug(`share:update room=${room.id} user=${user?.username} share=${user?.share}`);
      }
      ack?.({ ok: true });
    });

    // 转发 WebRTC 信令（offer / answer / ice）
    socket.on('signal', ({ to, data }) => {
      logger.debug(`signal relay ${socket.id} -> ${to} (${data?.sdp?.type || 'ice'})`);
      io.to(to).emit('signal', { from: socket.id, data });
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
      socket.to(roomId).emit('member:left', { id: socket.id });
      io.to(roomId).emit('room:state', rooms.serialize(left.room));
    }
    delete socket.data.roomId;
  }
}