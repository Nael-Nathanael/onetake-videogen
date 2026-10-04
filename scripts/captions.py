"""Word-level "pop" captions as an ASS subtitle file (burned in by ffmpeg/libass)."""

import re
from pathlib import Path

MAX_WORDS = 6
FONT = "Plus Jakarta Sans ExtraBold"


def _ass_time(t):
    t = max(0.0, t)
    h, rem = divmod(t, 3600)
    m, s = divmod(rem, 60)
    return f"{int(h)}:{int(m):02d}:{s:05.2f}"


def _esc(text):
    return text.replace("\\", "").replace("{", "(").replace("}", ")")


def group_lines(words, max_words=MAX_WORDS):
    """Short caption lines, broken on punctuation, pauses and length."""
    lines, cur = [], []
    for i, w in enumerate(words):
        cur.append(w)
        nxt = words[i + 1] if i + 1 < len(words) else None
        if (len(cur) >= max_words or re.search(r"[.,!?;:]$", w["text"])
                or not nxt or nxt["start"] - w["end"] > 0.35):
            lines.append(cur)
            cur = []
    return lines


def write_ass(words, path, accent="&H0000B3FF", width=1280, height=720):
    """
    words: [{"text", "start", "end"}] on the OUTPUT timeline.
    accent: ASS colour &HAABBGGRR for the active word (default warm yellow #FFB300).
    """
    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {width}
PlayResY: {height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Pop,{FONT},{round(height * 0.065)},&H00F7FDFF,&H00F7FDFF,&H001F1414,&H001F1414,0,0,0,0,100,100,0,0,3,12,0,2,80,80,{round(height * 0.075)},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    events = []
    for line in group_lines(words):
        line_end = line[-1]["end"] + 0.25
        for k, w in enumerate(line):
            start = line[0]["start"] if k == 0 else w["start"]
            end = line[k + 1]["start"] if k + 1 < len(line) else line_end
            parts = []
            for j, x in enumerate(line):
                t = _esc(x["text"])
                if j == k:
                    # active word: accent colour + small pop
                    parts.append(r"{\c" + accent + r"&\fscx112\fscy112}" + t + r"{\r}")
                else:
                    parts.append(t)
            # first event of a line slides in slightly
            fx = r"{\fad(80,0)}" if k == 0 else ""
            events.append(f"Dialogue: 0,{_ass_time(start)},{_ass_time(end)},Pop,,0,0,0,,{fx}{' '.join(parts)}")
    Path(path).write_text(header + "\n".join(events) + "\n", encoding="utf-8")
    return path


def ass_filter(ass_path, fonts_dir):
    """ffmpeg filter string that burns the ASS file with the bundled fonts."""
    esc = lambda p: str(p).replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")
    return f"subtitles=filename='{esc(ass_path)}':fontsdir='{esc(fonts_dir)}'"
