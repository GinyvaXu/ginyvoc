// ui.js — DOM 工具 + 房间渲染（成员列表 / 舞台 / 语音面板 / 弹窗 / toast）
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
  if (!list) return;
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
    if (m.voice) {
      const badge = document.createElement('span');
      badge.className = 'voice-badge';
      badge.textContent = '🎙️';
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
const DEFAULT_ASPECT = 'auto';

export function applyTileAspect(video, wrap, mode) {
  if (!video || !wrap) return;
  const modes = ['auto', '169', 'original', 'stretch'];
  wrap.classList.remove(...modes.map((m) => 'aspect-' + m));
  wrap.classList.add('aspect-' + mode);
  if (mode === 'stretch') video.style.objectFit = 'fill';
  else if (mode === 'original') video.style.objectFit = 'none';
  else video.style.objectFit = 'contain';
  if (mode === '169') {
    wrap.classList.add('ratio-fixed');
  } else {
    wrap.classList.remove('ratio-fixed');
  }
}

function tile(view, isMain) {
  const wrap = document.createElement('div');
  wrap.className = 'video-tile' + (isMain ? ' main' : '');
  let video = videoCache.get(view.id);
  if (!video) {
    video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.volume = view.id === 'local' ? 0 : 1; // 本地预览默认静音防回声，远端默认 100%
    videoCache.set(view.id, video);
  }
  if (video.srcObject !== view.stream) video.srcObject = view.stream;
  video.play().catch(() => { /* 自动播放被拦时用户点击后重试 */ });
  applyTileAspect(video, wrap, DEFAULT_ASPECT);
  wrap.append(video);

  const tag = document.createElement('div');
  tag.className = 'tile-tag';
  tag.textContent = view.id === 'local'
    ? '你正在共享 · ' + (view.username || '')
    : (view.username || '') + ' 的屏幕';
  wrap.append(tag);

  if (isMain) {
    // 主画面工具栏：画面比例 / 画中画 / 全屏（仅观看端显示，本地预览只给画质）
    const bar = document.createElement('div');
    bar.className = 'tile-toolbar';
    const aspect = document.createElement('select');
    aspect.className = 'aspect-select';
    aspect.title = '画面比例';
    aspect.innerHTML =
      '<option value="auto" selected>画面：自适应</option>' +
      '<option value="169">画面：16:9</option>' +
      '<option value="original">画面：原始</option>' +
      '<option value="stretch">画面：拉伸</option>';
    aspect.addEventListener('click', (e) => e.stopPropagation());
    aspect.addEventListener('change', () => applyTileAspect(video, wrap, aspect.value));
    bar.append(aspect);

    if (view.id !== 'local') {
      const pipBtn = document.createElement('button');
      pipBtn.type = 'button';
      pipBtn.className = 'tile-btn';
      pipBtn.textContent = '⧉ 画中画';
      pipBtn.title = '弹出为系统小窗（可置顶在其他窗口上）';
      pipBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          if (document.pictureInPictureElement) await document.exitPictureInPicture();
          else await video.requestPictureInPicture();
        } catch (err) {
          toast('画中画不可用：' + (err?.message || err));
        }
      });
      bar.append(pipBtn);

      const fsBtn = document.createElement('button');
      fsBtn.type = 'button';
      fsBtn.className = 'tile-btn';
      fsBtn.textContent = '⛶ 全屏';
      fsBtn.title = '全屏观看（Esc 退出）';
      fsBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          if (document.fullscreenElement) await document.exitFullscreen();
          else await wrap.requestFullscreen();
        } catch (err) {
          toast('全屏不可用：' + (err?.message || err));
        }
      });
      bar.append(fsBtn);
    }
    wrap.append(bar);
  }

  // 音量滑块：共享人与观看者各自独立调节
  const vol = document.createElement('div');
  vol.className = 'tile-volume';
  const icon = document.createElement('span');
  icon.className = 'vol-icon';
  icon.textContent = '🔊';
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '150';
  slider.value = String(Math.round(video.volume * 100));
  slider.title = view.id === 'local' ? '本地预览音量（不影响他人）' : '收听音量';
  slider.addEventListener('input', () => { video.volume = Number(slider.value) / 100; });
  slider.addEventListener('click', (e) => e.stopPropagation());
  vol.append(icon, slider);
  wrap.append(vol);
  return wrap;
}

export function clearVideos() {
  for (const v of videoCache.values()) { v.srcObject = null; v.remove(); }
  videoCache.clear();
}

// ── 语音面板 ──
// items: [{ id, username, isMe, micOn, talking, hasStream }]
let onVoiceVolume = null;
export function setVoiceVolumeHandler(fn) { onVoiceVolume = fn; }

export function renderVoice(items) {
  const list = $('#voice-list');
  if (!list) return;
  list.innerHTML = '';
  for (const it of items) {
    const li = document.createElement('li');
    li.dataset.id = it.id;
    li.className = 'voice-item' + (it.isMe ? ' me' : '') + (it.talking ? ' talking' : '');
    const dot = document.createElement('span');
    dot.className = 'voice-dot ' + (it.micOn ? 'on' : 'off');
    const name = document.createElement('span');
    name.className = 'voice-name';
    name.textContent = it.username + (it.isMe ? '（我）' : '') + (it.micOn ? '' : ' · 静音');
    li.append(dot, name);
    if (!it.isMe && it.hasStream && it.micOn) {
      const vol = document.createElement('input');
      vol.type = 'range';
      vol.min = '0';
      vol.max = '150';
      vol.value = String(Math.round((it.volume ?? 1) * 100));
      vol.className = 'voice-vol';
      vol.title = it.username + ' 的声音大小';
      vol.addEventListener('input', () => onVoiceVolume?.(it.id, Number(vol.value) / 100));
      vol.addEventListener('click', (e) => e.stopPropagation());
      li.append(vol);
    }
    list.append(li);
  }
}

// ── 弹窗 ──
export function openModal(id) { $(id).hidden = false; }
export function closeModal(id) { $(id).hidden = true; }

// ── 帮助下拉 ──
const menuHandlers = {};
export function setMenuHandler(action, fn) { menuHandlers[action] = fn; }

// ── 共享源选择器（桌面版内置）──
let onPickSource = null;
export function setSourcePickHandler(fn) { onPickSource = fn; }
export function renderSourcePicker(list) {
  const grid = $('#source-picker-grid');
  if (!grid) return;
  grid.innerHTML = '';
  for (const s of list) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'source-card';
    const thumb = document.createElement('div');
    thumb.className = 'source-thumb';
    if (s.thumbnail) {
      const img = document.createElement('img');
      img.src = s.thumbnail;
      img.alt = '';
      thumb.append(img);
    } else {
      thumb.textContent = s.type === 'screen' ? '🖥️' : '🪟';
      thumb.classList.add('placeholder');
    }
    const name = document.createElement('span');
    name.className = 'source-name';
    name.textContent = s.name;
    const badge = document.createElement('span');
    badge.className = 'source-type';
    badge.textContent = s.type === 'screen' ? '屏幕' : '窗口';
    card.append(thumb, name, badge);
    card.addEventListener('click', () => onPickSource?.(s.id));
    grid.append(card);
  }
}

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
