// signaling.js — Socket.IO 客户端封装（房间/成员/共享状态 + WebRTC 信令转发）
export function connectSignaling({ onState, onSignal, onMemberJoined, onMemberLeft, onShareUpdate, onError }) {
  const socket = io({ transports: ['websocket', 'polling'] });

  socket.on('room:state', (s) => onState?.(s));
  socket.on('signal', (p) => onSignal?.(p));
  socket.on('member:joined', (p) => onMemberJoined?.(p));
  socket.on('member:left', (p) => onMemberLeft?.(p));
  socket.on('share:update', (p) => onShareUpdate?.(p));
  socket.on('connect_error', () => onError?.('无法连接服务器，请检查网络或服务器设置'));
  socket.on('disconnect', (reason) => {
    if (reason === 'io server disconnect' || reason === 'transport close') onError?.('与服务器断开连接');
  });

  function emitAck(event, payload) {
    return new Promise((resolve) => {
      socket.emit(event, payload, (res) => resolve(res || { ok: true }));
    });
  }

  return {
    id: () => socket.id,
    createRoom: (username) => emitAck('room:create', { username }),
    joinRoom: (username) => emitAck('room:join', { username }),
    leaveRoom: () => emitAck('room:leave', {}),
    setShare: (share) => emitAck('share:update', { share }),
    signal: (to, data) => socket.emit('signal', { to, data }),
    reportError: (payload) => socket.emit('client:error', payload),
  };
}