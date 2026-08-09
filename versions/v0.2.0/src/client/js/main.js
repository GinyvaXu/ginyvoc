// main.js — 应用主控制器
import { createSignaling } from './signaling.js';
import { AudioEngine } from './audio.js';
import { PeerMesh } from './webrtc.js';
import { ui } from './ui.js';

// ---------- 全局状态 ----------
const state = {
  meId: null,
  roomId: null,
  roomState: null,
  channelId: null,
  mic: true,
  deaf: false,
  mode: 'vad',          // vad | ptt | always
  pttKey: 'Space',
  screen: false,
};

const settings = {
  deviceId: 'default',
  noiseSuppression: true,
  vad: 0.02,
  pttKey: 'Space',
};

let config = null;
let signal = null;
let audio = null;
let mesh = null;
let peerAudio = new Map();  // peerId -> <audio> 播放元素
let pttDown = false;
let vadSpeaking = false;
let pttCapturing = false;
let micReady = false;

// ---------- 启动 ----------
window.__kaiheiBoot = false;
window.addEventListener('error', (e) => {
  const el = ui.$('#lobby-error');
  el.textContent = `JS错误: ${e.message}`;
  el.hidden = false;
  signal?.reportError({ message: e.message, stack: e.error?.stack, url: location.href });
});

window.addEventListener('unhandledrejection', (e) => {
  signal?.reportError({
    message: String(e.reason || 'Unknown rejection'),
    stack: e.reason?.stack,
    url: location.href,
  });
});

async function boot() {
  const res = await fetch('/api/config');
  config = await res.json();
  console.log('[kaihei] config ok');

  console.log('[kaihei] creating signaling');
  signal = createSignaling({
    onRoomState: onRoomState,
    onUserJoined: ({ user }) => { if (state.channelId && mesh) mesh.addPeer(user); },
    onSignal: (payload) => mesh?.handleSignal(payload.from, payload.data),
    onChat: (msg) => ui.addChat(msg),
    onError: (msg) => ui.toast(msg),
    onDisconnect: () => setConnStatus(false),
  });

  wireLobby();
  wireControls();
  wireSettings();
  wireChat();
  wirePtt();
  window.__kaiheiBoot = true;
  console.log('[kaihei] boot done');
}

// ---------- 房间进入 ----------
function wireLobby() {
  const nameInput = ui.$('#input-username');
  nameInput.value = localStorage.getItem('kaihei:username') || '';
  const saveName = () => localStorage.setItem('kaihei:username', nameInput.value.trim());

  ui.$('#btn-create').addEventListener('click', async () => {
    saveName();
    const res = await signal.createRoom(getUsername());
    handleRoomResponse(res);
  });

  ui.$('#btn-join').addEventListener('click', async () => {
    saveName();
    const roomId = ui.$('#input-room').value.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,6}$/.test(roomId)) {
      showLobbyError('房间号格式不正确（5 位字母数字）');
      return;
    }
    const res = await signal.joinRoom(roomId, getUsername());
    handleRoomResponse(res);
  });

  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') ui.$('#btn-create').click();
  });
  ui.$('#input-room').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') ui.$('#btn-join').click();
  });

  ui.$('#btn-leave').addEventListener('click', async () => {
    await leaveChannel();
    await signal.leaveRoom();
    resetApp();
  });

  ui.$('#btn-copy-link').addEventListener('click', async () => {
    const url = `${location.origin}/?room=${state.roomId}`;
    try {
      await navigator.clipboard.writeText(url);
      ui.toast('邀请链接已复制');
    } catch {
      ui.toast(`邀请链接: ${url}`);
    }
  });
}

function getUsername() {
  return ui.$('#input-username').value.trim() || `玩家${Math.floor(Math.random() * 1000)}`;
}

function showLobbyError(msg) {
  const el = ui.$('#lobby-error');
  el.textContent = msg;
  el.hidden = false;
}

function handleRoomResponse(res) {
  if (res?.error) { showLobbyError(res.error); return; }
  state.roomId = res.roomId;
  state.meId = signal.id();
  ui.meId = state.meId;
  ui.$('#lobby-error').hidden = true;
  ui.screen('app');
  setConnStatus(true);
  onRoomState(res.roomState);
  ui.toast(`已进入房间 ${res.roomId}，点击左侧频道加入语音`);
}

function resetApp() {
  state.roomId = null;
  state.channelId = null;
  state.screen = false;
  state.mic = true;
  state.deaf = false;
  micReady = false;
  mesh?.closeAll();
  mesh = null;
  audio?.stopVAD();
  peerAudio.forEach((el) => el.remove());
  peerAudio.clear();
  ui._screenTiles.forEach((_, id) => ui.removeScreenTile(id));
  ui.$('#chat-messages').innerHTML = '';
  ui.screen('lobby');
}

function setConnStatus(ok) {
  const el = ui.$('#conn-status');
  el.textContent = ok ? '● 已连接' : '● 已断开';
  el.classList.toggle('bad', !ok);
}

// ---------- 房间状态更新 ----------
function onRoomState(s) {
  state.roomState = s;
  ui.currentChannel = state.channelId;
  ui.renderRoom(s);

  // 清理已离开当前频道的对端媒体
  const inChannel = new Set(
    s.users.filter((u) => u.channelId === state.channelId).map((u) => u.id),
  );
  for (const id of [...ui._screenTiles.keys()]) {
    if (id !== 'self' && !inChannel.has(id)) ui.removeScreenTile(id);
  }
  for (const [id, el] of [...peerAudio]) {
    if (!inChannel.has(id)) {
      el.remove();
      peerAudio.delete(id);
    }
  }
}

// ---------- 频道 ----------
ui.onChannelClick = async (channelId) => {
  if (state.channelId === channelId) { await leaveChannel(); return; }
  await leaveChannel();

  const res = await signal.joinChannel(channelId);
  if (res?.error) { ui.toast(res.error); return; }

  state.channelId = channelId;
  ui.currentChannel = channelId;
  if (state.roomState) ui.renderRoom(state.roomState); // 补渲 room:state 先于 ack 到达时的旧状态
  mesh = new PeerMesh({
    userId: signal.id(),
    signaling: signal,
    iceServers: config.iceServers,
    audioStream: null, // 麦克风异步就绪后经 addAudioStream 补入
    onPeerAudio,
    onPeerScreen,
    onPeerScreenStop: (peerId) => ui.removeScreenTile(peerId),
    onPeerState: (peerId, conn) => {
      if (['disconnected', 'failed', 'closed'].includes(conn)) {
        ui.removeScreenTile(peerId);
        const el = peerAudio.get(peerId);
        if (el) { el.remove(); peerAudio.delete(peerId); }
      }
    },
  });
  for (const peer of res.peers) mesh.addPeer(peer);

  applyVoiceState();
  updateControlUI();
  initMicAsync(); // 不阻塞入频道，麦克风就绪后自动补音轨
};

// 后台初始化麦克风（用户手势窗口内调用），失败则保持收听模式
async function initMicAsync() {
  if (!audio) audio = new AudioEngine();
  try {
    await audio.init({ deviceId: settings.deviceId, noiseSuppression: settings.noiseSuppression });
    audio.setVadThreshold(settings.vad);
    mesh?.addAudioStream(audio.outStream);
    micReady = true;
    applyVoiceState();
    syncModeWithAudio();
    updateControlUI();
  } catch (err) {
    ui.toast('无法使用麦克风，当前为收听模式');
  }
}

async function leaveChannel() {
  if (!state.channelId) return;
  await signal.leaveChannel();
  mesh?.closeAll();
  mesh = null;
  audio?.stopVAD();
  audio?.setMuted(true);
  for (const [id, el] of [...peerAudio]) {
    el.remove();
    peerAudio.delete(id);
  }
  for (const id of [...ui._screenTiles.keys()]) ui.removeScreenTile(id);
  state.channelId = null;
  ui.currentChannel = null;
  if (state.roomState) ui.renderRoom(state.roomState);
}

// ---------- WebRTC 媒体回调 ----------
function onPeerAudio(peerId, stream) {
  const el = document.createElement('audio');
  el.autoplay = true;
  el.muted = state.deaf;
  el.srcObject = stream;
  document.body.appendChild(el);
  el.play().catch(() => {});
  peerAudio.set(peerId, el);

  audio?.startStreamMeter(stream, (level) => {
    ui.setMeter(peerId, level);
    ui.setSpeaking(peerId, level > 0.07);
  });
}

function onPeerScreen(peerId, stream) {
  const user = state.roomState?.users.find((u) => u.id === peerId);
  ui.addScreenTile(peerId, stream, user?.username ?? '玩家');
}

// ---------- 语音状态（麦克风/闭麦/模式/PTT/VAD）----------
function effectiveMuted() {
  if (!state.mic || state.deaf) return true;
  if (state.mode === 'always') return false;
  if (state.mode === 'ptt') return !pttDown;
  return !vadSpeaking; // vad
}

function applyVoiceState() {
  audio?.setMuted(effectiveMuted());
  const speaking = !effectiveMuted() && (state.mode === 'vad' ? vadSpeaking : state.mode === 'ptt' ? pttDown : true);
  ui.setSpeaking(state.meId, speaking && !state.deaf);
}

function onLocalSpeech(speaking) {
  vadSpeaking = speaking;
  applyVoiceState();
}

function syncModeWithAudio() {
  if (!audio) return;
  if (state.mode === 'vad') {
    audio.startVAD(onLocalSpeech);
  } else {
    audio.stopVAD();
    vadSpeaking = false;
  }
  if (state.mode === 'always') audio.setMuted(false);
  applyVoiceState();
}

// ---------- 控制栏 ----------
const MODE_LABELS = { vad: 'VAD', ptt: 'PTT', always: '自由麦' };

function wireControls() {
  ui.$('#btn-mic').addEventListener('click', () => {
    if (!micReady) { initMicAsync(); return; }
    state.mic = !state.mic;
    applyVoiceState();
    updateControlUI();
    signal.updateMedia({ mic: state.mic });
  });

  ui.$('#btn-deafen').addEventListener('click', () => {
    state.deaf = !state.deaf;
    applyVoiceState();
    for (const el of peerAudio.values()) el.muted = state.deaf;
    updateControlUI();
    signal.updateMedia({ deaf: state.deaf });
  });

  ui.$('#btn-mode').addEventListener('click', () => {
    const order = ['vad', 'ptt', 'always'];
    state.mode = order[(order.indexOf(state.mode) + 1) % order.length];
    syncModeWithAudio();
    updateControlUI();
  });

  ui.$('#btn-screen').addEventListener('click', () => {
    if (!state.screen) startScreenShare();
    else stopScreenShare();
  });

  ui.$('#btn-settings').addEventListener('click', openSettings);
  ui.$('#btn-settings-close').addEventListener('click', saveSettings);
}

function updateControlUI() {
  const micBtn = ui.$('#btn-mic');
  micBtn.classList.toggle('active', state.mic && !state.deaf);
  micBtn.classList.toggle('off', !state.mic);
  micBtn.innerHTML = `${state.mic ? '🎤' : '🔇'}<span>${state.mic ? '麦克风' : '已静音'}</span>`;

  const deafBtn = ui.$('#btn-deafen');
  deafBtn.classList.toggle('off', state.deaf);
  deafBtn.innerHTML = `${state.deaf ? '😵' : '🔇'}<span>${state.deaf ? '已闭麦' : '闭麦'}</span>`;

  const modeBtn = ui.$('#btn-mode');
  modeBtn.innerHTML = `${state.mode === 'always' ? '🔊' : '🎙️'}<span>${MODE_LABELS[state.mode]}</span>`;
  ui.$('#ptt-hint').hidden = state.mode !== 'ptt';

  const screenBtn = ui.$('#btn-screen');
  screenBtn.classList.toggle('active', state.screen);
  screenBtn.innerHTML = `🖥️<span>${state.screen ? '停止共享' : '共享屏幕'}</span>`;
}

// ---------- PTT ----------
function wirePtt() {
  window.addEventListener('keydown', (e) => {
    if (pttCapturing) {
      e.preventDefault();
      if (e.code === 'Escape') { pttCapturing = false; updatePttKeyLabel(); return; }
      setPttKey(e.code);
      return;
    }
    if (e.code === state.pttKey && state.mode === 'ptt' && e.target.tagName !== 'INPUT') {
      pttDown = true;
      applyVoiceState();
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === state.pttKey && state.mode === 'ptt') {
      pttDown = false;
      applyVoiceState();
    }
  });

  window.addEventListener('blur', () => {
    if (pttDown) {
      pttDown = false;
      applyVoiceState();
    }
  });
}

function setPttKey(code) {
  state.pttKey = code;
  settings.pttKey = code;
  pttCapturing = false;
  updatePttKeyLabel();
  ui.toast(`PTT 按键已设为 ${prettyKey(code)}`);
}

function prettyKey(code) {
  return code.replace('Space', '空格').replace('Key', '').replace('Digit', '');
}

function updatePttKeyLabel() {
  ui.$('#ptt-key-label').textContent = `(${prettyKey(state.pttKey)})`;
}

// ---------- 屏幕共享 ----------
async function startScreenShare() {
  let stream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 30 },
      audio: false,
    });
  } catch { return; } // 用户取消
  state.screen = true;
  ui.addScreenTile('self', stream, getUsername(), { self: true });
  stream.getVideoTracks()[0].addEventListener('ended', () => stopScreenShare());
  await mesh?.shareScreen(stream);
  await signal.updateMedia({ screen: true });
  updateControlUI();
}

async function stopScreenShare() {
  state.screen = false;
  await mesh?.stopScreen();
  ui.removeScreenTile('self');
  await signal.updateMedia({ screen: false });
  updateControlUI();
}

// ---------- 聊天 ----------
function wireChat() {
  ui.$('#chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = ui.$('#chat-input');
    const text = input.value.trim();
    if (!text) return;
    signal.sendChat({ text });
    input.value = '';
  });
}

// ---------- 设置 ----------
async function openSettings() {
  const modal = ui.$('#modal-settings');
  modal.hidden = false;
  document.querySelectorAll('input[name="mode"]').forEach((r) => {
    r.checked = r.value === state.mode;
  });
  ui.$('#set-ns').checked = settings.noiseSuppression;
  ui.$('#set-vad').value = settings.vad;
  ui.$('#vad-value').textContent = settings.vad.toFixed(3);
  updatePttKeyLabel();

  const select = ui.$('#set-device');
  select.innerHTML = '';
  try {
    const devices = await audio?.refreshDevices() ?? [];
    for (const d of devices) {
      const opt = document.createElement('option');
      opt.value = d.deviceId;
      opt.textContent = d.label || `麦克风 ${devices.indexOf(d) + 1}`;
      select.appendChild(opt);
    }
  } catch { /* 权限未授予时为空 */ }
  select.value = settings.deviceId;
}

function saveSettings() {
  const modal = ui.$('#modal-settings');
  modal.hidden = true;

  const mode = document.querySelector('input[name="mode"]:checked')?.value;
  if (mode) state.mode = mode;

  settings.noiseSuppression = ui.$('#set-ns').checked;
  settings.vad = Number(ui.$('#set-vad').value);
  settings.deviceId = ui.$('#set-device').value;
  state.pttKey = settings.pttKey;

  audio?.setVadThreshold(settings.vad);
  if (audio) {
    audio.init({
      deviceId: settings.deviceId,
      noiseSuppression: settings.noiseSuppression,
    }).catch(() => ui.toast('音频设备切换失败'));
  }
  syncModeWithAudio();
  updateControlUI();
}

function wireSettings() {
  ui.$('#set-vad').addEventListener('input', () => {
    ui.$('#vad-value').textContent = Number(ui.$('#set-vad').value).toFixed(3);
  });

  ui.$('#btn-ptt-key').addEventListener('click', () => {
    pttCapturing = true;
    ui.$('#ptt-key-label').textContent = '按任意键…';
  });
}

// 进入页支持 ?room=XXXX 邀请链接
const urlParams = new URLSearchParams(location.search);
if (urlParams.get('room')) ui.$('#input-room').value = urlParams.get('room');

// 自动测试钩子: ?kaihei_test=1 自动建房(或 ?join=房间号 加入)并进频道
// 仅用于自动化验证，正常使用不受影响
if (new URLSearchParams(location.search).has('kaihei_test')) {
  const params = new URLSearchParams(location.search);
  setTimeout(async () => {
    ui.$('#input-username').value = params.get('name') || '测试玩家';
    if (params.get('join')) {
      ui.$('#input-room').value = params.get('join').toUpperCase();
      ui.$('#btn-join').click();
    } else {
      ui.$('#btn-create').click();
    }
    await new Promise((r) => setTimeout(r, 1800));
    document.querySelector('.channel-item')?.click();
  }, 500);
}

boot().catch((e) => {
  const el = ui.$('#lobby-error');
  el.textContent = `启动失败: ${e.message}`;
  el.hidden = false;
});












