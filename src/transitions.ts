/**
 * Transition filter builder — generates FFmpeg xfade filter chains.
 *
 * FFmpeg xfade applies a transition between exactly two streams. For N segments,
 * we need N-1 pairwise xfade operations, each feeding into the next.
 *
 * Offset math: each xfade starts at the point where the transition begins.
 * offset_i = cumulative_duration_up_to_segment_i - transition_duration_i
 */

import type { TransitionConfig } from "./config.js";

export interface TransitionFilterOptions {
  segmentCount: number;
  segmentDurations: number[];
  globalTransition?: TransitionConfig;
  perSegmentTransitions?: Array<TransitionConfig | undefined>;
}

/**
 * Get the transition config for the boundary after segment i.
 * Per-segment overrides the global setting.
 */
function getTransitionAt(
  i: number,
  global?: TransitionConfig,
  perSegment?: Array<TransitionConfig | undefined>
): TransitionConfig | undefined {
  return perSegment?.[i] ?? global;
}

/**
 * Build an FFmpeg xfade filter chain for transitions between segments.
 *
 * Returns the complete filter_complex string that replaces the simple concat.
 * The chain outputs to [mid] for compatibility with downstream filters.
 *
 * For a single segment, returns undefined (no transitions needed).
 */
export function buildTransitionFilter(
  opts: TransitionFilterOptions
): string | undefined {
  const { segmentCount, segmentDurations, globalTransition, perSegmentTransitions } = opts;

  if (segmentCount < 2) return undefined;

  // Check if any transitions are actually configured
  const hasAny =
    globalTransition ||
    perSegmentTransitions?.some((t) => t !== undefined);
  if (!hasAny) return undefined;

  let filterChain = "";
  let prevLabel = "[0:v]";
  let cumulativeDuration = segmentDurations[0];

  for (let i = 0; i < segmentCount - 1; i++) {
    const transition = getTransitionAt(i, globalTransition, perSegmentTransitions);
    const nextInput = `[${i + 1}:v]`;

    if (transition) {
      const type = transition.type ?? "fade";
      const duration = transition.duration ?? 0.5;
      const offset = Math.max(0, cumulativeDuration - duration);
      const outputLabel = i < segmentCount - 2 ? `[xf${i}]` : "[mid]";

      filterChain += `${prevLabel}${nextInput}xfade=transition=${type}:duration=${duration}:offset=${offset.toFixed(3)}${outputLabel}`;

      // Next segment's cumulative duration accounts for overlap
      cumulativeDuration = offset + duration + segmentDurations[i + 2 < segmentCount ? i + 2 : 0];
      // Actually: running offset is offset + nextSegDuration
      // Recalculate properly:
      if (i + 2 < segmentCount) {
        cumulativeDuration = offset + segmentDurations[i + 1];
      }

      prevLabel = outputLabel;
    } else {
      // No transition at this boundary — concat the two
      const outputLabel = i < segmentCount - 2 ? `[ct${i}]` : "[mid]";
      filterChain += `${prevLabel}${nextInput}concat=n=2:v=1${outputLabel}`;
      cumulativeDuration += segmentDurations[i + 1];
      prevLabel = outputLabel;
    }

    if (i < segmentCount - 2) {
      filterChain += ";";
    }
  }

  return filterChain;
}

/**
 * Compute the total output duration when transitions cause overlaps.
 *
 * Each transition of duration D removes D seconds from the total
 * (the two segments overlap during the transition).
 */
export function computeTotalDurationWithTransitions(
  segmentDurations: number[],
  globalTransition?: TransitionConfig,
  perSegmentTransitions?: Array<TransitionConfig | undefined>
): number {
  let total = segmentDurations.reduce((a, b) => a + b, 0);

  for (let i = 0; i < segmentDurations.length - 1; i++) {
    const transition = getTransitionAt(i, globalTransition, perSegmentTransitions);
    if (transition) {
      total -= transition.duration ?? 0.5;
    }
  }

  return Math.max(0, total);
}
