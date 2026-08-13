// webrtc.js — mesh 连接管理（GinyScreen）
// 设计：每个对端最多两条单向连接，避免 SDP m-line 匹配/协商冲突：
//   - inPcs : 我观看对方共享（对方 offer → 我 answer，recvonly）
//   - outPcs: 我共享给对方（我 addTrack + offer，sendonly）
// 这样「同时互相共享」「临时停止共享再恢复」都不会破坏协商状态。
import { applySendParams } from './screenshare.js';

export class MeshManager {
  constructor({ socket, iceServers, myId, onRemoteStream, onPeerState }) {
    this.socket = socket;
    this.iceServers = iceServers;
    this.myId = myId;
    this.onRemoteStream = onRemoteStream;
    this.onPeerState = onPeerState;
    this.inPcs = new Map();   // peerId -> PC（我观看对方）
    this.outPcs = new Map();  // peerId -> PC（我共享给对方）
    this.localStream = null;
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
      if (data.type === 'offer') {
        await this._answerOffer(from, data);
      } else if (data.type === 'answer') {
        const pc = this.outPcs.get(from);
        if (pc && pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
        }
      } else if (data.type === 'ice') {
        const pc = this.outPcs.get(from) || this.inPcs.get(from);
        if (pc && data.candidate) {
          try { await pc.addIceCandidate(data.candidate); } catch { /* 过期的候选忽略 */ }
        }
      }
    } catch (err) {
      console.error('[webrtc] handleSignal 失败', err);
    }
  }

  // 收到对方共享 offer → 创建/复用 inPc 并 answer（recvonly）
  async _answerOffer(from, data) {
    let pc = this.inPcs.get(from);
    if (!pc) {
      pc = new RTCPeerConnection({ iceServers: this.iceServers });
      this.inPcs.set(from, pc);
      pc.ontrack = (e) => {
        const stream = e.streams?.[0] || new MediaStream([e.track]);
        this.onRemoteStream?.(from, stream);
      };
      pc.onconnectionstatechange = () => this.onPeerState?.(from, pc.connectionState);
    }
    // 协商冲突（双方同时发 offer）时先回滚本地 offer
    if (pc.signalingState !== 'stable') {
      try { await pc.setLocalDescription({ type: 'rollback' }); } catch { /* 忽略 */ }
    }
    await pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    this.socket.signal(from, { type: 'answer', sdp: pc.localDescription.sdp });
  }

  // ── 共享端 ──
  startSharing(stream, members) {
    this.localStream = stream;
    for (const m of members) {
      if (!this._isMe(m.id)) this._outTo(m.id);
    }
  }

  // 新成员加入时，若我正在共享 → 向其发起共享连接
  peerJoined(member) {
    if (this.localStream && !this._isMe(member.id)) this._outTo(member.id);
  }

  async _outTo(peerId) {
    let pc = this.outPcs.get(peerId);
    if (!pc) {
      pc = new RTCPeerConnection({ iceServers: this.iceServers });
      this.outPcs.set(peerId, pc);
      pc.onicecandidate = (e) => {
        if (e.candidate) this.socket.signal(peerId, { type: 'ice', candidate: e.candidate.toJSON() });
      };
      pc.onconnectionstatechange = () => this.onPeerState?.(peerId, pc.connectionState);
      pc.onnegotiationneeded = async () => {
        try {
          await pc.setLocalDescription(await pc.createOffer());
          this.socket.signal(peerId, { type: 'offer', sdp: pc.localDescription.sdp });
          applySendParams(pc, this._preset);
        } catch { /* 冲突时等待对方，忽略 */ }
      };
    }
    for (const track of this.localStream.getTracks()) pc.addTrack(track, this.localStream);
  }

  // 共享中切换画质
  applyPresetToAll(preset) {
    this._preset = preset;
    for (const pc of this.outPcs.values()) applySendParams(pc, preset);
  }

  // 停止共享：关闭所有出站连接（观看侧会收到 share:update 清理画面）
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

  // 对方停止共享 / 离开 → 关闭对应的入站连接
  closeIncoming(peerId) {
    const pc = this.inPcs.get(peerId);
    if (pc) {
      try { pc.close(); } catch { /* 忽略 */ }
      this.inPcs.delete(peerId);
    }
  }

  closeAll() {
    for (const pc of [...this.inPcs.values(), ...this.outPcs.values()]) {
      try { pc.close(); } catch { /* 忽略 */ }
    }
    this.inPcs.clear();
    this.outPcs.clear();
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => {
        try { t.stop(); } catch { /* 忽略 */ }
      });
      this.localStream = null;
    }
  }
}