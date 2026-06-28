export type ProbedVideoMetadata = {
  width: number;
  height: number;
  durationSec?: number;
};

/** Parse `ffmpeg -i` stderr for the first video stream and optional rotation metadata. */
export function parseFfmpegProbeOutput(output: string): ProbedVideoMetadata | null {
  const videoMatch = output.match(/Video:[^\n]*?(\d{2,5})x(\d{2,5})/);
  if (!videoMatch) return null;

  let width = Number(videoMatch[1]);
  let height = Number(videoMatch[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;

  const rotationMatch =
    output.match(/rotate\s*:\s*(-?\d+)/i) ??
    output.match(/rotation of (-?\d+(?:\.\d+)?) degrees/i);
  const rotation = rotationMatch ? Number(rotationMatch[1]) : 0;
  if (Math.abs(rotation) === 90 || Math.abs(rotation) === 270) {
    [width, height] = [height, width];
  }

  const durationMatch = output.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/);
  const durationSec = durationMatch
    ? Number(durationMatch[1]) * 3600 +
      Number(durationMatch[2]) * 60 +
      Number(durationMatch[3])
    : undefined;

  return {
    width,
    height,
    durationSec: Number.isFinite(durationSec) ? durationSec : undefined,
  };
}
