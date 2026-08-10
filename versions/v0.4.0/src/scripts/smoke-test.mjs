// smoke-test.mjs — 端到端信令冒烟测试（全局超时 15s）
import { io } from 'socket.io-client';

const URL = process.env.TEST_URL || 'http://localhost:3000';
const results = [];
const assert = (name, cond, extra = '') => {
  results.push([name, cond, extra]);
  console.log(`${cond ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`);
};
setTimeout(() => {
  console.log('\n⏰ 全局超时');
  process.exit(2);
}, 15000);

function connect(name) {
  return new Promise((resolve, reject) => {
    const s = io(URL, { transports: ['websocket'] });
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
    s._name = name;
  });
}
const emitAck = (socket, event, payload = {}) =>
  new Promise((resolve) => socket.emit(event, payload, (res) => resolve(res)));

const A = await connect('A');
const B = await connect('B');
console.log('已连接两个测试客户端');

const created = await emitAck(A, 'room:create', { username: 'Alice' });
assert('A 创建房间', !!created.roomId, created.roomId);
assert('A 获得房间状态(3频道)', created.roomState?.channels?.length === 3);
const roomId = created.roomId;

const joined = await emitAck(B, 'room:join', { roomId, username: 'Bob' });
assert('B 加入房间', !joined.error && joined.roomId === roomId);
assert('B 收到房间状态(2人)', joined.roomState.users.length === 2);

const chA = await emitAck(A, 'channel:join', { channelId: 'ch-main' });
assert('A 加入 ch-main', chA.channelId === 'ch-main' && chA.peers.length === 0);

const userJoinedA = new Promise((resolve) => A.once('user:joined', resolve));
const chB = await emitAck(B, 'channel:join', { channelId: 'ch-main' });
assert('B 加入返回 peers=[A]', chB.peers.length === 1 && chB.peers[0].username === 'Alice', JSON.stringify(chB.peers));
const uj = await userJoinedA;
assert('A 收到 user:joined(B)', uj.user?.username === 'Bob');

const signalB = new Promise((resolve) => B.once('signal', resolve));
A.emit('signal', { to: B.id, data: { sdp: { type: 'offer', sdp: 'FAKE' } } });
const got = await signalB;
assert('信令转发 A→B', got.from === A.id && got.data.sdp?.type === 'offer');

const signalA = new Promise((resolve) => A.once('signal', resolve));
B.emit('signal', { to: A.id, data: { sdp: { type: 'answer', sdp: 'FAKE' } } });
const got2 = await signalA;
assert('信令转发 B→A', got2.from === B.id && got2.data.sdp?.type === 'answer');

const roomState2 = await new Promise((resolve) => {
  B.once('room:state', resolve);
  A.emit('media:update', { mic: false, screen: true });
});
const alice = roomState2.users.find((u) => u.username === 'Alice');
assert('media:update 同步', alice?.mic === false && alice?.screen === true);

const chat = new Promise((resolve) => B.once('chat:message', resolve));
A.emit('chat:send', { text: '测试消息' });
const msg = await chat;
assert('聊天广播', msg.text === '测试消息' && msg.from === 'Alice');

const afterLeave = new Promise((resolve) => A.once('room:state', resolve));
B.emit('channel:leave');
const st = await afterLeave;
const bob = st.users.find((u) => u.username === 'Bob');
assert('B 离开频道', bob?.channelId === null);

A.emit('room:leave');
B.emit('room:leave');
await new Promise((r) => setTimeout(r, 300));

const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);
