import { execute, FFmpegError } from "ffmpeg-expo";

import { computePackagedVideoDimensions } from "./forumVideoLimits";
import { parseFfmpegProbeOutput, type ProbedVideoMetadata } from "./ffmpegProbeOutput";

export type { ProbedVideoMetadata };
export { parseFfmpegProbeOutput } from "./ffmpegProbeOutput";

export async function probeVideoMetadata(uri: string): Promise<ProbedVideoMetadata> {
  let output = "";

  try {
    const result = await execute(["-hide_banner", "-i", uri], {
      logLevel: "info",
      onLog: (log) => {
        output += `${log.message}\n`;
      },
    });
    output += result.output;
  } catch (error) {
    if (error instanceof FFmpegError) {
      output += error.output;
    } else {
      throw error;
    }
  }

  const parsed = parseFfmpegProbeOutput(output);
  if (!parsed) {
    throw new Error("Could not read video dimensions.");
  }

  return parsed;
}

export function packagedDimensionsFromProbe(probe: ProbedVideoMetadata) {
  return computePackagedVideoDimensions(probe.width, probe.height);
}
