// Reads just enough of a WAV header to know what a voice search uploaded:
// that it really is PCM audio, and how long it runs. Anything else is refused
// before it can reach (and be billed by) the model.

export interface WavInfo {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  seconds: number;
}

export function readWav(buf: Buffer): WavInfo | null {
  if (buf.length < 44) return null;
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return null;

  let fmt: { format: number; channels: number; sampleRate: number; byteRate: number; bits: number } | null = null;
  let dataBytes = -1;
  // Chunks follow the 12-byte RIFF header; each is id(4) + size(4) + body,
  // padded to an even length.
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ' && body + 16 <= buf.length) {
      fmt = {
        format: buf.readUInt16LE(body),
        channels: buf.readUInt16LE(body + 2),
        sampleRate: buf.readUInt32LE(body + 4),
        byteRate: buf.readUInt32LE(body + 8),
        bits: buf.readUInt16LE(body + 14),
      };
    } else if (id === 'data') {
      // A streamed recording may leave the size open; trust what arrived.
      dataBytes = Math.min(size, buf.length - body);
      break;
    }
    offset = body + size + (size % 2);
  }

  // 1 = integer PCM, 3 = float PCM.
  if (!fmt || (fmt.format !== 1 && fmt.format !== 3) || dataBytes <= 0 || fmt.byteRate <= 0) return null;
  if (fmt.channels < 1 || fmt.channels > 2 || fmt.sampleRate < 8000 || fmt.sampleRate > 48000) return null;

  return {
    sampleRate: fmt.sampleRate,
    channels: fmt.channels,
    bitsPerSample: fmt.bits,
    seconds: dataBytes / fmt.byteRate,
  };
}
