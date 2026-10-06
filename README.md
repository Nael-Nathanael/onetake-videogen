# onetake-videogen

A [Claude Code](https://claude.com/claude-code) skill that turns raw recordings or a plain topic into a finished,
captioned, music-backed video. It runs locally on an NVIDIA GPU and needs no editing by hand.

It is built on [OneTake](https://github.com/leejersey/OneTake), a text-based video editor where deleting words
deletes the matching video. This repo adds a patch that makes OneTake fast and reliable on long videos, plus the
skill and tooling around it:

| Step | What it does | Tech |
|---|---|---|
| Transcribe | Word-level timestamps; fillers (`eh`, `em`, `um`, `呃`…) are flagged | faster-whisper `large-v3-turbo` on CUDA |
| Decide cuts | Claude reads the transcript and removes retakes, false starts, off-camera talk and Whisper hallucinations | the skill |
| Cut | Frame-accurate cut in one pass; long pauses shortened; downscaled to 720p | ffmpeg `select`/`setpts` + NVENC |
| Captions | Word-by-word "pop" captions, active word highlighted | ASS + libass, burned in during the cut pass |
| Music | Royalty-free tracks (CC0 / CC BY) picked to match the speaking pace, time-stretched to one tempo, crossfaded on bar lines, ending exactly on the last frame, ducked under speech | Openverse, librosa, rubberband |
| Voice-over | Indonesian (and 29 other languages) narration with a consistent or cloned voice | [VoxCPM2](https://github.com/OpenBMB/VoxCPM) |
| Motion graphics | Title cards, and full animated explainer videos where scene changes snap to the beat. All motion, captions included, uses one rig: staggered springs, parts that trail their parent, area-preserving squash, eased exits, calm idle motion. Rules: [`references/motion.md`](references/motion.md) | [Remotion](https://www.remotion.dev) |
| Illustrated animation | Kurzgesagt-style scenes: Gemini flat-vector art traced to SVG, soft bodies from a deterministic physics sim, anticipation and overshoot on every event. Guide: [`references/illustrated-animation.md`](references/illustrated-animation.md) | Remotion, vtracer |
| Mix | Speech + music, loudness normalised to −14 LUFS | ffmpeg |

Output: 1280×720 at 60 fps, H.264/AAC MP4.

## Speed (RTX 3070 Ti, Ryzen 5 7500F)

- **Transcribe:** a 61 s clip takes 3–4 s, including loading the model.
- **Cut + encode:** an 18-minute 720p60 source with 278 cuts takes about 1.8 min at `high` quality and 1.4 min at `medium`.
- **Before the patch:** stock OneTake used libx264 `slow` with a 5-minute ffmpeg timeout, so exports longer than about 15 minutes failed. Its concat-demuxer cuts also drifted about 0.6 s over 65 cuts.

## Requirements

- Linux with an NVIDIA GPU and a recent driver. It works on CPU too, just slowly. VoxCPM2 needs about 8 GB of VRAM.
- `ffmpeg` built with `libass`, `librubberband` and ideally `h264_nvenc` (Ubuntu's ffmpeg package has all three).
- Python 3.10–3.12.
- Node.js 20+.
- Google Chrome. This is optional: Remotion downloads its own headless shell if Chrome isn't installed.

## Install

```bash
git clone https://github.com/Nael-Nathanael/onetake-videogen ~/oss/onetake-videogen
cd ~/oss/onetake-videogen
./install.sh            # add --no-tts to skip VoxCPM2/PyTorch
```

`install.sh` is idempotent. It does the following:

1. Clones OneTake into `$ONETAKE_HOME` (default `~/OneTake`), pinned to the commit the patch targets.
2. Applies `patches/onetake-gpu-longvideo.patch`.
3. Creates the Python envs and installs the npm dependencies.
4. Symlinks the skill into `~/.claude/skills/onetake-videogen`.

## Use

In Claude Code:

```
/onetake-videogen edit ~/Videos/rekaman-mentah.mp4
/onetake-videogen bikin video explainer 2 menit tentang cara kerja kompresi video
```

The skill also triggers on plain requests such as "potong bagian yang salah ucap di video ini, kasih caption dan musik".
It decides what to cut by itself, renders the video, then reports what it removed and which music it used.

Every job writes to `~/OneTake/storage/jobs/<name>/`:

- `final.mp4`: the finished video
- `transcript.txt`, `cuts.json`: what was cut and why
- `music/CREDITS.txt`: attribution text to paste into the video description

The scripts in `scripts/` can also be run by hand. See `SKILL.md` for the full pipeline. Every script takes `--help`.

The patched OneTake web editor is still available for manual edits: `~/OneTake/start_local.sh`, then open http://localhost:5173.

## What the OneTake patch changes

- **Export:** NVENC with automatic libx264 fallback, no ffmpeg timeout, and export runs off the event loop.
- **Cutting:** frame-accurate `select`/`setpts` time mapping, which is also safe for variable-frame-rate phone footage. Audio is trimmed sample-accurately from PCM. Ubuntu's ffmpeg 8.0.1 `aselect` passes every frame, so it isn't used.
- **Uploads:** streamed to disk instead of read into RAM twice. The limit is raised from 500 MB to 20 GB, `.mkv` is accepted, and retention is configurable.
- **Transcription:** CUDA is detected through CTranslate2, so PyTorch is no longer a dependency. Uses pip `nvidia-cublas`/`nvidia-cudnn`, pins `av<17` (PyAV 17 breaks faster-whisper 1.2), and adds anti-hallucination settings.
- **Web UI:** a language picker. Upstream hardcoded Chinese, so every upload was transcribed as Chinese. Adds an Indonesian filler list and a `large-v3-turbo` model option.

## Licensing notes

- **This repo:** MIT (see `LICENSE`).
- **OneTake:** by [leejersey](https://github.com/leejersey/OneTake). Its README states MIT. This repo ships only a patch against it, not its source.
- **Plus Jakarta Sans:** SIL Open Font License, see `assets/fonts/OFL.txt`.
- **Remotion:** free for individuals, non-profits and companies with up to 3 people. Larger companies need a [company license](https://www.remotion.dev/license).
- **Music:** fetched at run time and limited to CC0 and CC BY. CC BY requires attribution, which is why `CREDITS.txt` is written. Some Jamendo tracks are registered with YouTube Content ID and can still get claimed. For monetised channels, prefer your own library in `~/Music/bgm` (for example, YouTube Audio Library downloads).
- **Models:** faster-whisper/Whisper weights are MIT. VoxCPM2 is Apache-2.0.
