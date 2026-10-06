---
name: onetake-videogen
description: Fully automatic local video production on an NVIDIA GPU, built on OneTake. Edits raw talking-head / screen recordings (Whisper transcript → removes fillers, retakes, long pauses → frame-accurate NVENC cut), burns pop word-by-word captions, adds royalty-free tempo-matched background music with ducking, Remotion title cards, and can generate Indonesian voice-over (VoxCPM2) plus animated explainer videos from a script or topic, and Kurzgesagt-style illustrated animation (AI-generated flat-vector art, soft-body physics in Remotion). Output 720p60 MP4, -14 LUFS. Use this whenever the user wants to edit, cut, clean up, caption, add music to, or produce a video — "edit video ini", "potong bagian salah", "bikin video explainer", "voice over", "tambahin musik", "animasi kayak Kurzgesagt", "/onetake-videogen" — even if they don't mention OneTake.
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

## Motion (all modes)

Every animated element follows `references/motion.md`, whatever the mode. Read it before adding or
changing any animation. Remotion code goes through the shared rig in `remotion/src/motion.ts`, and the
ASS captions follow the same rules. In short:

- one motion onset at a time, with related parts staggered 4–5 frames
- children rigged on their own lagging springs, never welded to their parent
- springs for arrivals, eased exits, never linear
- squash and stretch that keeps the area
- slow, small idle motion
- colours that ease instead of snapping

Check motion in frame strips, not single stills.

## Pick the mode

| Input | Mode |
|---|---|
| A recording (camera, screen capture, podcast video) | **A. Edit** |
| A topic, an outline, or a narration script (no footage) | **B. Explainer** |
| Footage + "add voice-over/intro" | A, then splice a B-rendered intro, or `voiceover.py` + `mix.py --voice` |
| Illustrated, organic animation: things that move, deform or split (cells, creatures, props), Kurzgesagt-style | **C. Illustrated animation** |

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

## C. Illustrated animation

Read `references/motion.md`, then `references/illustrated-animation.md`, before starting. The second
holds the pipeline, the reasons behind each choice, the soft-body recipe and the extra checks for
illustration. The worked example is the `Cell` composition (`remotion/src/illustrated/cell/`, sound
design in `examples/cell/`): copy its structure for a new scene.

1. **Beat sheet**: one focal mover per beat, with its anticipation and payoff.
2. **Art**: a flat-vector sprite sheet from Gemini on a solid background, then
   `$S/run.sh split.py SHEET.png $J/parts` (flags: `--bg auto|#rrggbb`, `--threshold 40`, `--downsample 4`,
   `--min-area 200`, `--vtracer "<opts>"`). It writes `aNN.svg` per part, a labelled check sheet and
   `assets.json`. Drop broken pieces; copy the kept SVGs to `remotion/public/illustrated/<scene>/`.
3. **Build** in `remotion/src/illustrated/<scene>/`, authored at 1920×1080 and registered in `Root.tsx`.
   Draw in code anything that deforms or splits. Soft things come from a precomputed, deterministic
   position-based-dynamics simulation, not from sine wobble. Shared helpers: `illustrated/shared.ts`
   (`sampleAt` fractional-frame blending, `trailingShift` for motion blur) and `motion.ts`
   (`squashAlong`).
4. **Anticipation, a 4-frame hit-pause and overshoot** on every big event. Depth layers, lighting and
   juice on the payoff.
5. **Check headless**: `bun scripts/simcheck.ts` (NaNs, event frames) before any render.
6. **Render**: `$S/run.sh remotion.py illustrated $J/visual.mp4 [--comp Cell] [--concurrency 3]`, muted
   1280×720 at 60 fps (rendered from 1920×1080 with `--scale`). Run it inside a memory cap.
7. **Frame strips**: `$S/run.sh frames.py $J/visual.mp4 $J/strips 240 780:820:2` writes the frames and a
   contact sheet. Read every event's wind-up, hold, release and settle.
8. **Sound**: music with a calm `--query`, plus sound effects on every event (see Sound effects). Mix as
   in B, adding `--sfx`.

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

## Sound effects (any mode)

Motion lands harder with a sound on it: a pop for a title card, a tick per list point, a whoosh on a
scene change, a cue per event in an illustrated scene. Pass absolute paths (`run.sh` changes directory).

1. **Search**: `$S/run.sh sfx.py search $J/sfx-search.json "bubble pop" "water drop" [--max-dur 6]`. CC0 and
   CC BY only; pick ids from the printed table.
2. **Fetch**: `$S/run.sh sfx.py fetch $J/audio name=OPENVERSE_ID ... [--music name=ID]`. Writes
   `manifest.json` (licence, credit, sha256, measured peak offset) and `CREDITS.txt`. It refuses creators
   whose account is deleted, because their licence can no longer be checked. Check the source page of any
   CC BY item. `--refetch` restores missing files from a manifest.
3. **Cues**: write `$J/cues.json`. `at` is where the sound's loudest point lands (seconds = frame / fps).
   `gain_db` is relative to the speech/music level: big hits about +9 to +11, light ones +4 to +6.
   ```json
   {"manifest": "audio/manifest.json", "cues": [
     {"name": "burst", "file": "burst-squish", "at": 4.0, "gain_db": 9, "lowpass_hz": 7000, "duck_db": 4},
     {"name": "chime", "file": "chime-kalimba-e5", "at": 4.95, "gain_db": 4, "pan": 0.4,
      "pitch_hz": 587.33, "source_hz": 666.0, "lowpass_hz": 5000, "keep_s": 1.6}]}
   ```
   Optional fields: `pan` (-1..1), `pitch_hz` (tune tonal cues to the music's key; give `source_hz` for
   chirpy sounds), `lowpass_hz`, `keep_s`, `duck_db` (music dip, 3–5 dB for big hits).
4. **Mix**: `$S/run.sh mix.py VIDEO $J/final.mp4 [--voice ...] [--music ...] --sfx $J/cues.json`. Each cue's
   loudest point is placed on its `at` after processing; the loudness pass must stay linear (reported in
   `final.mp4.sfx.json`). `--sfx` is optional; without it `mix.py` mixes speech and music only.
5. **Check**: `$S/run.sh cuecheck.py $J/final.mp4` must print PASS (every cue within one frame).

Give the user `$J/audio/CREDITS.txt` with the music credits.

## Report back

When done, tell the user: final path, duration before → after, a short list of what was cut (counts + the
notable retakes), the music track(s) with tempo and the credits text, and render times. With sound effects,
add cuecheck's worst offset, the loudness and whether the loudness pass stayed linear. Keep job folders;
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
- **`No module named 'PIL'`, missing `@remotion/motion-blur`, or `vtracer: command not found`**: the install
  predates illustrated mode; rerun `install.sh`. vtracer needs Rust (`cargo install vtracer`).
- **`cuecheck.py` FAIL**: a cue's source file changed or `at` points past the video; rerun `mix.py --sfx` and
  check `OUT.sfx.json` for the placed times.
- Fresh machine or broken env: rerun `install.sh` (idempotent).
