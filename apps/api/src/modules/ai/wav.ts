// Reads a voice-search upload and rebuilds it as a clean WAV before anything
// reaches (and is billed by) the model.
//
// Nothing in the uploaded header is trusted for length or cost: only the
// format our widget produces is accepted (integer PCM, 16-bit, mono), the
// duration comes from the sample rate and the number of samples actually
// present, and the model is sent a freshly written file holding just those
// samples — never the bytes as uploaded. A header claiming a huge byte rate
// (to pass a two-minute clip off as one second) or extra data after the
// audio therefore can't get past the length cap.

export interface WavAudio {
  sampleRate: number;
  seconds: number;
  /** A canonical 16-bit mono PCM WAV of exactly the samples counted above. */
  wav: Buffer;
}

const BITS = 16;
const CHANNELS = 1;

export function readWav(buf: Buffer): WavAudio | null {
  if (buf.length < 44) return null;
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return null;

  let fmt: { format: number; channels: number; sampleRate: number; byteRate: number; blockAlign: number; bits: number } | null = null;
  let data: Buffer | null = null;
  // Chunks follow the 12-byte RIFF header; each is id(4) + size(4) + body,
  // padded to an even length.
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ') {
      if (fmt || size < 16 || body + 16 > buf.length) return null;
      fmt = {
        format: buf.readUInt16LE(body),
        channels: buf.readUInt16LE(body + 2),
        sampleRate: buf.readUInt32LE(body + 4),
        byteRate: buf.readUInt32LE(body + 8),
        blockAlign: buf.readUInt16LE(body + 12),
        bits: buf.readUInt16LE(body + 14),
      };
    } else if (id === 'data') {
      // The format must be known before the samples; a streamed recording may
      // leave the size open, so take what actually arrived.
      if (!fmt) return null;
      data = buf.subarray(body, Math.min(body + size, buf.length));
      break;
    }
    offset = body + size + (size % 2);
  }

  if (!fmt || !data) return null;
  const blockAlign = CHANNELS * (BITS / 8);
  if (
    fmt.format !== 1 ||
    fmt.channels !== CHANNELS ||
    fmt.bits !== BITS ||
    fmt.sampleRate < 8000 ||
    fmt.sampleRate > 48000 ||
    fmt.blockAlign !== blockAlign ||
    fmt.byteRate !== fmt.sampleRate * blockAlign
  ) {
    return null;
  }

  // Whole samples only.
  const pcm = data.subarray(0, data.length - (data.length % blockAlign));
  if (!pcm.length) return null;

  return {
    sampleRate: fmt.sampleRate,
    seconds: pcm.length / blockAlign / fmt.sampleRate,
    wav: writeWav(pcm, fmt.sampleRate),
  };
}

function writeWav(pcm: Buffer, sampleRate: number): Buffer {
  const blockAlign = CHANNELS * (BITS / 8);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(CHANNELS, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * blockAlign, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(BITS, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
