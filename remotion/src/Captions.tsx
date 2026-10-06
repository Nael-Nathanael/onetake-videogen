import React, { useMemo } from "react";
import { interpolateColors, useCurrentFrame, useVideoConfig } from "remotion";
import { POP, rig, SOFT } from "./motion";
import { fontFamily, INK, PAPER, Word } from "./theme";

const MAX_WORDS = 6;

/** Group words into short caption lines, breaking on punctuation, pauses and length. */
export const toLines = (words: Word[]) => {
  const lines: Word[][] = [];
  let cur: Word[] = [];
  words.forEach((w, i) => {
    cur.push(w);
    const next = words[i + 1];
    const punct = /[.,!?;:]$/.test(w.text);
    const pause = next ? next.start - w.end > 0.35 : true;
    if (cur.length >= MAX_WORDS || punct || pause) {
      lines.push(cur);
      cur = [];
    }
  });
  if (cur.length) lines.push(cur);
  return lines;
};

export const Captions: React.FC<{ words: Word[]; accent: string; ink?: string; paper?: string }> = ({
  words,
  accent,
  ink = INK,
  paper = PAPER,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const lines = useMemo(() => toLines(words), [words]);
  const line = lines.find((l) => t >= l[0].start - 0.05 && t <= l[l.length - 1].end + 0.25);
  if (!line) return null;

  const lineIn = rig(frame - Math.round(line[0].start * fps), fps, SOFT).v;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 56,
        width: "100%",
        display: "flex",
        justifyContent: "center",
        transform: `translateY(${(1 - lineIn) * 30}px)`,
        opacity: lineIn,
      }}
    >
      <div
        style={{
          fontFamily,
          fontWeight: 800,
          fontSize: 44,
          background: ink,
          color: paper,
          padding: "10px 22px",
          borderRadius: 18,
          maxWidth: 1100,
          textAlign: "center",
          lineHeight: 1.25,
        }}
      >
        {line.map((w, i) => {
          // Highlight eases in on the word's start and back out after it, instead of snapping.
          const on = rig(frame - Math.round(w.start * fps), fps, POP).v;
          const off = rig(frame - Math.round((w.end + 0.05) * fps), fps, SOFT).v;
          const lit = Math.max(0, Math.min(1, on - off));
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                // The gap must outlast the pop: a 300 px word at 1.04 grows 6 px a side.
                marginRight: 16,
                color: interpolateColors(Math.min(1, lit), [0, 1], [paper, accent]),
                transform: `scale(${1 + 0.04 * (on - off)})`,
              }}
            >
              {w.text}
            </span>
          );
        })}
      </div>
    </div>
  );
};
