// main.js — 应用主控制器（含顶部菜单栏统筹）
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
  outputDeviceId: 'default',
  noiseSuppression: true,
  vad: 0.02,
  pttKey: 'Space',
  shareSource: 'screen',   // screen | obs（OBS 虚拟摄像头）
  shareAudio: false,       // 共享屏幕时同时共享系统声音
};

let config = null;
let signal = null;
let audio = null;
let mesh = null;
let peerAudio = new Map();  // peerId -> <audio> 播放元素
let screenAudioPlayers = new Map(); // peerId -> <audio>（对端共享的系统声音）
let pttDown = false;
let vadSpeaking = false;
let pttCapturing = false;
let micReady = false;

// ---------- 设置持久化 ----------
function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem('ginyvoc:settings') || '{}');
    if (typeof saved.deviceId === 'string') settings.deviceId = saved.deviceId;
    if (typeof saved.outputDeviceId === 'string') settings.outputDeviceId = saved.outputDeviceId;
    if (typeof saved.noiseSuppression === 'boolean') settings.noiseSuppression = saved.noiseSuppression;
    if (typeof saved.vad === 'number') settings.vad = saved.vad;
    if (typeof saved.pttKey === 'string') settings.pttKey = saved.pttKey;
    if (saved.shareSource === 'screen' || saved.shareSource === 'obs') settings.shareSource = saved.shareSource;
    if (typeof saved.shareAudio === 'boolean') settings.shareAudio = saved.shareAudio;
    state.pttKey = settings.pttKey;
  } catch { /* 隐私模式读取失败时使用默认值 */ }
}

function persistSettings() {
  try {
    localStorage.setItem('ginyvoc:settings', JSON.stringify(settings));
  } catch { /* 隐私模式写入失败时仅本次会话生效 */ }
}

// ---------- 启动 ----------
window.__ginyvocBoot = false;
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
  loadSettings();
  const res = await fetch('/api/config');
  config = await res.json();
  console.log('[ginyvoc] config ok');

  console.log('[ginyvoc] creating signaling');
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
  wireMenu();
  ui.$('#menu-debug-state').textContent = window.gvDesktop ? '桌面版 · 日志见 exe 旁 logs 目录' : '浏览器版 · 日志见服务端日志目录';
  const lobbyServer = ui.$('#lobby-server');
  if (lobbyServer) lobbyServer.textContent = `当前服务器：${location.origin}`;
  window.__ginyvocBoot = true;
  console.log('[ginyvoc] boot done');
}

// ---------- 房间进入 ----------
function wireLobby() {
  const nameInput = ui.$('#input-username');
  nameInput.value = localStorage.getItem('ginyvoc:username') || '';
  const saveName = () => localStorage.setItem('ginyvoc:username', nameInput.value.trim());

  ui.$('#btn-create').addEventListener('click', async () => {
    saveName();
    const res = await signal.createRoom(getUsername());
    handleRoomResponse(res);
  });

  ui.$('#btn-join').addEventListener('click', async () => {
    saveName();
    const roomId = ui.$('#input-room').value.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,6}$/.test(roomId)) {
      showLobbyError('房间号格式不正确（4-6 位字母数字）');
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

  ui.$('#btn-leave').addEventListener('click', leaveRoom);
  ui.$('#btn-copy-link').addEventListener('click', copyInviteLink);
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
  updateMenuUI();
  ui.toast(`已进入房间 ${res.roomId}，双击左侧频道加入语音`);
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
  screenAudioPlayers.forEach((el) => el.remove());
  screenAudioPlayers.clear();
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
  for (const [id, el] of [...screenAudioPlayers]) {
    if (!inChannel.has(id)) {
      el.remove();
      screenAudioPlayers.delete(id);
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
    onPeerScreenAudio,
    onPeerScreen,
    onPeerScreenStop: (peerId) => ui.removeScreenTile(peerId),
    onPeerState: (peerId, conn) => {
      if (['disconnected', 'failed', 'closed'].includes(conn)) {
        ui.removeScreenTile(peerId);
        const el = peerAudio.get(peerId);
        if (el) { el.remove(); peerAudio.delete(peerId); }
        const sel = screenAudioPlayers.get(peerId);
        if (sel) { sel.remove(); screenAudioPlayers.delete(peerId); }
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
    // 本地音量表：让自己在成员列表里也能看到实时音量
    audio.startLocalMeter((level) => ui.setMeter(state.meId, level));
    applyVoiceState();
    syncModeWithAudio();
    updateControlUI();
  } catch (err) {
    ui.toast('无法使用麦克风：请检查 Windows 设置 → 隐私 → 麦克风 是否允许桌面应用访问（浏览器版请检查网页权限）');
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
  for (const [id, el] of [...screenAudioPlayers]) {
    el.remove();
    screenAudioPlayers.delete(id);
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

function onPeerScreenAudio(peerId, stream) {
  let el = screenAudioPlayers.get(peerId);
  if (!el) {
    el = document.createElement('audio');
    el.autoplay = true;
    document.body.appendChild(el);
    screenAudioPlayers.set(peerId, el);
  }
  el.muted = state.deaf;
  el.srcObject = stream;
  el.play().catch(() => {});
  if (settings.outputDeviceId !== 'default' && el.setSinkId) {
    el.setSinkId(settings.outputDeviceId).catch(() => {});
  }
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

// ---------- 公共控制（底部控制栏与顶部菜单共用）----------
const MODE_LABELS = { vad: 'VAD', ptt: 'PTT', always: '自由麦' };

function toggleMic() {
  if (!micReady) { initMicAsync(); return; }
  state.mic = !state.mic;
  applyVoiceState();
  updateControlUI();
  signal.updateMedia({ mic: state.mic });
}

function toggleDeafen() {
  state.deaf = !state.deaf;
  applyVoiceState();
  for (const el of peerAudio.values()) el.muted = state.deaf;
  for (const el of screenAudioPlayers.values()) el.muted = state.deaf;
  updateControlUI();
  signal.updateMedia({ deaf: state.deaf });
}

function setMode(mode) {
  if (!['vad', 'ptt', 'always'].includes(mode) || mode === state.mode) return;
  state.mode = mode;
  syncModeWithAudio();
  updateControlUI();
}

function cycleMode() {
  const order = ['vad', 'ptt', 'always'];
  setMode(order[(order.indexOf(state.mode) + 1) % order.length]);
}

function toggleScreen() {
  if (!state.screen) startScreenShare();
  else stopScreenShare();
}

async function leaveRoom() {
  await leaveChannel();
  await signal.leaveRoom();
  resetApp();
}

async function copyInviteLink() {
  const url = `${location.origin}/?room=${state.roomId}`;
  try {
    await navigator.clipboard.writeText(url);
    ui.toast('邀请链接已复制');
  } catch {
    ui.toast(`邀请链接: ${url}`);
  }
}

function wireControls() {
  ui.$('#btn-mic').addEventListener('click', toggleMic);
  ui.$('#btn-deafen').addEventListener('click', toggleDeafen);
  ui.$('#btn-mode').addEventListener('click', cycleMode);
  ui.$('#btn-screen').addEventListener('click', toggleScreen);
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

  updateMenuUI();
}

// ---------- 顶部菜单栏 ----------
const MENU_ACTIONS = {
  'set-mode': (mode) => setMode(mode),
  'toggle-mic': () => toggleMic(),
  'toggle-deafen': () => toggleDeafen(),
  'capture-ptt': () => startPttCapture(),
  'toggle-screen': () => toggleScreen(),
  'copy-link': () => copyInviteLink(),
  'leave-room': () => leaveRoom(),
  'open-settings': () => openSettings(),
  'open-shortcuts': () => openShortcuts(),
  'open-about': () => openAbout(),
  'check-update': () => checkUpdate(),
  'open-server-settings': () => openServerSettings(),
  'quit-app': () => quitApp(),
};

function quitApp() {
  if (window.gvDesktop?.quit) {
    window.gvDesktop.quit();
  } else {
    ui.toast('浏览器版请直接关闭标签页即可');
  }
}

function wireMenu() {
  document.querySelectorAll('.menu').forEach((menu) => {
    menu.querySelector('.menu-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      const wasOpen = menu.classList.contains('open');
      closeMenus();
      if (!wasOpen) {
        menu.classList.add('open');
        if (menu.dataset.menu === 'settings') {
          populateDevices(ui.$('#menu-device'));
          populateOutputDevices(ui.$('#menu-output-device'));
        }
      }
      updateMenuUI();
    });
  });
  // 点击菜单外部关闭
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.menu')) closeMenus();
  });

  // 菜单项动作分发
  document.querySelectorAll('.menu-item[data-action]').forEach((item) => {
    item.addEventListener('click', () => {
      const fn = MENU_ACTIONS[item.dataset.action];
      if (fn) fn(item.dataset.mode);
      closeMenus();
    });
  });

  // 设置下拉：即时生效并同步完整设置弹窗
  ui.$('#menu-vad').addEventListener('input', () => {
    settings.vad = Number(ui.$('#menu-vad').value);
    audio?.setVadThreshold(settings.vad);
    ui.$('#menu-vad-value').textContent = settings.vad.toFixed(3);
    ui.$('#set-vad').value = settings.vad;
    ui.$('#vad-value').textContent = settings.vad.toFixed(3);
    persistSettings();
  });
  ui.$('#menu-ns').addEventListener('change', () => {
    settings.noiseSuppression = ui.$('#menu-ns').checked;
    ui.$('#set-ns').checked = settings.noiseSuppression;
    applyAudioDevice();
  });
  ui.$('#menu-device').addEventListener('change', () => {
    settings.deviceId = ui.$('#menu-device').value;
    ui.$('#set-device').value = settings.deviceId;
    applyAudioDevice();
    persistSettings();
  });
  ui.$('#menu-output-device').addEventListener('change', () => {
    ui.$('#set-output-device').value = ui.$('#menu-output-device').value;
    applyOutputDevice(ui.$('#menu-output-device').value);
  });
  ui.$('#menu-share-source').addEventListener('change', () => {
    settings.shareSource = ui.$('#menu-share-source').value;
    persistSettings();
    updateMenuUI();
  });
  ui.$('#menu-share-audio').addEventListener('change', () => {
    settings.shareAudio = ui.$('#menu-share-audio').checked;
    persistSettings();
    updateMenuUI();
  });

  // 服务器设置
  ui.$('#btn-server-cancel').addEventListener('click', () => { ui.$('#modal-server').hidden = true; });
  ui.$('#btn-server-save').addEventListener('click', saveServerSettings);
  ui.$('#server-mode-local').addEventListener('change', () => { ui.$('#server-address-field').hidden = true; });
  ui.$('#server-mode-remote').addEventListener('change', () => { ui.$('#server-address-field').hidden = false; });

  ui.$('#btn-shortcuts-close').addEventListener('click', () => { ui.$('#modal-shortcuts').hidden = true; });
  ui.$('#btn-about-close').addEventListener('click', () => { ui.$('#modal-about').hidden = true; });

  // 更新弹窗
  ui.$('#btn-update-cancel').addEventListener('click', () => { ui.$('#modal-update').hidden = true; });
  ui.$('#btn-update-now').addEventListener('click', applyUpdate);
  window.gvDesktop?.onUpdateProgress(({ stage }) => {
    ui.$('#update-status').textContent = stage;
    ui.$('#menu-update-state').textContent = `更新：${stage}`;
  });
  window.gvDesktop?.onUpdateAvailable((r) => {
    ui.$('#menu-update-state').textContent = `发现新版本 v${r.latest}`;
    ui.toast(`发现新版本 v${r.latest}，可在 帮助 → 检查更新 中查看`);
  });
}

function closeMenus() {
  document.querySelectorAll('.menu.open').forEach((m) => m.classList.remove('open'));
}

// ---------- 自动更新 ----------
async function checkUpdate() {
  const modal = ui.$('#modal-update');
  modal.hidden = false;
  ui.$('#update-info').hidden = true;
  ui.$('#btn-update-now').hidden = true;
  ui.$('#update-status').textContent = '检查更新中…';
  if (!window.gvDesktop) {
    ui.$('#update-status').textContent = '当前为浏览器版：更新请重新拉取最新代码，或下载最新桌面版 exe。';
    ui.$('#menu-update-state').textContent = '更新：浏览器版无需检查';
    return;
  }
  const r = await window.gvDesktop.checkUpdate();
  renderUpdateResult(r);
}

function renderUpdateResult(r) {
  if (!r || !r.ok) {
    ui.$('#update-status').textContent = r?.detail || '检查更新失败，请检查网络后重试';
  } else if (r.hasUpdate) {
    ui.$('#update-status').textContent = `发现新版本 v${r.latest}`;
    ui.$('#update-info').hidden = false;
    ui.$('#update-cur').textContent = `v${r.current}`;
    ui.$('#update-new').textContent = `v${r.latest}`;
    const notes = ui.$('#update-notes');
    notes.innerHTML = '';
    const pre = document.createElement('pre');
    pre.textContent = (r.notes || '').slice(0, 1000) || '（本次更新无说明）';
    notes.appendChild(pre);
    ui.$('#btn-update-now').hidden = false;
  } else {
    ui.$('#update-status').textContent = `已是最新版本 v${r.current}`;
    ui.$('#update-info').hidden = true;
    ui.$('#btn-update-now').hidden = true;
  }
  ui.$('#menu-update-state').textContent = `更新：${ui.$('#update-status').textContent}`;
}

async function applyUpdate() {
  if (!window.gvDesktop) return;
  const btn = ui.$('#btn-update-now');
  btn.disabled = true;
  ui.$('#update-status').textContent = '正在准备更新…';
  const r = await window.gvDesktop.applyUpdate();
  if (r?.message) ui.$('#update-status').textContent = r.message;
  if (r && !r.ok && r.message) ui.$('#update-status').textContent = r.message;
  btn.disabled = false;
}

function updateMenuUI() {
  // 说话模式勾选
  document.querySelectorAll('.menu-item[data-action="set-mode"]').forEach((it) => {
    it.classList.toggle('checked', it.dataset.mode === state.mode);
  });
  // 麦克风
  const micOn = state.mic && !state.deaf;
  ui.$('#mi-mic').textContent = micOn ? '🎤' : '🔇';
  const micItem = ui.$('#menu-mic-state');
  micItem.textContent = state.mic ? '开' : '静音';
  micItem.parentElement.classList.toggle('off', !state.mic);
  // 闭麦
  const deafItem = ui.$('#menu-deafen-state');
  deafItem.textContent = state.deaf ? '开' : '关';
  deafItem.parentElement.classList.toggle('on', state.deaf);
  // PTT 按键 / 屏幕 / 房间
  ui.$('#menu-ptt-key').textContent = prettyKey(state.pttKey);
  ui.$('#menu-screen-text').textContent = state.screen ? '停止共享' : '共享屏幕';
  ui.$('#menu-screen-state').textContent = state.screen ? '共享中' : '未共享';
  ui.$('#menu-screen-tip').textContent = state.screen
    ? '点击菜单项可停止共享'
    : (settings.shareSource === 'obs'
        ? 'OBS 虚拟摄像头共享：请先在 OBS 中启动虚拟摄像头（工具 → 虚拟摄像头）'
        : (settings.shareAudio ? '将同时共享系统声音（适合一起看视频/电影）' : '可共享整个屏幕 / 窗口 / 标签页'));
  ui.$('#menu-room-code').textContent = state.roomId || '--';
  // 设置
  ui.$('#menu-ns').checked = settings.noiseSuppression;
  ui.$('#menu-vad').value = settings.vad;
  ui.$('#menu-vad-value').textContent = settings.vad.toFixed(3);
  ui.$('#menu-device').value = settings.deviceId;
  ui.$('#menu-output-device').value = settings.outputDeviceId;
  ui.$('#menu-share-source').value = settings.shareSource;
  ui.$('#menu-share-audio').checked = settings.shareAudio;
}

async function openServerSettings() {
  const modal = ui.$('#modal-server');
  modal.hidden = false;
  const localEl = ui.$('#server-local-urls');
  const addrEl = ui.$('#server-address');
  const local = ui.$('#server-mode-local');
  const remote = ui.$('#server-mode-remote');
  local.disabled = false;
  remote.disabled = false;
  if (window.gvDesktop?.getServerConfig) {
    const cfg = await window.gvDesktop.getServerConfig();
    local.checked = cfg.mode !== 'remote';
    remote.checked = cfg.mode === 'remote';
    addrEl.value = cfg.address || '';
    ui.$('#server-address-field').hidden = cfg.mode !== 'remote';
    localEl.innerHTML = cfg.localUrls?.length
      ? cfg.localUrls.map((u) => `<code>${u}</code>`).join('<br>')
      : '（未检测到局域网/组网地址，请确认已加入 ZeroTier 等虚拟局域网）';
  } else {
    // 浏览器版：直接访问目标地址即可
    local.checked = true;
    remote.disabled = true;
    addrEl.value = location.origin;
    ui.$('#server-address-field').hidden = false;
    localEl.innerHTML = `当前服务器：<code>${location.origin}</code><br>浏览器版切换服务器请直接打开目标地址。`;
  }
}

async function saveServerSettings() {
  if (!window.gvDesktop?.setServerConfig) {
    ui.toast('浏览器版无需保存：请直接访问目标服务器地址');
    ui.$('#modal-server').hidden = true;
    return;
  }
  const mode = ui.$('#server-mode-remote').checked ? 'remote' : 'local';
  const address = ui.$('#server-address').value.trim();
  const r = await window.gvDesktop.setServerConfig({ mode, address });
  if (r?.ok) {
    ui.$('#modal-server').hidden = true;
    ui.toast('设置已保存，正在重启应用…');
  } else {
    ui.toast(r?.error || '保存失败');
  }
}

function openShortcuts() {
  ui.$('#modal-shortcuts').hidden = false;
}

function openAbout() {
  ui.$('#modal-about').hidden = false;
  if (config?.version) ui.$('#about-version').textContent = config.version;
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
    if (e.code === 'Escape') { closeMenus(); return; }
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

function startPttCapture() {
  pttCapturing = true;
  ui.$('#ptt-key-label').textContent = '按任意键…';
  ui.$('#menu-ptt-key').textContent = '按任意键…';
}

function setPttKey(code) {
  state.pttKey = code;
  settings.pttKey = code;
  pttCapturing = false;
  updatePttKeyLabel();
  persistSettings();
  ui.toast(`PTT 按键已设为 ${prettyKey(code)}`);
}

function prettyKey(code) {
  return code.replace('Space', '空格').replace('Key', '').replace('Digit', '');
}

function updatePttKeyLabel() {
  ui.$('#ptt-key-label').textContent = `(${prettyKey(state.pttKey)})`;
  ui.$('#menu-ptt-key').textContent = prettyKey(state.pttKey);
}

// ---------- 屏幕共享 ----------
// 来源：screen = 系统屏幕/窗口/标签页；obs = OBS 虚拟摄像头
async function startScreenShare() {
  let stream;
  try {
    if (settings.shareSource === 'obs') {
      stream = await getObsStream();
      // OBS 虚拟摄像头只输出画面；勾选系统声音时补充采集（需再选一次 OBS 正在采集的窗口）
      if (settings.shareAudio && !stream.getAudioTracks().length) {
        try {
          const audioStream = await navigator.mediaDevices.getDisplayMedia({
            video: { frameRate: 30 },
            audio: true,
          });
          audioStream.getVideoTracks().forEach((t) => t.stop()); // 只保留系统声音
          for (const t of audioStream.getAudioTracks()) stream.addTrack(t);
        } catch {
          ui.toast('未采集系统声音：仅共享 OBS 画面');
        }
      }
    } else {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: settings.shareAudio,
      });
    }
  } catch { return; } // 用户取消
  state.screen = true;
  ui.addScreenTile('self', stream, getUsername(), { self: true });
  stream.getVideoTracks()[0]?.addEventListener('ended', () => stopScreenShare());
  await mesh?.shareScreen(stream);
  await signal.updateMedia({ screen: true });
  updateControlUI();
}

async function getObsStream() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const cam = devices.find(
    (d) => d.kind === 'videoinput' && /obs|virtual camera|vcam/i.test(d.label || ''),
  );
  if (!cam) {
    ui.toast('未找到 OBS 虚拟摄像头：请先在 OBS 中启动虚拟摄像头（工具 → 虚拟摄像头）');
    throw new Error('obs-not-found');
  }
  return navigator.mediaDevices.getUserMedia({
    video: { deviceId: { exact: cam.deviceId }, frameRate: 30 },
    audio: false,
  });
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
async function populateDevices(select) {
  select.innerHTML = '';
  const optDefault = document.createElement('option');
  optDefault.value = 'default';
  optDefault.textContent = '默认（系统默认麦克风）';
  select.appendChild(optDefault);
  try {
    const devices = await audio?.refreshDevices() ?? [];
    for (const d of devices) {
      if (d.deviceId === 'default') continue;
      const opt = document.createElement('option');
      opt.value = d.deviceId;
      opt.textContent = d.label || `麦克风 ${devices.indexOf(d) + 1}`;
      select.appendChild(opt);
    }
  } catch { /* 权限未授予时为空 */ }
  select.value = settings.deviceId;
}

async function populateOutputDevices(select) {
  select.innerHTML = '';
  const optDefault = document.createElement('option');
  optDefault.value = 'default';
  optDefault.textContent = '默认输出设备';
  select.appendChild(optDefault);
  try {
    const devices = await audio?.refreshOutputDevices() ?? [];
    for (const d of devices) {
      if (d.deviceId === 'default') continue;
      const opt = document.createElement('option');
      opt.value = d.deviceId;
      opt.textContent = d.label || `扬声器 ${devices.indexOf(d) + 1}`;
      select.appendChild(opt);
    }
  } catch { /* 枚举失败时仅保留默认项 */ }
  select.value = settings.outputDeviceId;
}

function applyOutputDevice(id) {
  settings.outputDeviceId = id;
  persistSettings();
  const applyTo = (el) => {
    if (el?.setSinkId) {
      el.setSinkId(id).catch(() => ui.toast('输出设备切换失败：当前设备不支持'));
    }
  };
  for (const el of peerAudio.values()) applyTo(el);
  for (const el of screenAudioPlayers.values()) applyTo(el);
  updateMenuUI();
}

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
  await populateDevices(ui.$('#set-device'));
  await populateOutputDevices(ui.$('#set-output-device'));
}

function applyAudioDevice() {
  if (audio) {
    audio.init({
      deviceId: settings.deviceId,
      noiseSuppression: settings.noiseSuppression,
    }).catch(() => ui.toast('音频设备切换失败'));
  }
  persistSettings();
  syncModeWithAudio();
  updateControlUI();
}

function saveSettings() {
  const modal = ui.$('#modal-settings');
  modal.hidden = true;

  const mode = document.querySelector('input[name="mode"]:checked')?.value;
  if (mode) state.mode = mode;

  settings.noiseSuppression = ui.$('#set-ns').checked;
  settings.vad = Number(ui.$('#set-vad').value);
  settings.deviceId = ui.$('#set-device').value;
  settings.outputDeviceId = ui.$('#set-output-device').value;
  state.pttKey = settings.pttKey;

  audio?.setVadThreshold(settings.vad);
  applyAudioDevice();
  applyOutputDevice(settings.outputDeviceId);
  persistSettings();
}

function wireSettings() {
  ui.$('#set-vad').addEventListener('input', () => {
    ui.$('#vad-value').textContent = Number(ui.$('#set-vad').value).toFixed(3);
  });

  ui.$('#btn-ptt-key').addEventListener('click', startPttCapture);
}

// 调试钩子：供自动化验证内部媒体状态（对正常使用无影响）
window.__ginyvocMedia = () => ({
  peerAudio: [...peerAudio.keys()],
  screenAudioPlayers: [...screenAudioPlayers.keys()],
  screenTiles: [...ui._screenTiles.keys()],
  micReady,
  audioCtx: audio?.ctx?.state ?? null,
  vadRunning: audio?.vadRunning ?? null,
  micTracks: audio?.micStream?.getTracks().length ?? 0,
  outTracks: audio?.outStream?.getTracks().length ?? 0,
});

// 进入页支持 ?room=XXXX 邀请链接
const urlParams = new URLSearchParams(location.search);
if (urlParams.get('room')) ui.$('#input-room').value = urlParams.get('room');

// 自动测试钩子: ?ginyvoc_test=1 自动建房(或 ?join=房间号 加入)并进频道
// 仅用于自动化验证，正常使用不受影响
if (new URLSearchParams(location.search).has('ginyvoc_test')) {
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
    document.querySelector('.channel-item')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  }, 500);
}

boot().catch((e) => {
  const el = ui.$('#lobby-error');
  el.textContent = `启动失败: ${e.message}`;
  el.hidden = false;
});
