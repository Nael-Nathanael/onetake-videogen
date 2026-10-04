import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Captions } from "./Captions";
import { beatPhase, DEFAULT_PALETTE, fontFamily, INK, PAPER, Scene, Word } from "./theme";

export type ExplainerProps = {
  duration: number;
  scenes: Scene[];
  words: Word[];
  bpm?: number;
  beatOffset?: number;
  palette?: string[];
  captions?: boolean;
};

const SceneView: React.FC<{ scene: Scene; color: string; t: number; pulse: number }> = ({ scene, color, t, pulse }) => {
  const { fps } = useVideoConfig();
  const local = Math.round((t - scene.start) * fps);
  const enter = spring({ frame: local, fps, config: { damping: 12, stiffness: 140 } });
  const exitIn = scene.end - t;
  const exit = interpolate(exitIn, [0, 0.25], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const layout = scene.layout ?? (scene.points?.length ? "points" : "title");
  const titleSize = layout === "big" ? 120 : layout === "title" ? 84 : 60;

  return (
    <AbsoluteFill
      style={{
        background: color,
        opacity: exit,
        transform: `scale(${0.92 + 0.08 * enter})`,
        padding: "70px 90px 150px",
        justifyContent: layout === "points" ? "flex-start" : "center",
        alignItems: layout === "points" ? "flex-start" : "center",
        fontFamily,
        color: PAPER,
      }}
    >
      {/* Beat-synced accent blob in the corner keeps the frame alive between points. */}
      <div
        style={{
          position: "absolute",
          right: -120,
          top: -120,
          width: 420,
          height: 420,
          borderRadius: "50%",
          background: PAPER,
          opacity: 0.12,
          transform: `scale(${1 + 0.08 * pulse})`,
        }}
      />
      {scene.kicker && (
        <div
          style={{
            fontWeight: 700,
            fontSize: 28,
            letterSpacing: 3,
            textTransform: "uppercase",
            background: INK,
            padding: "6px 16px",
            borderRadius: 10,
            marginBottom: 18,
            transform: `translateY(${(1 - enter) * -40}px)`,
          }}
        >
          {scene.kicker}
        </div>
      )}
      <div
        style={{
          fontWeight: 800,
          fontSize: titleSize,
          lineHeight: 1.08,
          textAlign: layout === "points" ? "left" : "center",
          maxWidth: 1100,
          transform: `translateY(${(1 - enter) * 60}px)`,
          textShadow: `0 6px 0 ${INK}33`,
        }}
      >
        {scene.emoji && <span style={{ marginRight: 20 }}>{scene.emoji}</span>}
        {scene.title}
      </div>
      {layout === "points" && (
        <div style={{ marginTop: 36, display: "flex", flexDirection: "column", gap: 20 }}>
          {(scene.points ?? []).map((p, i) => {
            const pin = spring({ frame: Math.round((t - p.at) * fps), fps, config: { damping: 11, stiffness: 200 } });
            if (t < p.at) return null;
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 18,
                  fontWeight: 700,
                  fontSize: 40,
                  background: PAPER,
                  color: INK,
                  padding: "12px 24px",
                  borderRadius: 16,
                  transform: `translateX(${(1 - pin) * -80}px) scale(${0.9 + 0.1 * pin})`,
                  opacity: pin,
                }}
              >
                <span
                  style={{
                    background: color,
                    color: PAPER,
                    borderRadius: 10,
                    width: 46,
                    height: 46,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 800,
                  }}
                >
                  {i + 1}
                </span>
                {p.text}
              </div>
            );
          })}
        </div>
      )}
    </AbsoluteFill>
  );
};

export const Explainer: React.FC<ExplainerProps> = ({
  scenes,
  words,
  bpm = 0,
  beatOffset = 0,
  palette = DEFAULT_PALETTE,
  captions = true,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const since = beatPhase(t, bpm, beatOffset);
  const pulse = Math.exp(-since * 9);
  const idx = scenes.findIndex((s) => t >= s.start && t < s.end);
  const scene = idx >= 0 ? scenes[idx] : undefined;
  const color = palette[Math.max(idx, 0) % palette.length];

  return (
    <AbsoluteFill style={{ background: INK }}>
      {scene && <SceneView scene={scene} color={color} t={t} pulse={pulse} />}
      {captions && <Captions words={words} accent={palette[(Math.max(idx, 0) + 3) % palette.length]} />}
    </AbsoluteFill>
  );
};
