// smoke-test.mjs — GinyScreen 端到端信令冒烟测试（全局超时 15s）
// 覆盖：单服务器单房间（无房间号）、成员通知、共享状态同步、WebRTC 信令转发、离开清理
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
assert('A 创建房间(默认房间)', !!created.roomId && created.roomId === 'main', created.roomId);
assert('A 获得房间状态(1人)', created.roomState?.users?.length === 1);
const roomId = created.roomId;

const memberJoinedA = new Promise((resolve) => A.once('member:joined', resolve));
const joined = await emitAck(B, 'room:join', { username: 'Bob' });
assert('B 加入房间(无房间号)', !joined.error && joined.roomId === roomId, joined.roomId);
assert('B 收到房间状态(2人)', joined.roomState.users.length === 2);
const mj = await memberJoinedA;
assert('A 收到 member:joined(B)', mj.user?.username === 'Bob' && mj.user?.share === false);

const shareUpdateB = new Promise((resolve) => B.once('share:update', resolve));
const stateAfterShare = new Promise((resolve) => B.once('room:state', resolve));
await emitAck(A, 'share:update', { share: true });
const su = await shareUpdateB;
assert('B 收到 share:update(共享中)', su.id === A.id && su.share === true);
const st = await stateAfterShare;
const alice = st.users.find((u) => u.username === 'Alice');
assert('room:state 同步共享标志', alice?.share === true);

const signalB = new Promise((resolve) => B.once('signal', resolve));
A.emit('signal', { to: B.id, data: { type: 'offer', sdp: 'FAKE_OFFER' } });
const got = await signalB;
assert('信令转发 A→B(offer)', got.from === A.id && got.data.type === 'offer');

const signalA = new Promise((resolve) => A.once('signal', resolve));
B.emit('signal', { to: A.id, data: { type: 'answer', sdp: 'FAKE_ANSWER' } });
const got2 = await signalA;
assert('信令转发 B→A(answer)', got2.from === B.id && got2.data.type === 'answer');

const iceA = new Promise((resolve) => A.once('signal', resolve));
B.emit('signal', { to: A.id, data: { type: 'ice', candidate: { candidate: 'candidate:1' } } });
const got3 = await iceA;
assert('信令转发 B→A(ice)', got3.from === B.id && got3.data.type === 'ice');

// 语音状态同步
const voiceUpdateB = new Promise((resolve) => B.once('voice:update', resolve));
const stateAfterVoice = new Promise((resolve) => B.once('room:state', resolve));
await emitAck(A, 'voice:update', { voice: true });
const vu = await voiceUpdateB;
assert('B 收到 voice:update(开麦)', vu.id === A.id && vu.voice === true);
const stV = await stateAfterVoice;
const aliceV = stV.users.find((u) => u.username === 'Alice');
assert('room:state 同步语音标志', aliceV?.voice === true);
const signalVoiceB = new Promise((resolve) => B.once('signal', resolve));
A.emit('signal', { to: B.id, data: { type: 'offer', channel: 'voice', sdp: 'FAKE_VOICE_OFFER' } });
const gv = await signalVoiceB;
assert('信令转发 A→B(voice offer)', gv.from === A.id && gv.data.channel === 'voice' && gv.data.type === 'offer');

const memberLeftA = new Promise((resolve) => A.once('member:left', resolve));
await emitAck(B, 'room:leave');
const ml = await memberLeftA;
assert('A 收到 member:left(B)', ml.id === B.id);

A.emit('room:leave');
await new Promise((r) => setTimeout(r, 300));

const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);