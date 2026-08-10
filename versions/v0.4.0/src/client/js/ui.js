// ui.js — DOM 渲染
export const ui = {
  $: (sel) => document.querySelector(sel),

  screen(name) {
    this.$('#screen-lobby').hidden = name !== 'lobby';
    this.$('#screen-app').hidden = name !== 'app';
  },

  // ---------- 房间 ----------
  renderRoom(state) {
    this.roomState = state;
    this.$('#room-code').innerHTML = `房间号 <b>${state.id}</b>`;
    this._renderChannels(state);
    this._renderMembers(state);
  },

  _renderChannels(state) {
    const list = this.$('#channel-list');
    list.innerHTML = '';
    for (const ch of state.channels) {
      const item = document.createElement('div');
      item.className = 'channel-item';
      item.dataset.channelId = ch.id;
      const isCurrent = this.currentChannel === ch.id;
      if (isCurrent) item.classList.add('active');
      item.innerHTML = `
        <span class="channel-icon">${ch.type === 'voice' ? '🔊' : '💬'}</span>
        <span class="channel-name"></span>
        <span class="count">${ch.members.length}</span>`;
      item.querySelector('.channel-name').textContent = ch.name;
      item.addEventListener('click', () => this.onChannelClick?.(ch.id, isCurrent));
      list.appendChild(item);
    }
  },

  _renderMembers(state) {
    const panel = this.$('#member-list');
    panel.innerHTML = '';
    const me = state.users.find((u) => u.id === this.meId);
    this.$('#current-channel-name').textContent = this.currentChannel
      ? (state.channels.find((c) => c.id === this.currentChannel)?.name ?? '未知频道')
      : '未加入频道';
    this.$('#channel-member-count').textContent = '';

    if (!this.currentChannel) {
      const empty = document.createElement('div');
      empty.className = 'muted';
      empty.textContent = '点击左侧频道加入语音';
      panel.appendChild(empty);
      return;
    }

    const members = state.users.filter((u) => u.channelId === this.currentChannel);
    this.$('#channel-member-count').textContent = `${members.length} 人在线`;

    for (const u of members) {
      const div = document.createElement('div');
      div.className = 'member';
      div.dataset.userId = u.id;
      const isMe = u.id === this.meId;
      if (isMe && me?.deaf) div.classList.add('deaf');
      div.innerHTML = `
        <div class="avatar"></div>
        <span class="uname"></span>
        <span class="badges">
          <span class="badge-mic">${u.mic && !u.deaf ? '🎤' : '🔇'}</span>
          <span class="badge-screen" ${u.screen ? '' : 'hidden'}>🖥️</span>
        </span>
        <span class="meter"><i></i></span>`;
      div.querySelector('.avatar').textContent = u.username.slice(0, 1).toUpperCase();
      div.querySelector('.uname').textContent = u.username + (isMe ? ' (我)' : '');
      panel.appendChild(div);
    }
  },

  // ---------- 说话状态 ----------
  setSpeaking(userId, speaking) {
    const el = document.querySelector(`.member[data-user-id="${CSS.escape(userId)}"]`);
    if (el) el.classList.toggle('speaking', speaking);
  },

  setMeter(userId, level) {
    const el = document.querySelector(`.member[data-user-id="${CSS.escape(userId)}"] .meter i`);
    if (el) el.style.width = `${Math.round(level * 100)}%`;
  },

  // ---------- 屏幕共享 ----------
  _screenTiles: new Map(),

  addScreenTile(userId, stream, username, { self = false } = {}) {
    const grid = this.$('#screen-grid');
    if (this._screenTiles.has(userId)) {
      const old = this._screenTiles.get(userId);
      if (old.video.srcObject === stream) return;
    }
    const tile = document.createElement('div');
    tile.className = 'screen-tile';
    tile.dataset.userId = userId;
    const video = document.createElement('video');
    video.autoplay = true;
    if (!self) video.muted = true; // 自己看的本地预览不用回声
    video.srcObject = stream;
    const label = document.createElement('div');
    label.className = 'tile-label';
    label.textContent = username + (self ? ' (你的屏幕)' : ' 的屏幕');
    tile.append(video, label);
    grid.appendChild(tile);
    this._screenTiles.set(userId, { tile, video });
    video.play().catch(() => {});
  },

  removeScreenTile(userId) {
    const entry = this._screenTiles.get(userId);
    if (entry) {
      entry.tile.remove();
      this._screenTiles.delete(userId);
    }
  },

  // ---------- 聊天 ----------
  addChat(msg) {
    const box = this.$('#chat-messages');
    const div = document.createElement('div');
    div.className = 'chat-msg' + (msg.fromId === this.meId ? ' self' : '');
    const time = new Date(msg.ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    div.innerHTML = `<span class="time">${time}</span><span class="who"></span>`;
    const who = div.querySelector('.who');
    who.textContent = msg.from;
    div.appendChild(document.createTextNode(msg.text));
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  },

  // ---------- 通用 ----------
  toast(text, ms = 3000) {
    const t = this.$('#toast');
    t.textContent = text;
    t.hidden = false;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { t.hidden = true; }, ms);
  },
};
