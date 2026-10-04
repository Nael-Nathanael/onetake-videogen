---
name: onetake-videogen
description: Fully automatic local video production on an NVIDIA GPU, built on OneTake. Edits raw talking-head / screen recordings (Whisper transcript → removes fillers, retakes, long pauses → frame-accurate NVENC cut), burns pop word-by-word captions, adds royalty-free tempo-matched background music with ducking, Remotion title cards, and can generate Indonesian voice-over (VoxCPM2) plus animated explainer videos from a script or topic. Output 720p60 MP4, -14 LUFS. Use this whenever the user wants to edit, cut, clean up, caption, add music to, or produce a video — "edit video ini", "potong bagian salah", "bikin video explainer", "voice over", "tambahin musik", "/onetake-videogen" — even if they don't mention OneTake.
---

# OneTake videogen

Everything runs locally from `$ONETAKE_HOME` (default `~/OneTake`, OneTake patched for GPU +
long videos by `install.sh`). Call every script through `scripts/run.sh`: it picks the right venv,
sets the CUDA library path, and keeps temp files on disk (`/tmp` is often a RAM-backed tmpfs —
never stage video there).

```bash
S=<this skill's directory>/scripts              # e.g. ~/.claude/skills/onetake-videogen/scripts
J=~/OneTake/storage/jobs/<short-name>           # one folder per video job; all outputs here
```

If `run.sh` reports a missing venv, the environment isn't installed: run `install.sh` from the
skill directory (see README.md).

The user asked for **full automation**: make editorial decisions yourself, render, and
report what you cut and why. Don't stop to ask for approval mid-pipeline. Ask only when an
input is missing (no file, no topic).

Production format is **1280×720, 60 fps** (sources above 720p are downscaled; 60 fps is kept).

## Pick the mode

| Input | Mode |
|---|---|
| A recording (camera, screen capture, podcast video) | **A. Edit** |
| A topic, an outline, or a narration script (no footage) | **B. Explainer** |
| Footage + "add voice-over/intro" | A, then splice a B-rendered intro, or `voiceover.py` + `mix.py --voice` |

## A. Edit a recording

1. **Transcribe** (GPU, ~1 min per 18 min of audio):
   `$S/run.sh transcribe.py INPUT.mp4 $J --lang id` → `$J/words.json`, `$J/transcript.txt`
   Use `--lang en` / `--lang auto` when the speaker isn't speaking Indonesian.

2. **Decide the cuts** by reading `$J/transcript.txt`. Lines look like
   `#120-134 [00:04:12.0] text…`; `[eh,]` marks fillers (removed automatically);
   `(... 3.2s ...)` marks a pause (pauses > `--max-gap` are shortened automatically).
   Write `$J/cuts.json` = `{"delete": [[first, last], ...], "why": {"120-134": "retake"}}` deleting:
   - **Retakes / false starts** — when a sentence is said again, keep the *last* complete take
     (speakers redo until it's right). Typical cue: same opening words repeated, "eh maksud saya",
     "ulang ya", "sorry".
   - **Self-corrections** — delete the wrong part and the correction phrase, keep the corrected statement.
   - **Off-camera / meta talk** — "udah rekam belum?", "bentar", talking to someone else, mic checks.
   - **Whisper hallucinations** — text in the last seconds or in long silences that doesn't fit,
     classically "Terima kasih sudah menonton", "selamat menikmati", "subscribe". Low `prob` in words.json backs this up.
   - Keep content even if imperfectly phrased; don't over-trim personality. When unsure, keep.

3. **Cut + captions** (one NVENC pass, frame-accurate):
   `$S/run.sh cut.py INPUT.mp4 $J/words.json $J/cut.mp4 --cuts $J/cuts.json --captions`
   Writes `cut.words.json` (words re-timed to the edit — use it for music tempo and title timing).
   Options: `--max-gap 0.6` (tighter = punchier; 0.4 for fast-paced, 0.9 for calm tutorials), `--pad 0.12`,
   `--keep-fillers`, `--quality medium`, no `--captions` if the user doesn't want them.

4. **Music** (see below): `$S/run.sh music.py $J/music --duration <cut duration> --words $J/cut.words.json`

5. **Title card** (optional, nice for the opening topic):
   `$S/run.sh remotion.py titlecard $J/title.mov --title "Judul" --subtitle "Subjudul" --seconds 4`

6. **Mix**: `$S/run.sh mix.py $J/cut.mp4 $J/final.mp4 --music $J/music/bed.wav --overlay $J/title.mov@0.5`

## B. Explainer from a topic or script

1. **Script** — if given only a topic, write the narration in natural spoken Indonesian (short sentences,
   conversational, hook in the first line, ~140 words per minute of target length). Save as `$J/script.txt`,
   paragraphs = scenes. `[pause 1.0]` on its own paragraph adds silence.
2. **Voice-over**: `$S/run.sh voiceover.py $J/script.txt $J/vo.wav` (consistent voice from `--voice "(description)"`;
   or clone with `--ref sample.wav --ref-text "transcript"`). First run downloads the model (~several GB).
3. **Word timings**: `$S/run.sh transcribe.py $J/vo.wav $J/vo --lang id` → `$J/vo/words.json`.
4. **Scenes**: write `$J/scenes.json` from the transcript timings — one scene per idea, 4–10 s each, so the
   screen changes often (keeps it from feeling monotonous):
   ```json
   [{"start": 0, "end": 4.2, "layout": "title", "kicker": "Tips", "title": "Edit 10x Lebih Cepat", "emoji": "⚡"},
    {"start": 4.2, "end": 11.8, "layout": "points", "title": "3 langkah",
     "points": [{"text": "Unggah video", "at": 5.1}, {"text": "Hapus teks", "at": 7.0}]}]
   ```
   Layouts: `title` (hook/section), `points` (lists; set each `at` to when the narrator says it), `big` (one stat or
   keyword), `quote`. Titles ≤ 6 words, points ≤ 5 words — the narration carries the detail.
5. **Music**: `$S/run.sh music.py $J/music --duration <vo duration> --words $J/vo/words.json`
6. **Render**: `$S/run.sh remotion.py explainer $J/scenes.json $J/visual.mp4 --words $J/vo/words.json --duration <vo duration> --beats $J/music/beats.json`
   Scene changes snap to the nearest beat; accents pulse on the beat.
7. **Mix**: `$S/run.sh mix.py $J/visual.mp4 $J/final.mp4 --voice $J/vo.wav --music $J/music/bed.wav`

## Music: tempo-matched, royalty-free

`music.py` picks tracks and builds a bed exactly as long as the video:
- **Target tempo** comes from the speaking pace in the words file (≈130 wpm → ~100 BPM, ≈170 wpm → ~124 BPM),
  i.e. the pop/explainer range. Override with `--bpm`.
- **Sources**: `~/Music/bgm` first (drop YouTube Audio Library downloads there), then Openverse (Jamendo,
  Freesound…) limited to **CC0 / CC BY**. BY-SA/NC/ND are excluded on purpose.
- Tracks within ±8% of the target are time-stretched (rubberband) to one tempo, cut on bar lines, chained with
  one-bar crossfades for long videos (variety = less monotonous), and the tempo is nudged ≤3% so the last bar
  ends on the last frame.
- `--query` changes the mood ("chill lofi,acoustic" for calm topics). Default is upbeat pop.
- **Always give the user `$J/music/CREDITS.txt`** — CC BY requires attribution in the video description.
  Jamendo tracks can still trigger YouTube Content ID claims; mention it if they monetise.

## Report back

When done, tell the user: final path, duration before → after, a short list of what was cut (counts + the
notable retakes), the music track(s) with tempo and the credits text, and render times. Keep job folders;
`~/OneTake/storage/jobs` is not auto-cleaned (disk is the user's call).

## Troubleshooting

- **CUDA/cuDNN errors in transcribe**: always go through `run.sh` (sets `LD_LIBRARY_PATH`).
- **`metadata_errors` error**: PyAV ≥17 in the OneTake venv; `pip install "av<17"`.
- **Out of VRAM in voiceover**: VoxCPM2 needs ~8 GB; stop the OneTake server (`pkill -f start_local.sh; pkill -f run.py`)
  and other GPU apps, then retry.
- **NVENC fails** (e.g. 10-bit HDR phone footage): the cut falls back to libx264 automatically; it's slower, not broken.
- **Remotion**: uses an installed Chrome (`REMOTION_BROWSER_EXECUTABLE`, default `/usr/bin/google-chrome`) when present,
  otherwise downloads its own headless shell. It does not need Playwright browsers.
  Remotion is free for individuals and companies ≤3 people; larger companies need a Remotion company licence.
- Fresh machine or broken env: rerun `install.sh` (idempotent).
