// rooms.js — 房间 / 语音频道状态管理（内存态，单机版）
// 设计参考: Mumble 的 channel 树 + Discord 的 server/channel 模型
// 后续如需扩容可在此处替换为 Redis + mediasoup SFU 房间

const MAX_USERS_PER_ROOM = 16;
const ROOM_ID_LENGTH = 5;

const DEFAULT_CHANNELS = [
  { id: 'ch-main',   name: '🏠 大厅', type: 'voice' },
  { id: 'ch-开黑',   name: '🎮 开黑', type: 'voice' },
  { id: 'ch-观战',   name: '👀 观战', type: 'voice' },
];

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
    const room = {
      id,
      createdAt: Date.now(),
      users: new Map(), // socketId -> user
      channels: DEFAULT_CHANNELS.map((c) => ({ ...c })),
    };
    this.rooms.set(id, room);
    return room;
  }

  joinRoom(roomId, socketId, username) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: '房间不存在，请检查房间号' };
    if (room.users.has(socketId)) return { error: '已在该房间中' };
    if (room.users.size >= MAX_USERS_PER_ROOM) return { error: `房间已满（最多 ${MAX_USERS_PER_ROOM} 人）` };
    const user = {
      id: socketId,
      username: String(username || '玩家').slice(0, 16),
      channelId: null,
      mic: true,
      deaf: false,
      screen: false,
    };
    room.users.set(socketId, user);
    return { room, user };
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

  joinChannel(room, socketId, channelId) {
    const user = room.users.get(socketId);
    if (!user) return { error: '未加入房间' };
    if (!room.channels.some((c) => c.id === channelId)) return { error: '频道不存在' };
    user.channelId = channelId;
    return { user };
  }

  leaveChannel(room, socketId) {
    const user = room.users.get(socketId);
    if (user) user.channelId = null;
    return user;
  }

  // 同频道内除 excludeId 之外的所有用户（用于 mesh 组网）
  peersInChannel(room, channelId, excludeId) {
    return [...room.users.values()]
      .filter((u) => u.channelId === channelId && u.id !== excludeId)
      .map((u) => ({ id: u.id, username: u.username }));
  }

  // 供客户端渲染的完整房间状态
  serialize(room) {
    return {
      id: room.id,
      channels: room.channels.map((c) => ({
        ...c,
        members: [...room.users.values()].filter((u) => u.channelId === c.id).map((u) => u.id),
      })),
      users: [...room.users.values()].map((u) => ({ ...u })),
    };
  }
}
