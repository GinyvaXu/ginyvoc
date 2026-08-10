// signaling.js — Socket.IO 客户端封装 + 事件分发
import { io } from '/vendor/socket.io/socket.io.esm.min.js';

export function createSignaling(handlers) {
  const socket = io({ transports: ['websocket', 'polling'] });
  socket.on('connect', () => console.log('[ginyvoc] socket connected', socket.id));
  socket.on('connect_error', (e) => console.log('[ginyvoc] socket connect_error', e.message));

  socket.on('room:state', (state) => handlers.onRoomState?.(state));
  socket.on('user:joined', (payload) => handlers.onUserJoined?.(payload));
  socket.on('signal', (payload) => handlers.onSignal?.(payload));
  socket.on('chat:message', (msg) => handlers.onChat?.(msg));
  socket.on('connect_error', (err) => handlers.onError?.(`连接服务器失败: ${err.message}`));
  socket.on('disconnect', () => handlers.onDisconnect?.());

  function emitAck(event, payload = {}) {
    return new Promise((resolve) => {
      socket.emit(event, payload, (res) => resolve(res ?? { ok: true }));
    });
  }

  return {
    createRoom: (username) => emitAck('room:create', { username }),
    joinRoom: (roomId, username) => emitAck('room:join', { roomId, username }),
    leaveRoom: () => emitAck('room:leave'),
    joinChannel: (channelId) => emitAck('channel:join', { channelId }),
    leaveChannel: () => emitAck('channel:leave'),
    sendSignal: (to, data) => socket.emit('signal', { to, data }),
    updateMedia: (patch) => emitAck('media:update', patch),
    sendChat: (text) => emitAck('chat:send', { text }),
    reportError: (info) => socket.emit('client:error', info),
    id: () => socket.id,
  };
}

