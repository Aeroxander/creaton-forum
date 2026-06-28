import { describe, expect, it } from "vitest";

import {
  computePackagedVideoDimensions,
  getForumVideoAspectRatio,
} from "./forumVideoLimits";
import { parseFfmpegProbeOutput } from "./ffmpegProbeOutput";

describe("computePackagedVideoDimensions", () => {
  it("preserves landscape aspect ratio under the size cap", () => {
    expect(computePackagedVideoDimensions(1920, 1080)).toEqual({ width: 1280, height: 720 });
  });

  it("preserves portrait aspect ratio under the size cap", () => {
    expect(computePackagedVideoDimensions(1080, 1920)).toEqual({ width: 720, height: 1280 });
  });

  it("preserves square aspect ratio under the size cap", () => {
    expect(computePackagedVideoDimensions(2000, 2000)).toEqual({ width: 1280, height: 1280 });
  });

  it("keeps small sources unchanged aside from even rounding", () => {
    expect(computePackagedVideoDimensions(540, 960)).toEqual({ width: 540, height: 960 });
  });
});

describe("getForumVideoAspectRatio", () => {
  it("derives aspect ratio from stored dimensions", () => {
    expect(getForumVideoAspectRatio({ width: 1080, height: 1920 })).toBeCloseTo(9 / 16);
  });

  it("falls back to 16:9 when dimensions are missing", () => {
    expect(getForumVideoAspectRatio(undefined)).toBe(16 / 9);
  });
});

describe("parseFfmpegProbeOutput", () => {
  it("parses stream size and duration", () => {
    const parsed = parseFfmpegProbeOutput(`
      Duration: 00:01:23.45, start: 0.000000, bitrate: 1200 kb/s
        Stream #0:0: Video: h264, yuv420p, 1920x1080, 30 fps
    `);

    expect(parsed).toEqual({
      width: 1920,
      height: 1080,
      durationSec: 83.45,
    });
  });

  it("swaps dimensions when rotation metadata is present", () => {
    const parsed = parseFfmpegProbeOutput(`
      Duration: 00:00:10.00
        Stream #0:0: Video: h264, 1920x1080, rotate: 90
    `);

    expect(parsed).toEqual({
      width: 1080,
      height: 1920,
      durationSec: 10,
    });
  });
});
