// screenshare.js — 屏幕共享采集 + 画质预设（WebRTC 最佳实践）
// 设计要点：
//  - 画质预设：文字优先=高分辨率低帧率（文字清晰）；流畅=高帧率（游戏/视频）
//  - contentHint: detail/motion 让编码器按屏幕内容优化
//  - 拥塞时「保持分辨率、丢弃帧」而非降分辨率（LiveKit 实测：文字清晰优先）
//  - 码率上限：mesh 下每名观看者各占一份上行，限制码率避免 3~4 人时上行爆表
export const PRESETS = {
  detail:   { label: '文字优先', fps: 8,  bitrate: 2500, hint: 'detail' },
  balanced: { label: '平衡',     fps: 15, bitrate: 3500, hint: 'detail' },
  motion:   { label: '流畅',     fps: 30, bitrate: 5000, hint: 'motion' },
};

export const DEFAULT_PRESET = 'balanced';

// 启动屏幕共享（含可选的系统声音）
export async function startScreenShare({ presetKey = DEFAULT_PRESET, withAudio = false } = {}) {
  const preset = PRESETS[presetKey] || PRESETS[DEFAULT_PRESET];
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: {
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: preset.fps, max: preset.fps },
    },
    audio: withAudio
      ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      : false,
    selfBrowserSurface: 'exclude',
    surfaceSwitching: 'include',
  });
  for (const track of stream.getVideoTracks()) {
    track.contentHint = preset.hint;
    track.addEventListener('ended', () => {
      // 用户在系统选择器里点了「停止共享」→ 由上层处理
      stream.dispatchEvent(new Event('userstopped'));
    });
  }
  return { stream, preset };
}

// 共享中切换画质：实时改帧率约束 + 更新发送端参数（上行码率/降级策略）
export async function applyPreset(stream, pcList, presetKey) {
  const preset = PRESETS[presetKey] || PRESETS[DEFAULT_PRESET];
  for (const track of stream.getVideoTracks()) {
    track.contentHint = preset.hint;
    try {
      await track.applyConstraints({ frameRate: { ideal: preset.fps, max: preset.fps } });
    } catch { /* 采集端不支持实时改帧率则忽略 */ }
  }
  for (const pc of pcList) applySendParams(pc, preset);
  return preset;
}

// 对一条 PeerConnection 的所有发送器应用画质参数
export function applySendParams(pc, preset) {
  for (const sender of pc.getSenders()) {
    if (sender.track?.kind !== 'video') continue;
    try {
      const params = sender.getParameters();
      params.degradationPreference = preset.hint === 'motion' ? 'maintain-framerate' : 'maintain-resolution';
      if (params.encodings?.length) {
        params.encodings[0].maxBitrate = preset.bitrate * 1000;
        params.encodings[0].maxFramerate = preset.fps;
      }
      sender.setParameters(params).catch(() => {});
    } catch { /* 部分浏览器不允许改参数则忽略 */ }
  }
}