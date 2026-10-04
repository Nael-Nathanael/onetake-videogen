import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { fontFamily, INK, PAPER } from "./theme";

export type TitleCardProps = {
  title: string;
  subtitle?: string;
  accent?: string;
  seconds: number;
  position?: "lower-third" | "center";
};

/** Transparent overlay (lower third or centered title) composited onto footage with ffmpeg. */
export const TitleCard: React.FC<TitleCardProps> = ({ title, subtitle, accent = "#FF5A5F", position = "lower-third" }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 12, stiffness: 170 } });
  const out = interpolate(frame, [durationInFrames - 12, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const sub = spring({ frame: frame - 8, fps, config: { damping: 14, stiffness: 160 } });
  const center = position === "center";

  return (
    <AbsoluteFill
      style={{
        justifyContent: center ? "center" : "flex-end",
        alignItems: center ? "center" : "flex-start",
        padding: center ? 0 : "0 0 150px 70px",
        fontFamily,
        opacity: out,
      }}
    >
      <div style={{ transform: `translateX(${(1 - enter) * -60}px) scale(${0.85 + 0.15 * enter})` }}>
        <div
          style={{
            display: "inline-block",
            background: accent,
            color: PAPER,
            fontWeight: 800,
            fontSize: center ? 88 : 54,
            padding: "10px 26px",
            borderRadius: 16,
            boxShadow: `8px 8px 0 ${INK}`,
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div
            style={{
              marginTop: 14,
              display: "block",
              width: "fit-content",
              background: PAPER,
              color: INK,
              fontWeight: 700,
              fontSize: center ? 40 : 30,
              padding: "8px 20px",
              borderRadius: 12,
              opacity: sub,
              transform: `translateY(${(1 - sub) * 20}px)`,
            }}
          >
            {subtitle}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
