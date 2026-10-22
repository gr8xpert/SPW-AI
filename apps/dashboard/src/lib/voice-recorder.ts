// Records an agent's voice note and hands back a small WAV the API can pass
// to an audio model. Browsers record in their own compressed formats (WebM/
// Opus, MP4/AAC) that not every model reads, so the recording is decoded and
// re-encoded as 16 kHz mono PCM (about 32 KB a second). Same encoding as the
// widget's voice search (apps/widget/src/core/voice-recorder.ts); the two apps
// don't share browser code. No silence stop here: an agent pauses while
// thinking, so the note runs until Stop or the time limit.

const TARGET_RATE = 16_000;
export const MAX_NOTE_MS = 30_000;

type AudioCtor = typeof AudioContext;

function audioContextCtor(): AudioCtor | null {
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return w.AudioContext || w.webkitAudioContext || null;
}

/** Whether this browser can record at all (needs HTTPS and a microphone API). */
export function voiceSupported(): boolean {
  return typeof window !== 'undefined'
    && window.isSecureContext
    && !!navigator.mediaDevices?.getUserMedia
    && typeof MediaRecorder !== 'undefined'
    && !!audioContextCtor();
}

export interface Recording {
  /** Resolves with the WAV once recording ends (stop() or the time limit). */
  done: Promise<Blob>;
  stop(): void;
  cancel(): void;
}

/** Asks for the microphone and starts recording. Rejects if access is refused. */
export async function startRecording(maxMs = MAX_NOTE_MS): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });
  const Ctx = audioContextCtor()!;
  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(stream);
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  let cancelled = false;

  const cleanup = () => {
    clearTimeout(limit);
    stream.getTracks().forEach((t) => t.stop());
  };
  const stop = () => { if (recorder.state === 'recording') recorder.stop(); };
  const limit = setTimeout(stop, maxMs);

  const done = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = async () => {
      cleanup();
      if (cancelled) { reject(new Error('cancelled')); return; }
      try {
        const recorded = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        resolve(await toWav(recorded, Ctx, maxMs / 1000));
      } catch (err) {
        reject(err);
      }
    };
    recorder.onerror = () => { cleanup(); reject(new Error('recording failed')); };
  });

  recorder.start();
  return {
    done,
    stop,
    cancel: () => { cancelled = true; stop(); },
  };
}

async function toWav(recorded: Blob, Ctx: AudioCtor, maxSeconds: number): Promise<Blob> {
  const ctx = new Ctx();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(await recorded.arrayBuffer());
  } finally {
    void ctx.close().catch(() => undefined);
  }
  // Downmix and resample in one pass; never longer than the limit.
  const length = Math.max(1, Math.ceil(Math.min(decoded.duration, maxSeconds) * TARGET_RATE));
  const offline = new OfflineAudioContext(1, length, TARGET_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const pcm = (await offline.startRendering()).getChannelData(0);
  return new Blob([encodeWav(pcm, TARGET_RATE)], { type: 'audio/wav' });
}

function encodeWav(pcm: Float32Array, rate: number): ArrayBuffer {
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const v = new DataView(buf);
  const text = (at: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i)); };
  text(0, 'RIFF'); v.setUint32(4, 36 + pcm.length * 2, true); text(8, 'WAVE');
  text(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  text(36, 'data'); v.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buf;
}
