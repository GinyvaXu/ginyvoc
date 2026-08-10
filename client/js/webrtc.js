// webrtc.js — P2P mesh 组网 (音频 + 屏幕共享)
// 参考: perfect negotiation 模式 (RFC 8829 / w3c webrtc-pc)
// 规模: 每个频道 mesh 全互联，适合 2~8 人开黑；更大规模可替换为 mediasoup/LiveKit SFU

export class PeerMesh {
  constructor({ userId, signaling, iceServers, audioStream,
                onPeerAudio, onPeerScreenAudio, onPeerScreen, onPeerScreenStop, onPeerState }) {
    this.userId = userId;
    this.signal = signaling;
    this.iceServers = iceServers;
    this.audioStream = audioStream;
    this.onPeerAudio = onPeerAudio;
    this.onPeerScreenAudio = onPeerScreenAudio;
    this.onPeerScreen = onPeerScreen;
    this.onPeerScreenStop = onPeerScreenStop;
    this.onPeerState = onPeerState;

    this.pcs = new Map();              // peerId -> RTCPeerConnection
    this.screenSenders = new Map();    // peerId -> RTCRtpSender (共享屏幕发送器)
    this.screenAudioSenders = new Map(); // peerId -> RTCRtpSender (共享系统声音发送器)
    this.screenStreamIds = new Set();  // 已收到的屏幕共享流 id（用于区分麦克风/系统声音）
    this.localScreenStream = null;
    this.makingOffer = false;
  }

  addPeer(peer) {
    if (this.pcs.has(peer.id)) return;
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.pcs.set(peer.id, pc);
    console.log('[mesh] addPeer', peer.id, peer.username);

    pc.onicecandidate = (e) => {
      if (e.candidate) this.signal.sendSignal(peer.id, { candidate: e.candidate.toJSON() });
    };

    pc.ontrack = (e) => {
      const stream = e.streams[0];
      if (!stream) return;
      if (e.track.kind === 'video') {
        // 视频轨 = 屏幕共享画面；记录流 id 供音频轨区分麦克风/系统声音
        this.screenStreamIds.add(stream.id);
        e.track.onended = () => this.onPeerScreenStop?.(peer.id);
        this.onPeerScreen?.(peer.id, stream);
      } else if (e.track.kind === 'audio') {
        // 麦克风流 vs 共享系统声音流：共享流必然同时带视频轨
        if (this.screenStreamIds.has(stream.id) || stream.getVideoTracks().length > 0) {
          this.onPeerScreenAudio?.(peer.id, stream);
        } else {
          this.onPeerAudio?.(peer.id, stream);
        }
      }
    };

    pc.onconnectionstatechange = () => {
      this.onPeerState?.(peer.id, pc.connectionState);
      console.log('[mesh] peer', peer.id, 'connection', pc.connectionState);
    };

    if (this.audioStream) {
      for (const track of this.audioStream.getTracks()) {
        pc.addTrack(track, this.audioStream);
      }
    }
    pc.onnegotiationneeded = () => this._negotiate(pc, peer.id);
  }

  // 音频流后置就绪时调用：为已建立的连接补充音轨（触发重协商）
  addAudioStream(stream) {
    if (!stream) return;
    this.audioStream = stream;
    for (const [peerId, pc] of this.pcs) {
      if (pc.signalingState !== 'stable') continue; // 等当前协商完成再补轨
      const hasAudio = pc.getSenders().some((s) => s.track?.kind === 'audio');
      if (!hasAudio) {
        for (const track of stream.getTracks()) pc.addTrack(track, stream);
      }
    }
  }

  async _negotiate(pc, peerId) {
    try {
      this.makingOffer = true;
      await pc.setLocalDescription();
      this.signal.sendSignal(peerId, { sdp: pc.localDescription });
    } catch (err) {
      console.error('[mesh] negotiate failed:', err);
    } finally {
      this.makingOffer = false;
    }
  }

  async handleSignal(from, data) {
    const pc = this.pcs.get(from);
    if (!pc) { console.log('[mesh] signal for unknown peer', from, data.sdp?.type || 'ice'); return; }
    try {
      if (data.candidate) {
        await pc.addIceCandidate(data.candidate);
        console.log('[mesh] ice', from);
        return;
      }
      const desc = data.sdp;
      if (!desc) return;

      const isOffer = desc.type === 'offer';
      const collision = isOffer && (this.makingOffer || pc.signalingState !== 'stable');
      if (collision) {
        if (!this._isPolite(from)) return; // 冲突时 impolite 方忽略
        await pc.setLocalDescription({ type: 'rollback' });
      }
      await pc.setRemoteDescription(desc);
      console.log('[mesh] setRemote', desc.type, from);

      if (isOffer) {
        await pc.setLocalDescription();
        this.signal.sendSignal(from, { sdp: pc.localDescription });
      }
    } catch (err) {
      console.error('[mesh] handleSignal failed:', err);
    }
  }

  _isPolite(peerId) {
    return this.userId < peerId; // id 字典序小的为 polite
  }

  // ---------- 屏幕共享 ----------
  async shareScreen(stream) {
    this.localScreenStream = stream;
    const track = stream.getVideoTracks()[0];
    if (track) {
      for (const [peerId, pc] of this.pcs) {
        const sender = this.screenSenders.get(peerId);
        if (sender) {
          await sender.replaceTrack(track); // 同类型替换，无需重协商
        } else {
          const s = pc.addTrack(track, stream); // 新增 transceiver，触发重协商
          this.screenSenders.set(peerId, s);
        }
      }
    }
    // 系统声音：单独一条音频轨（接收端独立 <audio> 播放，不参与说话检测）
    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) {
      for (const [peerId, pc] of this.pcs) {
        const sender = this.screenAudioSenders.get(peerId);
        if (sender) {
          await sender.replaceTrack(audioTrack);
        } else {
          const s = pc.addTrack(audioTrack, stream);
          this.screenAudioSenders.set(peerId, s);
        }
      }
    }
  }

  async stopScreen() {
    if (this.localScreenStream) {
      this.localScreenStream.getTracks().forEach((t) => t.stop());
      this.localScreenStream = null;
    }
    for (const [peerId, sender] of this.screenSenders) {
      try { await sender.replaceTrack(null); } catch { /* 对端可能已断开 */ }
      this.screenSenders.delete(peerId);
    }
    for (const [peerId, sender] of this.screenAudioSenders) {
      try { await sender.replaceTrack(null); } catch { /* 对端可能已断开 */ }
      this.screenAudioSenders.delete(peerId);
    }
  }

  removePeer(peerId) {
    const pc = this.pcs.get(peerId);
    if (pc) {
      try { pc.close(); } catch { /* noop */ }
      this.pcs.delete(peerId);
    }
    this.screenSenders.delete(peerId);
    this.screenAudioSenders.delete(peerId);
  }

  closeAll() {
    for (const id of [...this.pcs.keys()]) this.removePeer(id);
    if (this.localScreenStream) {
      this.localScreenStream.getTracks().forEach((t) => t.stop());
      this.localScreenStream = null;
    }
  }

  peerCount() { return this.pcs.size; }
}



