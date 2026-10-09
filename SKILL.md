---
name: onetake-videogen
description: >-
  Local video production on an NVIDIA GPU, built on OneTake. Edits raw talking-head and screen recordings (Whisper transcript → removes fillers, retakes and long pauses → frame-accurate NVENC cut), burns word-by-word captions, adds tempo-matched royalty-free music, sound effects on every beat, voice-over (VoxCPM2, Indonesian and 29 more languages), animated explainers from a topic or script, and Kurzgesagt-style illustrated animation (AI-generated flat-vector art, soft-body physics in Remotion). Use it whenever the user's goal involves making, editing or improving a video, in any language or wording, with or without a file: cutting mistakes, adding captions, music, sound effects, a voice-over or an intro, or turning a topic into an animation. It works out the right workflow from the request and confirms a short plan with the user before rendering. Output 720p60 MP4, -14 LUFS.
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

**Confirm once, then run automatically** (see "Understand the request" below): one short plan
confirmation before any heavy work, then every editorial decision is yours until the video is done.

Production format is **720p**: 1280×720 landscape, or 720×1280 vertical for TikTok, Reels and Shorts.
Sources above 720p are downscaled on their short side, so portrait footage stays portrait; an edited
recording keeps its own frame rate (30 fps stays 30 fps), and generated video (explainers, title cards,
illustrated scenes) renders at 60 fps. Explainers and title cards take `--format vertical`: type, margins
and captions follow the frame, with captions raised clear of the app's own controls. Illustrated scenes
(C) are landscape.

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

## Keep it exciting, keep it short (all modes)

Viewers decide in the first seconds and leave at the first dull stretch. Every video:

- **Hook in the first 3 s.** Open on the payoff, a surprising claim or a question; never a greeting,
  logo or slow intro. A title card, if any, is short and lands on a sound effect.
- **Something changes every 2–4 s:** a new scene, a point popping in, a caption highlight, a sound
  effect. No static stretch over 4 s.
- **No dead air.** Cut silences, warm-ups and repeats; one idea said once.
- **Short.** Cut to the shortest version that still delivers the point. When in doubt, shorter.
- **Energy carries through.** Upbeat music, sound effects on every visual event, captions on: defaults
  for B and C; for an edit (A), recommend them as extras in the plan.
- **End on the payoff,** then stop: no long outro.

Excitement comes from pace and change, not from jittery motion: the motion rules still hold, so each
change stays easy to read.

## Understand the request, confirm once, then run

Work from what the user wants the viewer to get, not from keywords in the request.

1. **Look at the inputs.** Probe any file (`ffprobe`): duration, frame rate, whether it has speech,
   camera or screen recording, aspect. Check whether it is **raw or already finished**: encoder or
   `comment` metadata from an editor or Remotion, embedded or sidecar subtitles, music under the speech,
   a script-clean transcript. Mode A on a finished video cuts its music bed mid-phrase; say so in the plan
   and offer what still helps (captions, sound effects, a different file). Cheap checks:
   `ffmpeg -af silencedetect=n=-40dB:d=1` (no silences at all under speech suggests a music bed) and
   transcribing a 30 s sample (`ffmpeg -t 30` first). Read any script or outline.
   Note the request's language and any audience, length or style it mentions.
2. **Draft the plan.** Pick the mode by what the content needs:

   | Signal | Mode |
   |---|---|
   | Raw footage with speech to clean up (camera, screen capture, podcast) | **A. Edit** |
   | Information to explain: steps, lists, comparisons, numbers, from a topic, outline or script | **B. Explainer** |
   | Something to *show* moving or transforming: biology, physics, a process, a creature, a story, or a Kurzgesagt-like look | **C. Illustrated animation**, narrated when it explains |
   | Footage plus an intro or narration | A, then a B or C intro, or `voiceover.py` + `mix.py --voice` |

   B or C: pick C when understanding depends on *seeing* something move or change (light scattering, a
   cell dividing, an engine turning); pick B when the content is facts, steps or numbers that read well as
   text. When both fit, recommend one and offer the other in the confirmation.

   Then fill in the rest, each with a default you can justify from the request:
   - **Length:** from the footage, the script (~140 words per minute) or the request; otherwise 45–90 s
     for B, 20–45 s for C.
   - **Format:** vertical when the request names TikTok, Reels, Shorts or a phone, or the footage is
     portrait; landscape otherwise.
   - **Language** of narration and captions: the request's language unless stated.
   - **Tone:** upbeat and punchy by default; calm and documentary only when asked. It sets the motion feel, the music `--query` and
     how many sound effects.
   - **Captions** on or off, **voice** (generated, cloned from a sample, or none), **music** mood,
     **sound effects** (none, light, or one per event). For an edit (A), add only what the request asks
     for; list the rest as optional extras, off by default. Generated videos (B, C) default to music and
     sound effects on.
   - For A: how hard to cut. Default tight and fast (`--max-gap 0.4`); keep more only when asked.
3. **Confirm in one step.** Show the whole plan as one short list, in the request's language, so the user
   can correct anything. Then ask with `AskUserQuestion` when available (without it, one short message):
   - Ask only about choices that are still open and would materially change the video: at most 4 questions, 2–4
     options each, your pick first and marked "(Recommended)", headers of 12 characters or less. A
     finished file where raw footage was expected, an unclear audience or a B-or-C call are open; things
     the request already fixed are not.
   - When nothing is open, ask a single question: go with this plan, or adjust.
   - When the user said not to ask (for example "langsung aja", "just do it"), don't ask: show the plan in
     one line and start. The exception is an input that contradicts the request, such as a finished file
     sent as a raw recording; ask that one question anyway, because the requested work would damage it.
     Only confirmed evidence counts as a contradiction: editor or Remotion metadata, subtitles, or music
     heard in the 30 s sample. Missing silences alone is a hint, not proof: run the sample check (it is
     cheap, so run it even after "langsung aja"), and if it finds nothing, note the hint in the plan and
     proceed.
4. **Run without stopping.** After the answer, make every editorial decision yourself (what to cut,
   scene timing, cue placement) and don't ask again mid-pipeline. Ask again only if an input turns out
   missing or unusable (no file, corrupt file, no speech where speech was expected).

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
   (`--format vertical` over portrait footage)

6. **Mix**: `$S/run.sh mix.py $J/cut.mp4 $J/final.mp4 --music $J/music/bed.wav --overlay $J/title.mov@0.5`

## B. Explainer from a topic or script

1. **Script** — if given only a topic, write the narration as natural speech in the confirmed narration language (short sentences,
   conversational, the hook in the first line, no greeting or outro, ~140 words per minute of target length). Save as `$J/script.txt`,
   paragraphs = scenes. `[pause 1.0]` on its own paragraph adds silence.
2. **Voice-over**: `$S/run.sh voiceover.py $J/script.txt $J/vo.wav` (consistent voice from `--voice "(description)"`;
   or clone with `--ref sample.wav --ref-text "transcript"`). First run downloads the model (~several GB).
3. **Word timings**: `$S/run.sh transcribe.py $J/vo.wav $J/vo --lang id` → `$J/vo/words.json` (`--lang` = the
   narration language, e.g. `en`). Whisper guesses the spelling of names, brands and symbols, so give the
   words the text you wrote: `$S/run.sh align.py $J/vo/words.json $J/captions.txt`. `captions.txt` is the
   script as captions should read (digits as digits, `%` as a symbol, names spelled right), which can
   differ from a `script.txt` that spells numbers out for the voice. It keeps Whisper's timings and lists
   what it could not place; read that list.
4. **Scenes**: write `$J/scenes.json` from the transcript timings — one scene per idea, 3–6 s each, with a point,
   highlight or sound effect every 2–4 s inside longer scenes:
   ```json
   [{"start": 0, "end": 4.2, "layout": "title", "kicker": "Tips", "title": "Edit 10x Lebih Cepat", "emoji": "⚡"},
    {"start": 4.2, "end": 11.8, "layout": "points", "title": "3 langkah",
     "points": [{"text": "Unggah video", "at": 5.1}, {"text": "Hapus teks", "at": 7.0}]}]
   ```
   Layouts: `title` (hook/section), `points` (lists; set each `at` to when the narrator says it), `big` (one stat or
   keyword), `quote`. Titles ≤ 6 words, points ≤ 5 words — the narration carries the detail.
5. **Music**: `$S/run.sh music.py $J/music --duration <vo duration> --words $J/vo/words.json`
6. **Check** (same arguments as the render, minus the output): `$S/run.sh check.py explainer $J/scenes.json --words $J/vo/words.json --duration <vo duration> --beats $J/music/beats.json --stills $J/stills-v1`
   It must print nothing. It fails on a scene that holds one picture over 6 s (a caption highlight does
   not count: the picture needs a new scene or a point), a point with under 0.8 s to be read, titles over
   6 words and points over 5, gaps between scenes, narration that starts late, pauses over `--max-gap`
   (1.2 s; raise it for a scripted `[pause]`) or stops over 2 s early, text cropped or inside the 4% side
   margins, text in the caption band, and fonts that did not load. Fix `scenes.json` or the script and
   rerun; never loosen a rule to pass. Look at the stills (one settled frame per scene), then proofread
   every on-screen string for spelling, grammar and unsupported claims: the same command with `--texts`.
7. **Render**: `$S/run.sh remotion.py explainer $J/scenes.json $J/visual.mp4 --words $J/vo/words.json --duration <vo duration> --beats $J/music/beats.json`
   Scene changes snap to the nearest beat; accents pulse on the beat. Add `--format vertical` to both the
   check and the render for a vertical video.
   For a brand's look add `--theme $J/theme.json` = `{"palette": [...], "ink": "#…", "paper": "#…", "accent": "#…"}`.
   `paper` is the scene text, `ink` the frame and card text; for dark text on pale scenes pass the dark tone as
   `paper` and give `accent` a text-safe shade, since bright brand colours rarely read on a pale caption box.
8. **Mix**: `$S/run.sh mix.py $J/visual.mp4 $J/final.mp4 --voice $J/vo.wav --music $J/music/bed.wav`

## C. Illustrated animation

Read `references/motion.md`, then `references/illustrated-animation.md`, before starting. The second
holds the pipeline, the reasons behind each choice, the soft-body recipe and the extra checks for
illustration. The worked example is the `Cell` composition (`remotion/src/illustrated/cell/`, sound
design in `examples/cell/`): copy its structure for a new scene.

1. **Beat sheet**: one focal mover per beat, with its anticipation and payoff. When the scene explains
   something, write and voice the narration first (B steps 1–3) and time each beat to the word that names
   it.
2. **Art**: a flat-vector sprite sheet on a solid background from
   `$S/run.sh image.py "PROMPT" $J/sheet.jpg [--aspect 16:9] [--ref IMG ...]` (Gemini's image model through
   agy, no API key; `--ref` edits or restyles from up to 3 images), then
   `$S/run.sh split.py $J/sheet.jpg $J/parts` (flags: `--bg auto|#rrggbb`, `--threshold 40`, `--downsample 4`,
   `--min-area 200`, `--vtracer "<opts>"`). It writes `aNN.svg` per part, a labelled check sheet and
   `assets.json`. Drop broken pieces; copy the kept SVGs to `remotion/public/illustrated/<scene>/`.
3. **Build** in `remotion/src/illustrated/<scene>/`, authored at 1920×1080 and registered in `Root.tsx`.
   Draw in code anything that deforms or splits. Soft things come from a precomputed, deterministic
   position-based-dynamics simulation, not from sine wobble. Shared helpers: `illustrated/shared.ts`
   (`sampleAt` fractional-frame blending, `trailingShift` for motion blur) and `motion.ts`
   (`squashAlong`).
4. **Anticipation, a 4-frame hit-pause and overshoot** on every big event. Depth layers, lighting and
   juice on the payoff.
5. **Check headless** before any render: `bun scripts/simcheck.ts` (NaNs, event frames), then
   `$S/run.sh check.py illustrated --comp <Comp> --frames <each beat's settled key frame> --stills $J/stills-v1 [--words $J/vo/words.json]`.
   It must print nothing: no text cropped, inside the 4% side margins or in the caption band, every font
   loaded, no dead air in the narration. Give decoration that is meant to run off the frame `data-bleed`.
   `--texts` prints every on-screen string to proofread. A new composition is registered through `checked`
   in `Root.tsx`, or it sends no report.
6. **Render**: `$S/run.sh remotion.py illustrated $J/visual-v1.mp4 [--comp Cell] [--concurrency 3]`, muted
   1280×720 at 60 fps (rendered from 1920×1080 with `--scale`). Wrap it in
   `systemd-run --user --scope -p MemoryMax=6G -p MemorySwapMax=0 --quiet bash -c '...'` (4G for stills
   and strips), one heavy job at a time. `--concurrency 8` is the fastest on a 20-core laptop: a 600-frame
   1080p benchmark took 61 s at 8, 63 s at 12 and 67 s at 16, because the workers queue on Chrome's
   compositor and the encoder, not the CPU. Check with `npx remotion benchmark --concurrencies=4,8,12`.
   `--width 1920` renders 1080p unscaled. Each round writes new versioned paths (`visual-v2.mp4`,
   `strips-v2/`); never overwrite or delete earlier rounds in the same command.
7. **Frame strips**: `$S/run.sh frames.py $J/visual.mp4 $J/strips 240 780:820:2` writes the frames and a
   contact sheet. Read every event's wind-up, hold, release and settle.
8. **Sound**: music with a `--query` matching the confirmed tone, plus sound effects on every event (see
   Sound effects). Mix as in B (`--voice $J/vo.wav` when narrated), adding `--sfx`.

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

When done, tell the user: final path, any place where you departed from the confirmed plan and why,
duration before → after, a short list of what was cut (counts + the
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
- **`image.py`: `agy made no image`**: agy is signed out (run `agy` once and log in) or the account's image
  quota is used up; the message after the colon is agy's own reply.
- **`cuecheck.py` FAIL**: a cue's source file changed or `at` points past the video; rerun `mix.py --sfx` and
  check `OUT.sfx.json` for the placed times.
- Fresh machine or broken env: rerun `install.sh` (idempotent).
