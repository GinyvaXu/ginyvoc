// main.js — GinyScreen 应用逻辑（房间 / 共享 / 观看 / 设置）
import { connectSignaling } from './signaling.js';
import { MeshManager } from './webrtc.js';
import { PRESETS, DEFAULT_PRESET, startScreenShare, applyPreset } from './screenshare.js';
import * as ui from './ui.js';

const state = {
  meId: null,
  username: '',
  roomId: '',
  socket: null,
  mesh: null,
  config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }], version: '' },
  members: [],
  localStream: null,
  remoteStreams: new Map(), // peerId -> { username, stream }
  focused: null,
  sharing: false,
  preset: DEFAULT_PRESET,
};

// ═══════════ 启动 ═══════════
async function boot() {
  try {
    const res = await fetch('/api/config');
    const cfg = await res.json();
    if (cfg.iceServers?.length) state.config.iceServers = cfg.iceServers;
    if (cfg.version) state.config.version = cfg.version;
  } catch { /* 配置拉取失败则用默认 STUN */ }

  connect();
  wireLobby();
  wireRoom();
  wireModals();
  wireErrorReport();
  showLobbyServer();
  ui.showScreen('lobby');
}

function connect() {
  state.socket = connectSignaling({
    onState: (s) => applyRoomState(s),
    onSignal: (p) => state.mesh?.handleSignal(p.from, p.data),
    onMemberJoined: (p) => onMemberJoined(p.user),
    onMemberLeft: (p) => onMemberLeft(p.id),
    onShareUpdate: (p) => onShareUpdate(p.id, p.share),
    onError: (msg) => { ui.toast(msg); setConnStatus(false); },
  });

  state.mesh = new MeshManager({
    socket: state.socket,
    iceServers: state.config.iceServers,
    myId: () => state.socket.id(),
    onRemoteStream: (peerId, stream) => onRemoteStream(peerId, stream),
    onPeerState: (peerId, st) => onPeerState(peerId, st),
  });
}

// ═══════════ 进入页 ═══════════
function wireLobby() {
  ui.$('#btn-create').addEventListener('click', () => enterRoom('create'));
  ui.$('#btn-join').addEventListener('click', () => enterRoom('join'));
  ui.$('#input-room').addEventListener('keydown', (e) => { if (e.key === 'Enter') enterRoom('join'); });
  ui.$('#input-username').addEventListener('keydown', (e) => { if (e.key === 'Enter') enterRoom('create'); });
}

async function enterRoom(mode) {
  const username = ui.$('#input-username').value.trim() || '观众';
  const roomInput = ui.$('#input-room').value.trim().toUpperCase();
  if (mode === 'join' && !roomInput) return showLobbyError('请输入房间号');
  state.username = username;
  const res = mode === 'create'
    ? await state.socket.createRoom(username)
    : await state.socket.joinRoom(roomInput, username);
  if (res?.error) return showLobbyError(res.error);
  state.roomId = res.roomId;
  state.meId = state.socket.id();
  state.members = res.roomState.users;
  ui.$('#lobby-error').hidden = true;
  ui.$('#room-code').textContent = state.roomId;
  setConnStatus(true);
  ui.renderMembers(state.members, state.meId);
  applyRoomState(res.roomState);
  ui.showScreen('room');
}

function showLobbyError(msg) {
  const el = ui.$('#lobby-error');
  el.textContent = msg;
  el.hidden = false;
}

async function showLobbyServer() {
  const el = ui.$('#lobby-server');
  try {
    if (window.gvDesktop?.getServerConfig) {
      const cfg = await window.gvDesktop.getServerConfig();
      el.textContent = cfg.mode === 'remote' ? `当前服务器：${cfg.address}` : '当前服务器：本机开服';
    } else {
      el.textContent = `当前服务器：${location.origin}`;
    }
  } catch { /* 忽略 */ }
}

// ═══════════ 房间状态同步 ═══════════
function applyRoomState(s) {
  state.members = s.users || [];
  ui.renderMembers(state.members, state.meId);
  // 清理「对方已停止共享」的画面（以服务器状态为准）
  const still = new Set(state.members.filter((m) => m.share).map((m) => m.id));
  for (const peerId of [...state.remoteStreams.keys()]) {
    if (!still.has(peerId)) removeRemote(peerId);
  }
  if (!state.members.some((m) => m.share) && !state.sharing) {
    state.focused = null;
  }
  renderStage();
}

function onMemberJoined(user) {
  state.members.push(user);
  ui.renderMembers(state.members, state.meId);
  state.mesh?.peerJoined(user); // 我共享中 → 向新成员发起共享
}

function onMemberLeft(id) {
  state.members = state.members.filter((m) => m.id !== id);
  ui.renderMembers(state.members, state.meId);
  removeRemote(id);
  state.mesh?.closeIncoming(id);
}

function onShareUpdate(id, share) {
  const m = state.members.find((x) => x.id === id);
  if (m) m.share = share;
  ui.renderMembers(state.members, state.meId);
  if (!share) {
    removeRemote(id);
    state.mesh?.closeIncoming(id);
  }
  // share=true 时画面由对方 offer 到达后呈现
  renderStage();
}

function onRemoteStream(peerId, stream) {
  const member = state.members.find((m) => m.id === peerId);
  state.remoteStreams.set(peerId, { username: member?.username || '好友', stream });
  renderStage();
}

function onPeerState(peerId, st) {
  if (st === 'failed' || st === 'closed') {
    if (state.remoteStreams.has(peerId)) {
      ui.toast(`与「${state.remoteStreams.get(peerId).username}」的连接中断`, 4000);
      removeRemote(peerId);
      state.mesh?.closeIncoming(peerId);
    }
  }
}

function removeRemote(peerId) {
  if (state.remoteStreams.delete(peerId)) {
    if (state.focused === peerId) state.focused = null;
    renderStage();
  }
}

function renderStage() {
  const views = { local: null, remotes: [] };
  if (state.localStream) views.local = { username: state.username, stream: state.localStream };
  for (const [id, v] of state.remoteStreams) views.remotes.push({ id, username: v.username, stream: v.stream });
  ui.renderStage(views, state.focused);
}

// ═══════════ 屏幕共享 ═══════════
async function toggleShare() {
  if (state.sharing) { stopShare(); return; }
  const withAudio = ui.$('#share-audio').checked;
  try {
    const { stream } = await startScreenShare({ presetKey: state.preset, withAudio });
    if (!stream.getVideoTracks().length) return;
    state.localStream = stream;
    state.sharing = true;
    state.focused = 'local';
    stream.addEventListener('userstopped', () => stopShare('已在系统里停止共享'));
    state.mesh.startSharing(stream, state.members);
    await state.socket.setShare(true);
    updateShareUI();
    renderStage();
    ui.toast(withAudio ? '共享已开始（含系统声音）' : '共享已开始');
  } catch (err) {
    if (err?.name === 'NotAllowedError') ui.toast('已取消共享');
    else { console.error(err); ui.toast('共享失败：' + (err?.message || err)); }
  }
}

function stopShare(reason) {
  if (!state.sharing) return;
  state.sharing = false;
  state.mesh.stopSharing();
  state.socket.setShare(false);
  state.localStream = null;
  if (state.focused === 'local') state.focused = null;
  updateShareUI();
  renderStage();
  ui.toast(reason || '已停止共享');
}

function updateShareUI() {
  const btn = ui.$('#btn-share');
  btn.textContent = state.sharing ? '⏹ 停止共享' : '🖥️ 共享屏幕';
  btn.classList.toggle('sharing', state.sharing);
  ui.$('#share-audio').disabled = state.sharing;
  const st = ui.$('#share-status');
  st.textContent = state.sharing ? `正在共享（${PRESETS[state.preset].label}）` : '';
  const presetSel = ui.$('#preset-select');
  if (state.sharing) {
    presetSel.onchange = async () => {
      state.preset = presetSel.value;
      applyPreset(state.localStream, state.mesh.outPcsList(), state.preset);
      st.textContent = `正在共享（${PRESETS[state.preset].label}）`;
    };
  } else {
    presetSel.onchange = () => { state.preset = presetSel.value; };
  }
}

// ═══════════ 房间工具栏 ═══════════
function wireRoom() {
  ui.$('#btn-share').addEventListener('click', toggleShare);
  ui.$('#btn-empty-share')?.addEventListener('click', () => {
    // 空状态按钮在 renderStage 重建，用委托处理
  });
  ui.$('#stage').addEventListener('click', (e) => {
    if (e.target.id === 'btn-empty-share') toggleShare();
  });
  ui.setFocusHandler((id) => { state.focused = id; renderStage(); });

  ui.$('#btn-copy-room').addEventListener('click', () => copyText(state.roomId, '房间号已复制'));
  ui.$('#btn-copy-link').addEventListener('click', () => {
    copyText(`${location.origin}?room=${state.roomId}`, '邀请链接已复制');
  });
  ui.$('#btn-leave').addEventListener('click', leaveRoom);
  ui.$('#btn-server-settings').addEventListener('click', openServerSettings);
  ui.$('#share-audio').addEventListener('change', (e) => {
    if (state.sharing) { e.target.checked = false; ui.toast('请在停止共享后修改系统声音'); }
  });
}

async function copyText(text, okMsg) {
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
    else { const ta = document.createElement('textarea'); ta.value = text; document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
    ui.toast(okMsg);
  } catch { ui.toast('复制失败，请手动复制'); }
}

async function leaveRoom() {
  if (state.sharing) stopShare('已离开房间');
  state.mesh?.closeAll();
  state.remoteStreams.clear();
  state.members = [];
  state.focused = null;
  ui.clearVideos();
  await state.socket.leaveRoom();
  ui.showScreen('lobby');
}

// ═══════════ 服务器设置 ═══════════
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
      : '（未检测到局域网/组网地址，请确认已加入蒲公英/米西等虚拟局域网）';
  } else {
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

// ═══════════ 更新 / 关于 / 退出 ═══════════
function wireModals() {
  ui.$('#btn-server-cancel').addEventListener('click', () => { ui.$('#modal-server').hidden = true; });
  ui.$('#btn-server-save').addEventListener('click', saveServerSettings);
  ui.$('#btn-about-close').addEventListener('click', () => { ui.$('#modal-about').hidden = true; });
  ui.$('#btn-update-cancel').addEventListener('click', () => { ui.$('#modal-update').hidden = true; });
  ui.$('#btn-update-now').addEventListener('click', async () => {
    ui.$('#update-status').textContent = '正在下载并安装…';
    const r = await window.gvDesktop.applyUpdate();
    if (r && !r.ok && r.error) ui.$('#update-status').textContent = r.error;
  });
  ui.$('#modal-server').addEventListener('click', (e) => { if (e.target.id === 'modal-server') ui.$('#modal-server').hidden = true; });

  ui.wireHelpDropdown();
  ui.setMenuHandler('check-update', checkUpdate);
  ui.setMenuHandler('open-about', () => {
    ui.$('#about-version').textContent = state.config.version || '--';
    ui.openModal('#modal-about');
  });
  ui.setMenuHandler('quit-app', () => window.gvDesktop?.quit());
}

async function checkUpdate() {
  const modal = ui.$('#modal-update');
  ui.openModal('#modal-update');
  ui.$('#update-info').hidden = true;
  ui.$('#btn-update-now').hidden = true;
  if (!window.gvDesktop?.checkUpdate) {
    ui.$('#update-status').textContent = '浏览器版不支持检查更新，请使用桌面版 exe';
    return;
  }
  ui.$('#update-status').textContent = '检查更新中…';
  const r = await window.gvDesktop.checkUpdate();
  if (r?.ok) {
    if (!r.hasUpdate) {
      ui.$('#update-status').textContent = `已是最新版本（v${r.current}）`;
      return;
    }
    ui.$('#update-status').textContent = `发现新版本（${r.source}）`;
    ui.$('#update-cur').textContent = `v${r.current}`;
    ui.$('#update-new').textContent = `v${r.latest}`;
    ui.$('#update-notes').textContent = r.notes || '';
    ui.$('#update-info').hidden = false;
    ui.$('#btn-update-now').hidden = false;
  } else {
    ui.$('#update-status').textContent = r?.error || '检查更新失败';
  }
}

// ═══════════ 错误上报 ═══════════
function wireErrorReport() {
  window.addEventListener('error', (e) => {
    state.socket?.reportError({ message: e.message, stack: e.error?.stack, url: location.href });
  });
  window.addEventListener('unhandledrejection', (e) => {
    state.socket?.reportError({ message: String(e.reason || 'Unknown rejection') });
  });
}

function setConnStatus(ok) {
  const el = ui.$('#conn-status');
  el.textContent = ok ? '● 已连接' : '● 连接中断';
  el.className = 'conn-status ' + (ok ? 'ok' : 'bad');
}

// 深色主题下选择框跟随系统
boot();