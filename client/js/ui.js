// ui.js — DOM 工具 + 房间渲染（成员列表 / 舞台 / 弹窗 / toast）
export const $ = (sel) => document.querySelector(sel);

let toastTimer = null;
export function toast(msg, ms = 3200) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

export function showScreen(name) {
  $('#screen-lobby').hidden = name !== 'lobby';
  $('#screen-room').hidden = name !== 'room';
}

// ── 成员列表 ──
export function renderMembers(members, meId) {
  const list = $('#member-list');
  $('#member-count').textContent = members.length;
  list.innerHTML = '';
  for (const m of members) {
    const li = document.createElement('li');
    li.className = 'member-item' + (m.id === meId ? ' me' : '');
    const avatar = document.createElement('span');
    avatar.className = 'member-avatar';
    avatar.textContent = (m.username || '?')[0].toUpperCase();
    const name = document.createElement('span');
    name.className = 'member-name';
    name.textContent = m.username + (m.id === meId ? '（我）' : '');
    li.append(avatar, name);
    if (m.share) {
      const badge = document.createElement('span');
      badge.className = 'share-badge';
      badge.textContent = '共享中';
      li.append(badge);
    }
    list.append(li);
  }
}

// ── 舞台渲染 ──
// views = { local: {stream, username} | null, remotes: [{id, username, stream}] }
// focused: 'local' 或 remote id 或 null
let onFocus = null;
export function setFocusHandler(fn) { onFocus = fn; }

export function renderStage(views, focused) {
  const main = $('#stage-main');
  const minis = $('#stage-minis');
  const all = [];
  if (views.local) all.push({ id: 'local', ...views.local });
  for (const r of views.remotes) all.push({ id: r.id, ...r });
  if (!all.length) {
    main.classList.add('empty');
    main.innerHTML = '<div class="empty-state">' +
      '<div class="empty-icon">🖥️</div>' +
      '<p class="empty-title">还没有人共享屏幕</p>' +
      '<p class="dim">点击下方「共享屏幕」，让大家一起看</p>' +
      '<button id="btn-empty-share" class="btn primary big">共享屏幕</button>' +
      '</div>';
    minis.innerHTML = '';
    return;
  }
  main.classList.remove('empty');
  const target = focused && all.some((v) => v.id === focused) ? focused : all[0].id;
  const mainView = all.find((v) => v.id === target);
  const others = all.filter((v) => v.id !== target);

  main.innerHTML = '';
  main.append(tile(mainView, true));

  minis.innerHTML = '';
  for (const v of others) {
    const t = tile(v, false);
    t.dataset.id = v.id;
    t.addEventListener('click', () => onFocus?.(v.id));
    minis.append(t);
  }
}

const videoCache = new Map(); // id -> HTMLVideoElement（复用避免闪烁）
function tile(view, isMain) {
  const wrap = document.createElement('div');
  wrap.className = 'video-tile' + (isMain ? ' main' : '');
  let video = videoCache.get(view.id);
  if (!video) {
    video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    videoCache.set(view.id, video);
  }
  if (video.srcObject !== view.stream) video.srcObject = view.stream;
  video.play().catch(() => { /* 自动播放被拦时用户点击后重试 */ });
  wrap.append(video);
  const tag = document.createElement('div');
  tag.className = 'tile-tag';
  tag.textContent = view.id === 'local'
    ? '你正在共享 · ' + (view.username || '')
    : (view.username || '') + ' 的屏幕';
  wrap.append(tag);
  return wrap;
}

export function clearVideos() {
  for (const v of videoCache.values()) { v.srcObject = null; v.remove(); }
  videoCache.clear();
}

// ── 弹窗 ──
export function openModal(id) { $(id).hidden = false; }
export function closeModal(id) { $(id).hidden = true; }

// ── 帮助下拉 ──
const menuHandlers = {};
export function setMenuHandler(action, fn) { menuHandlers[action] = fn; }

export function wireHelpDropdown() {
  const wrap = document.querySelector('.dropdown-wrap');
  const btn = $('#btn-help');
  const menu = $('#menu-help');
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
  });
  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) menu.hidden = true;
  });
  menu.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    menu.hidden = true;
    const fn = menuHandlers[b.dataset.action];
    fn?.();
  });
}