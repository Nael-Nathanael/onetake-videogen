import React, { useMemo } from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { fontFamily, INK, PAPER, Word } from "./theme";

const MAX_WORDS = 6;

/** Group words into short caption lines, breaking on punctuation, pauses and length. */
const toLines = (words: Word[]) => {
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

export const Captions: React.FC<{ words: Word[]; accent: string }> = ({ words, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const lines = useMemo(() => toLines(words), [words]);
  const line = lines.find((l) => t >= l[0].start - 0.05 && t <= l[l.length - 1].end + 0.25);
  if (!line) return null;

  const lineIn = spring({ frame: frame - Math.round(line[0].start * fps), fps, config: { damping: 14, stiffness: 180 } });

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
          background: INK,
          color: PAPER,
          padding: "10px 22px",
          borderRadius: 18,
          maxWidth: 1100,
          textAlign: "center",
          lineHeight: 1.25,
        }}
      >
        {line.map((w, i) => {
          const active = t >= w.start && t < w.end + 0.05;
          const pop = spring({ frame: frame - Math.round(w.start * fps), fps, config: { damping: 10, stiffness: 260 } });
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                marginRight: 12,
                color: active ? accent : PAPER,
                transform: `scale(${active ? 1 + 0.12 * pop : 1})`,
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
