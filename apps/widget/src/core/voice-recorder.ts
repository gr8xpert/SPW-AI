// Records a spoken search and hands back a small WAV the API can pass to an
// audio model. Browsers record in their own compressed formats (WebM/Opus in
// Chrome and Firefox, MP4/AAC in Safari) which not every model reads, so the
// recording is decoded and re-encoded as 16 kHz mono PCM — about 32 KB a
// second, the format every audio model accepts.

const TARGET_RATE = 16_000;
export const MAX_RECORD_MS = 15_000;
// Stop on its own once the visitor has said something and then gone quiet.
const SILENCE_MS = 1_600;
const SPEECH_RMS = 0.03;

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
  /** Resolves with the WAV once recording ends (by stop(), silence or the time limit). */
  done: Promise<Blob>;
  stop(): void;
  cancel(): void;
}

/** Asks for the microphone and starts recording. Rejects if access is refused. */
export async function startRecording(): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });
  const Ctx = audioContextCtor()!;
  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(stream);
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

  // Level meter for the silence stop.
  const meterCtx = new Ctx();
  const analyser = meterCtx.createAnalyser();
  analyser.fftSize = 1024;
  meterCtx.createMediaStreamSource(stream).connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  let heardSpeech = false;
  let quietSince = 0;
  let cancelled = false;

  const cleanup = () => {
    clearInterval(meter);
    clearTimeout(limit);
    stream.getTracks().forEach((t) => t.stop());
    void meterCtx.close().catch(() => undefined);
  };
  const stop = () => { if (recorder.state === 'recording') recorder.stop(); };

  const meter = setInterval(() => {
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
    const rms = Math.sqrt(sum / samples.length);
    const now = Date.now();
    if (rms > SPEECH_RMS) { heardSpeech = true; quietSince = 0; }
    else if (heardSpeech) {
      quietSince ||= now;
      if (now - quietSince > SILENCE_MS) stop();
    }
  }, 100);
  const limit = setTimeout(stop, MAX_RECORD_MS);

  const done = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = async () => {
      cleanup();
      if (cancelled) { reject(new Error('cancelled')); return; }
      try {
        const recorded = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        resolve(await toWav(recorded, Ctx));
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

async function toWav(recorded: Blob, Ctx: AudioCtor): Promise<Blob> {
  const ctx = new Ctx();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(await recorded.arrayBuffer());
  } finally {
    void ctx.close().catch(() => undefined);
  }
  // Downmix and resample in one pass.
  const length = Math.max(1, Math.ceil(decoded.duration * TARGET_RATE));
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
