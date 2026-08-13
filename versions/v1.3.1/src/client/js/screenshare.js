// screenshare.js — 屏幕共享采集 + 画质预设（WebRTC 最佳实践）
// 设计要点：
//  - 画质预设：文字优先=高分辨率低帧率（文字清晰）；流畅=高帧率（游戏/视频）
//  - contentHint: detail/motion 让编码器按屏幕内容优化
//  - 拥塞时「保持分辨率、丢弃帧」而非降分辨率（LiveKit 实测：文字清晰优先）
//  - 码率上限：mesh 下每名观看者各占一份上行，限制码率避免 3~4 人时上行爆表
export const PRESETS = {
  '1080p60': { label: '1080p 60fps', width: 1920, height: 1080, fps: 60, bitrate: 8000, hint: 'motion' },
  '1080p30': { label: '1080p 30fps', width: 1920, height: 1080, fps: 30, bitrate: 6000, hint: 'detail' },
  '720p60':  { label: '720p 60fps',  width: 1280, height: 720,  fps: 60, bitrate: 5000, hint: 'motion' },
  '720p30':  { label: '720p 30fps',  width: 1280, height: 720,  fps: 30, bitrate: 4000, hint: 'detail' },
  '480p30':  { label: '480p 30fps',  width: 854,  height: 480,  fps: 30, bitrate: 2500, hint: 'detail' },
};

export const DEFAULT_PRESET = '1080p60';

// 启动屏幕共享（含可选的系统声音）
export async function startScreenShare({ presetKey = DEFAULT_PRESET, withAudio = false } = {}) {
  const preset = PRESETS[presetKey] || PRESETS[DEFAULT_PRESET];
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: {
      width: { ideal: preset.width, max: preset.width },
      height: { ideal: preset.height, max: preset.height },
      frameRate: { ideal: preset.fps, max: preset.fps },
    },
    audio: withAudio,
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
      await track.applyConstraints({
        width: { ideal: preset.width, max: preset.width },
        height: { ideal: preset.height, max: preset.height },
        frameRate: { ideal: preset.fps, max: preset.fps },
      });
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