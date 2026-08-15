// webrtc.js — mesh 连接管理（GinyScreen v1.4.0）
// 设计：每个对端按「方向 + 类型」拆成独立单向连接，避免 SDP m-line 匹配/协商冲突：
//   - inPcs / outPcs       : 屏幕共享（我观看 / 我发送）
//   - voiceInPcs / voiceOutPcs : 语音（对方麦克风→我 / 我麦克风→对方）
// 这样「同时互相共享」「共享停止但语音保持」「临时停止共享再恢复」都不会破坏协商状态。
// 信令在 SDP/ICE 上带 channel 字段（'screen' | 'voice'）区分两种连接。
import { applySendParams } from './screenshare.js';

export class MeshManager {
  constructor({ socket, iceServers, myId, onRemoteStream, onPeerState }) {
    this.socket = socket;
    this.iceServers = iceServers;
    this.myId = myId;
    this.onRemoteStream = onRemoteStream;
    this.onPeerState = onPeerState;
    this.inPcs = new Map();        // peerId -> PC（我观看对方屏幕）
    this.outPcs = new Map();       // peerId -> PC（我的屏幕发给对方）
    this.voiceInPcs = new Map();   // peerId -> PC（对方语音→我）
    this.voiceOutPcs = new Map();  // peerId -> PC（我的语音→对方）
    this.localStream = null;       // 屏幕共享流
    this.micStream = null;         // 麦克风流（增益处理后）
  }

  _isMe(id) {
    return typeof this.myId === 'function' ? this.myId() === id : this.myId === id;
  }

  outPcsList() {
    return [...this.outPcs.values()];
  }

  // ── 信令入口 ──
  async handleSignal(from, data) {
    try {
      const channel = data.channel === 'voice' ? 'voice' : 'screen';
      if (data.type === 'offer') {
        await this._answerOffer(from, data, channel);
      } else if (data.type === 'answer') {
        const pc = (channel === 'voice' ? this.voiceOutPcs : this.outPcs).get(from);
        if (pc && pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
        }
      } else if (data.type === 'ice') {
        const map = channel === 'voice'
          ? (this.voiceOutPcs.has(from) ? this.voiceOutPcs : this.voiceInPcs)
          : (this.outPcs.has(from) ? this.outPcs : this.inPcs);
        const pc = map.get(from);
        if (pc && data.candidate) {
          try { await pc.addIceCandidate(data.candidate); } catch { /* 过期的候选忽略 */ }
        }
      }
    } catch (err) {
      console.error('[webrtc] handleSignal 失败', err);
    }
  }

  // 收到对方 offer → 创建/复用对应方向的 PC 并 answer
  async _answerOffer(from, data, channel) {
    const isVoice = channel === 'voice';
    const map = isVoice ? this.voiceInPcs : this.inPcs;
    let pc = map.get(from);
    if (!pc) {
      pc = new RTCPeerConnection({ iceServers: this.iceServers });
      map.set(from, pc);
      pc.ontrack = (e) => {
        const stream = e.streams?.[0] || new MediaStream([e.track]);
        this.onRemoteStream?.(from, stream, channel);
      };
      pc.onconnectionstatechange = () => this.onPeerState?.(from, pc.connectionState, channel);
    }
    // 协商冲突（双方同时发 offer）时先回滚本地 offer
    if (pc.signalingState !== 'stable') {
      try { await pc.setLocalDescription({ type: 'rollback' }); } catch { /* 忽略 */ }
    }
    await pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    this.socket.signal(from, { type: 'answer', channel, sdp: pc.localDescription.sdp });
  }

  // ── 屏幕共享（发送端）──
  startSharing(stream, members) {
    this.localStream = stream;
    for (const m of members) {
      if (!this._isMe(m.id)) this._outTo(m.id, 'screen');
    }
  }

  // 新成员加入时：我正在共享 → 发起屏幕连接；我开着麦 → 发起语音连接
  peerJoined(member) {
    if (this._isMe(member.id)) return;
    if (this.localStream) this._outTo(member.id, 'screen');
    if (this.micStream) this._outTo(member.id, 'voice');
  }

  async _outTo(peerId, channel = 'screen') {
    const isVoice = channel === 'voice';
    const pcMap = isVoice ? this.voiceOutPcs : this.outPcs;
    const stream = isVoice ? this.micStream : this.localStream;
    let pc = pcMap.get(peerId);
    if (!pc) {
      pc = new RTCPeerConnection({ iceServers: this.iceServers });
      pcMap.set(peerId, pc);
      pc.onicecandidate = (e) => {
        if (e.candidate) this.socket.signal(peerId, { type: 'ice', channel, candidate: e.candidate.toJSON() });
      };
      pc.onconnectionstatechange = () => this.onPeerState?.(peerId, pc.connectionState, channel);
      pc.onnegotiationneeded = async () => {
        try {
          await pc.setLocalDescription(await pc.createOffer());
          this.socket.signal(peerId, { type: 'offer', channel, sdp: pc.localDescription.sdp });
          if (!isVoice) applySendParams(pc, this._preset);
        } catch { /* 冲突时等待对方，忽略 */ }
      };
    }
    for (const track of stream.getTracks()) {
      if (!pc.getSenders().some((s) => s.track === track)) pc.addTrack(track, stream);
    }
  }

  // 共享中切换画质
  applyPresetToAll(preset) {
    this._preset = preset;
    for (const pc of this.outPcs.values()) applySendParams(pc, preset);
  }

  // 停止共享：关闭屏幕出站连接（语音不受影响）
  stopSharing() {
    const stream = this.localStream;
    this.localStream = null;
    for (const [peerId, pc] of this.outPcs) {
      try { pc.close(); } catch { /* 忽略 */ }
      this.outPcs.delete(peerId);
    }
    stream?.getTracks().forEach((t) => {
      try { t.stop(); } catch { /* 忽略 */ }
    });
  }

  // ── 语音 ──
  startMic(stream, members) {
    this.micStream = stream;
    for (const m of members) {
      if (!this._isMe(m.id)) this._outTo(m.id, 'voice');
    }
  }

  stopMic() {
    this.micStream = null;
    for (const [peerId, pc] of this.voiceOutPcs) {
      try { pc.close(); } catch { /* 忽略 */ }
      this.voiceOutPcs.delete(peerId);
    }
  }

  // 对方停止共享 / 离开 → 关闭对应的入站连接（含语音）
  closeIncoming(peerId) {
    for (const map of [this.inPcs, this.voiceInPcs]) {
      const pc = map.get(peerId);
      if (pc) {
        try { pc.close(); } catch { /* 忽略 */ }
        map.delete(peerId);
      }
    }
  }

  closeAll() {
    for (const map of [this.inPcs, this.outPcs, this.voiceInPcs, this.voiceOutPcs]) {
      for (const pc of map.values()) {
        try { pc.close(); } catch { /* 忽略 */ }
      }
      map.clear();
    }
    for (const stream of [this.localStream, this.micStream]) {
      if (stream) stream.getTracks().forEach((t) => {
        try { t.stop(); } catch { /* 忽略 */ }
      });
    }
    this.localStream = null;
    this.micStream = null;
  }
}
