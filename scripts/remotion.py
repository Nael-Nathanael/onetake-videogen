#!/usr/bin/env python3
"""
Render Remotion compositions from ~/OneTake/videogen/remotion (720p60).

  run.sh remotion.py explainer SCENES.json OUT.mp4 --words vo.words.json --duration SEC [--beats beats.json] [--theme theme.json]
  run.sh remotion.py titlecard OUT.mov --title "..." [--subtitle "..."] [--seconds 4] [--center]
  run.sh remotion.py illustrated OUT.mp4 [--comp Cell] [--concurrency 3]

SCENES.json: [{"start", "end", "layout": "title|points|big|quote", "kicker", "title", "emoji",
               "points": [{"text", "at"}]}]   (seconds on the narration timeline)
Explainer renders silent video; add narration + music with mix.py.
Title cards render ProRes 4444 with alpha, to overlay on footage with mix.py --overlay.
Illustrated compositions are authored at 1920x1080 and rendered scaled to 720p60, muted; mix audio with mix.py.
"""

import argparse
import tempfile
from pathlib import Path

from common import REMOTION_DIR, TARGET_W, load_json, run, save_json

ILLUSTRATED_W = 1920


def snap_to_beats(scenes, beats, window=0.3):
    """Move scene boundaries onto the nearest beat (within `window` s) so cuts land on the music."""
    if not beats:
        return scenes
    import bisect
    def snap(t):
        i = bisect.bisect_left(beats, t)
        near = min((b for b in beats[max(0, i - 1):i + 1]), key=lambda b: abs(b - t), default=t)
        return near if abs(near - t) <= window else t
    out = [dict(s) for s in scenes]
    for a, b in zip(out, out[1:]):
        t = snap(b["start"])
        a["end"] = b["start"] = round(t, 3)
    return out


def render(comp, out, props, extra):
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
        props_path = f.name
    save_json(props, props_path)
    run(["npx", "remotion", "render", "src/index.ts", comp, str(Path(out).resolve()),
         f"--props={props_path}", "--log=error", *extra], cwd=REMOTION_DIR)
    Path(props_path).unlink(missing_ok=True)
    print(f"-> {out}")


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    e = sub.add_parser("explainer")
    e.add_argument("scenes")
    e.add_argument("out")
    e.add_argument("--words", required=True)
    e.add_argument("--duration", type=float, required=True)
    e.add_argument("--beats")
    e.add_argument("--no-captions", action="store_true")
    e.add_argument("--theme", help='JSON with any of {"palette": [...], "ink", "paper", "accent"}')
    t = sub.add_parser("titlecard")
    t.add_argument("out")
    t.add_argument("--title", required=True)
    t.add_argument("--subtitle")
    t.add_argument("--seconds", type=float, default=4)
    t.add_argument("--accent", default="#FF5A5F")
    t.add_argument("--center", action="store_true")
    i = sub.add_parser("illustrated")
    i.add_argument("out")
    i.add_argument("--comp", default="Cell")
    i.add_argument("--concurrency", type=int, default=3)
    a = ap.parse_args()

    if a.cmd == "explainer":
        scenes = load_json(a.scenes)
        words = [{"text": w["text"], "start": w["start"], "end": w["end"]} for w in load_json(a.words)["words"]]
        beats = load_json(a.beats) if a.beats else {"bpm": 0, "beat_offset": 0, "beats": []}
        scenes = snap_to_beats(scenes, beats["beats"])
        scenes[-1]["end"] = a.duration
        props = {"duration": a.duration, "scenes": scenes, "words": words, "bpm": beats["bpm"],
                 "beatOffset": beats.get("beat_offset", 0), "captions": not a.no_captions,
                 **(load_json(a.theme) if a.theme else {})}
        render("Explainer", a.out, props, ["--muted", "--codec=h264", "--crf=18"])
    elif a.cmd == "illustrated":
        render(a.comp, a.out, {}, ["--muted", "--codec=h264", "--crf=18", f"--scale={TARGET_W / ILLUSTRATED_W}",
                                   f"--concurrency={a.concurrency}"])
    else:
        props = {"title": a.title, "subtitle": a.subtitle, "seconds": a.seconds, "accent": a.accent,
                 "position": "center" if a.center else "lower-third"}
        render("TitleCard", a.out, props,
               ["--codec=prores", "--prores-profile=4444", "--pixel-format=yuva444p10le", "--image-format=png"])


if __name__ == "__main__":
    main()
