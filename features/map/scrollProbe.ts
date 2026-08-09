import { useCallback, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';

/**
 * **Temporary.** Measures a list's frame against its content, so device round 2
 * can say *why* the sheet's lists will not scroll on an `.ipa` when they scroll
 * in Expo Go.
 *
 * Delete this file and its three call sites once the question is answered.
 * `SHOW_SCROLL_PROBE` below is the single switch.
 *
 * **Why measure rather than read.** Four causes have already been eliminated
 * with evidence — a JS/native version mismatch (`expo install --check` is
 * clean), a New Architecture difference (a clean prebuild sets no flag either
 * way), the worklets babel plugin failing in release (`__workletHash` is present
 * in the exported Hermes bundle), and `flex: 1` (all seven lists carry it and
 * the four outside the sheet scroll). What is left needs a number off a device.
 * `docs/backlog.md` says exactly this about the last scroll bug that misled four
 * investigations: *"measure — log `contentInset` from the `onScroll` payload
 * against the list's `onLayout` frame — rather than read."*
 *
 * **What the two numbers mean.** A scroll view scrolls when its content is
 * taller than its frame.
 *
 * - `content > frame` and it still will not move → the frame is right and the
 *   gesture is being swallowed. That is the sheet's pan/scroll coordination.
 * - `content == frame` → the list has been given an unbounded height, has laid
 *   every row out inside its own frame, and has nothing to scroll. It would
 *   report every scroll affordance as present and never move, which is the
 *   failure Increment 7's checklist described in advance.
 */

/** Flip to false to take the readout off the screen without unpicking it. */
export const SHOW_SCROLL_PROBE = true;

export type ScrollProbe = {
  /** Put on the view wrapping the list — the frame the list has to fill. */
  onLayout: (event: LayoutChangeEvent) => void;
  /** Put on the list itself. */
  onContentSizeChange: (width: number, height: number) => void;
  /** `frame 812 · content 1860 · scrolls` — one line, for a person to read. */
  readout: string;
};

export function useScrollProbe(): ScrollProbe {
  const [frame, setFrame] = useState<number | null>(null);
  const [content, setContent] = useState<number | null>(null);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setFrame(Math.round(event.nativeEvent.layout.height));
  }, []);

  const onContentSizeChange = useCallback((_width: number, height: number) => {
    setContent(Math.round(height));
  }, []);

  const verdict =
    frame === null || content === null
      ? '…'
      : content > frame
        ? 'has room to scroll'
        : 'nothing to scroll';

  return {
    onLayout,
    onContentSizeChange,
    readout: `frame ${frame ?? '…'} · content ${content ?? '…'} · ${verdict}`,
  };
}
