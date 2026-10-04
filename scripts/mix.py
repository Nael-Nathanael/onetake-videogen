#!/usr/bin/env python3
"""
Final mix: speech + ducked music bed (+ optional title-card overlays), loudness -14 LUFS.

  run.sh mix.py VIDEO OUT.mp4 [--voice narration.wav] [--music bed.wav] [--music-db -16]
                [--overlay title.mov@1.5 ...]

--voice replaces the video's own audio (explainer mode). Without it the video's audio is the speech.
Music is side-chain ducked under the speech so words stay clear, and swells back in pauses.
Video is stream-copied unless overlays are given (then re-encoded with NVENC, x264 fallback).
"""

import argparse

from common import probe, run


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("out")
    ap.add_argument("--voice")
    ap.add_argument("--music")
    ap.add_argument("--music-db", type=float, default=-16, help="music level before ducking")
    ap.add_argument("--overlay", action="append", default=[], help="FILE@START_SECONDS (alpha video)")
    a = ap.parse_args()

    info = probe(a.video)
    dur = info["duration"]
    inputs = ["-i", a.video]
    idx = 1
    voice = None
    if a.voice:
        inputs += ["-i", a.voice]
        voice, idx = f"{idx}:a", idx + 1
    elif info["has_audio"]:
        voice = "0:a"
    music = None
    if a.music:
        inputs += ["-i", a.music]
        music, idx = f"{idx}:a", idx + 1

    fg = []
    if voice and music:
        fg += [f"[{voice}]aresample=48000,asplit=2[vo][key]",
               f"[{music}]aresample=48000,volume={a.music_db}dB[mv]",
               "[mv][key]sidechaincompress=threshold=0.02:ratio=8:attack=20:release=450[duck]",
               "[vo][duck]amix=inputs=2:duration=longest:normalize=0[mixed]"]
    elif voice:
        fg += [f"[{voice}]aresample=48000[mixed]"]
    elif music:
        fg += [f"[{music}]aresample=48000,volume={a.music_db}dB[mixed]"]
    has_audio = bool(fg)
    if has_audio:
        fg += ["[mixed]loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[a]"]

    vlabel = "0:v"
    for k, ov in enumerate(a.overlay):
        path, start = ov.rsplit("@", 1)
        inputs += ["-i", path]
        fg += [f"[{idx}:v]setpts=PTS-STARTPTS+{float(start)}/TB[o{k}]",
               f"[{vlabel}][o{k}]overlay=eof_action=pass:format=auto[v{k}]"]
        vlabel, idx = f"v{k}", idx + 1

    maps = ["-map", f"[{vlabel}]" if a.overlay else "0:v"]
    if has_audio:
        maps += ["-map", "[a]"]

    def cmd(vcodec):
        return ["ffmpeg", "-y", "-loglevel", "error", *inputs,
                *(["-filter_complex", ";".join(fg)] if fg else []), *maps, *vcodec,
                "-c:a", "aac", "-b:a", "192k", "-t", f"{dur:.3f}", "-movflags", "+faststart", a.out]

    if not a.overlay:
        run(cmd(["-c:v", "copy"]))
    else:
        try:
            run(cmd(["-c:v", "h264_nvenc", "-preset", "p5", "-rc", "vbr", "-cq", "19", "-b:v", "0"]))
        except RuntimeError:
            run(cmd(["-c:v", "libx264", "-preset", "medium", "-crf", "18"]))
    print(f"-> {a.out} ({dur:.1f}s)")


if __name__ == "__main__":
    main()
