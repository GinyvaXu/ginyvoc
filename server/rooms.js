// rooms.js — 房间 / 成员 / 共享状态管理（内存态，mesh 信令）
// GinyScreen：专注屏幕共享，无语音频道/聊天；每人一个 share 标志，谁都能共享
const MAX_USERS_PER_ROOM = 8;
const ROOM_ID_LENGTH = 5;

function randomRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去掉易混淆字符
  let id = '';
  for (let i = 0; i < ROOM_ID_LENGTH; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

export class RoomManager {
  constructor() {
    this.rooms = new Map(); // roomId -> room
  }

  createRoom() {
    let id;
    do { id = randomRoomId(); } while (this.rooms.has(id));
    const room = { id, createdAt: Date.now(), users: new Map() };
    this.rooms.set(id, room);
    return room;
  }

  joinRoom(roomId, socketId, username) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: '房间不存在，请检查房间号' };
    if (room.users.has(socketId)) return { error: '已在该房间中' };
    if (room.users.size >= MAX_USERS_PER_ROOM) return { error: `房间已满（最多 ${MAX_USERS_PER_ROOM} 人）` };
    const user = { id: socketId, username: String(username || '观众').slice(0, 16), share: false };
    room.users.set(socketId, user);
    return { room, user };
  }

  setShare(room, socketId, share) {
    const user = room.users.get(socketId);
    if (user) user.share = !!share;
    return user;
  }

  leaveRoom(socketId) {
    for (const [roomId, room] of this.rooms) {
      if (room.users.delete(socketId)) {
        if (room.users.size === 0) this.rooms.delete(roomId);
        return { room, roomId };
      }
    }
    return null;
  }

  serialize(room) {
    return { id: room.id, users: [...room.users.values()].map((u) => ({ ...u })) };
  }
}