// audio.js — 麦克风采集 / 增益控制 / VAD 语音检测 / 音量表
// 思路参考: Mumble 的 VAD 与 Discord 的音量指示器
// 关键设计: outStream(MediaStreamDestination) 生命周期固定，
// 切换设备/重初始化时只换输入源，已建立的 WebRTC 连接无需重协商

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.dest = null;
    this.micStream = null;
    this.outStream = null;   // 经 gain 处理后的流，发送给对端（生命周期固定）
    this.gainNode = null;
    this.analyser = null;    // 本地 VAD + 音量表
    this.vadThreshold = 0.02;
    this.vadStopThreshold = 0.014;
    this.vadHoldMs = 250;
    this.speaking = false;
    this.vadRunning = false;
    this._vadRaf = 0;
    this._holdTimer = 0;
    this._sourceNodes = new Set();
    this._currentSource = null;
    this._deviceId = 'default';
    this._noiseSuppression = true;
    this._onSpeech = null;
  }

  async init({ deviceId = 'default', noiseSuppression = true } = {}) {
    this._deviceId = deviceId;
    this._noiseSuppression = noiseSuppression;
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.dest = this.ctx.createMediaStreamDestination();
      this.outStream = this.dest.stream;
      this.gainNode = this.ctx.createGain();
      this.gainNode.gain.value = 0;
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.2;
      this.gainNode.connect(this.analyser);
      this.gainNode.connect(this.dest);
    }
    await this._acquire();
    if (this._currentSource) this._currentSource.disconnect();
    this._currentSource = this.ctx.createMediaStreamSource(this.micStream);
    this._sourceNodes.add(this._currentSource);
    this._currentSource.connect(this.gainNode);
    await this.ctx.resume();
  }

  async _acquire() {
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: this._deviceId === 'default' ? undefined : { exact: this._deviceId },
        echoCancellation: this._noiseSuppression,
        noiseSuppression: this._noiseSuppression,
        autoGainControl: this._noiseSuppression,
        channelCount: 1,
      },
    });
  }

  setMuted(muted) {
    if (!this.gainNode) return;
    const target = muted ? 0 : 1;
    const now = this.ctx.currentTime;
    this.gainNode.gain.cancelScheduledValues(now);
    this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
    this.gainNode.gain.linearRampToValueAtTime(target, now + 0.02);
  }

  // ---------- 设备枚举 ----------
  async refreshDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === 'audioinput');
  }

  // ---------- VAD ----------
  setVadThreshold(t) {
    this.vadThreshold = t;
    this.vadStopThreshold = t * 0.7;
  }

  startVAD(onSpeech) {
    this._onSpeech = onSpeech;
    if (this.vadRunning || !this.analyser) return;
    this.vadRunning = true;
    this._vadLoop();
  }

  stopVAD() {
    this.vadRunning = false;
    cancelAnimationFrame(this._vadRaf);
    clearTimeout(this._holdTimer);
    if (this.speaking) {
      this.speaking = false;
      this._onSpeech?.(false);
    }
  }

  _vadLoop() {
    if (!this.vadRunning || !this.analyser) return;
    const rms = this._rms(this.analyser);
    if (!this.speaking && rms > this.vadThreshold) {
      this.speaking = true;
      this._onSpeech?.(true);
    } else if (this.speaking && rms < this.vadStopThreshold) {
      clearTimeout(this._holdTimer);
      this._holdTimer = setTimeout(() => {
        if (this.speaking) {
          this.speaking = false;
          this._onSpeech?.(false);
        }
      }, this.vadHoldMs);
    }
    this._vadRaf = requestAnimationFrame(() => this._vadLoop());
  }

  // 本地音量表 (0-1)
  startLocalMeter(cb) {
    this._startMeter(this.analyser, cb);
  }

  // 远端音量表：为每个远端流建立独立 Analyser
  startStreamMeter(stream, cb) {
    const src = this.ctx.createMediaStreamSource(stream);
    this._sourceNodes.add(src);
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.3;
    src.connect(analyser);
    this._startMeter(analyser, cb);
  }

  _startMeter(analyser, cb) {
    const loop = () => {
      const rms = this._rms(analyser);
      // 常见说话音量 rms 0.02~0.4，映射到 0-1
      cb(Math.min(1, rms * 8));
      requestAnimationFrame(loop);
    };
    loop();
  }

  _rms(analyser) {
    const data = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    return Math.sqrt(sum / data.length);
  }

  dispose() {
    this.stopVAD();
    this._sourceNodes.forEach((n) => n.disconnect());
    this._sourceNodes.clear();
    if (this.micStream) this.micStream.getTracks().forEach((t) => t.stop());
    if (this.ctx && this.ctx.state !== 'closed') this.ctx.close();
    this.ctx = null;
    this.dest = null;
    this.micStream = null;
    this.outStream = null;
  }
}
