// rooms.js — 房间 / 成员 / 共享 / 语音状态管理（内存态，mesh 信令）
// GinyScreen：一个服务器 = 一个房间（默认 id "main"），好友直接连服务器地址即可
// v1.4.0 起每人有 share（屏幕共享）与 voice（麦克风）两个状态
const MAX_USERS_PER_ROOM = 8;

export class RoomManager {
  constructor() {
    this.rooms = new Map(); // roomId -> room（固定只有一个 "main"）
    this.room = null;
  }

  getDefaultRoom() {
    if (!this.room) {
      this.room = { id: 'main', createdAt: Date.now(), users: new Map() };
      this.rooms.set(this.room.id, this.room);
    }
    return this.room;
  }

  joinRoom(socketId, username) {
    const room = this.getDefaultRoom();
    if (room.users.has(socketId)) return { error: '已在该房间中' };
    if (room.users.size >= MAX_USERS_PER_ROOM) return { error: `房间已满（最多 ${MAX_USERS_PER_ROOM} 人）` };
    const user = { id: socketId, username: String(username || '观众').slice(0, 16), share: false, voice: false };
    room.users.set(socketId, user);
    return { room, user };
  }

  setShare(room, socketId, share) {
    const user = room.users.get(socketId);
    if (user) user.share = !!share;
    return user;
  }

  setVoice(room, socketId, voice) {
    const user = room.users.get(socketId);
    if (user) user.voice = !!voice;
    return user;
  }

  leaveRoom(socketId) {
    const room = this.getDefaultRoom();
    if (room.users.delete(socketId)) return { room, roomId: room.id };
    return null;
  }

  serialize(room) {
    return { id: room.id, users: [...room.users.values()].map((u) => ({ ...u })) };
  }
}
