import { describe, it, expect } from "vitest";
import {
  buildTransitionFilter,
  computeTotalDurationWithTransitions,
} from "../src/transitions.js";

describe("buildTransitionFilter", () => {
  it("returns undefined for a single segment", () => {
    const result = buildTransitionFilter({
      segmentCount: 1,
      segmentDurations: [5],
      globalTransition: { type: "fade", duration: 0.5 },
    });
    expect(result).toBeUndefined();
  });

  it("returns undefined when no transitions configured", () => {
    const result = buildTransitionFilter({
      segmentCount: 3,
      segmentDurations: [5, 4, 3],
    });
    expect(result).toBeUndefined();
  });

  it("builds xfade for 2 segments with global transition", () => {
    const result = buildTransitionFilter({
      segmentCount: 2,
      segmentDurations: [5, 4],
      globalTransition: { type: "fade", duration: 0.5 },
    });
    expect(result).toBeDefined();
    expect(result).toContain("xfade=transition=fade");
    expect(result).toContain("duration=0.5");
    expect(result).toContain("[mid]");
    expect(result).toContain("[0:v]");
    expect(result).toContain("[1:v]");
  });

  it("builds chained xfade for 3 segments", () => {
    const result = buildTransitionFilter({
      segmentCount: 3,
      segmentDurations: [5, 4, 3],
      globalTransition: { type: "wipeleft", duration: 1.0 },
    });
    expect(result).toBeDefined();
    // Should have 2 xfade operations (N-1)
    const xfadeCount = (result!.match(/xfade/g) || []).length;
    expect(xfadeCount).toBe(2);
    expect(result).toContain("transition=wipeleft");
    expect(result).toContain("[mid]");
  });

  it("uses per-segment transition override", () => {
    const result = buildTransitionFilter({
      segmentCount: 2,
      segmentDurations: [5, 4],
      globalTransition: { type: "fade", duration: 0.5 },
      perSegmentTransitions: [{ type: "wiperight", duration: 1.0 }, undefined],
    });
    expect(result).toBeDefined();
    // Per-segment should override global
    expect(result).toContain("transition=wiperight");
    expect(result).toContain("duration=1");
  });

  it("falls back to concat when a specific boundary has no transition", () => {
    const result = buildTransitionFilter({
      segmentCount: 3,
      segmentDurations: [5, 4, 3],
      perSegmentTransitions: [
        { type: "fade", duration: 0.5 },
        undefined,
        undefined,
      ],
    });
    expect(result).toBeDefined();
    expect(result).toContain("xfade");
    expect(result).toContain("concat=n=2");
  });

  it("computes correct offset for first transition", () => {
    const result = buildTransitionFilter({
      segmentCount: 2,
      segmentDurations: [5, 4],
      globalTransition: { type: "fade", duration: 1.0 },
    });
    // offset = 5 - 1.0 = 4.0
    expect(result).toContain("offset=4.000");
  });
});

describe("computeTotalDurationWithTransitions", () => {
  it("returns sum of durations with no transitions", () => {
    const total = computeTotalDurationWithTransitions([5, 4, 3]);
    expect(total).toBe(12);
  });

  it("subtracts transition durations from total", () => {
    const total = computeTotalDurationWithTransitions(
      [5, 4, 3],
      { type: "fade", duration: 0.5 }
    );
    // 12 - 0.5 - 0.5 = 11
    expect(total).toBe(11);
  });

  it("uses per-segment transition durations", () => {
    const total = computeTotalDurationWithTransitions(
      [5, 4, 3],
      undefined,
      [{ type: "fade", duration: 1.0 }, { type: "wipeleft", duration: 0.5 }, undefined]
    );
    // 12 - 1.0 - 0.5 = 10.5
    expect(total).toBe(10.5);
  });

  it("per-segment overrides global", () => {
    const total = computeTotalDurationWithTransitions(
      [5, 4, 3],
      { type: "fade", duration: 0.5 },
      [{ type: "fade", duration: 2.0 }, undefined, undefined]
    );
    // 12 - 2.0 (per-seg override) - 0.5 (global fallback) = 9.5
    expect(total).toBe(9.5);
  });

  it("returns 0 for empty durations", () => {
    const total = computeTotalDurationWithTransitions([]);
    expect(total).toBe(0);
  });

  it("never returns negative", () => {
    const total = computeTotalDurationWithTransitions(
      [1],
      { type: "fade", duration: 5 }
    );
    // Single segment, no transitions to apply
    expect(total).toBe(1);
  });
});
