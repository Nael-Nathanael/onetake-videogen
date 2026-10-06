# Illustrated animation (Kurzgesagt-style)

Mode C: flat-vector scenes where things move, deform and split (cells, creatures, organic props),
built in Remotion. These are the lessons from a mitosis test scene that went from "not fluid enough,
jiggle physics off" to "that's better".

## Pipeline

1. **Beat sheet.** For each beat, write down the one focal mover, its anticipation, its payoff, the
   secondary reactions, and its length in frames. If there is narration, add the word the beat lands on.
2. **Art.** Generate a sprite sheet with Gemini (the `generate-image-producer` skill when installed).
   This prompt shape works:
   - "flat vector illustration assets in the style of Kurzgesagt"
   - a single solid background colour given as a hex value
   - assets laid out on a loose grid with empty space between them
   - no outlines, text or background gradient
   - "crisp edges suitable for vector tracing", landscape 16:9

   One roll gave a clean cell body, nucleus, mitochondria, vesicles and chromosomes. One chromosome
   came out broken; drop pieces like that. Gemini's download step can take more than a minute, so use
   a timeout of at least 120 s.
3. **Split and trace.**
   - Mask each pixel by its distance from the background colour, using a soft alpha ramp so the
     anti-aliased edges stay smooth.
   - Find connected components on a 4× downsampled mask, then crop each with padding.
   - Save each crop as a transparent PNG and trace it with
     `vtracer --mode spline -f 8 -p 7 -g 12`.
   - Rasterise the SVGs back into a labelled contact sheet and look at it.
   - Use the same background colour in the video, so the faint dark fringe from tracing disappears.
4. **Draw in code anything that deforms.** Membranes, chromatid arms and anything that bends or splits
   must be code. A traced sprite cannot change shape. Colour the code shapes with values sampled from
   the generated art so they match the sprites.
5. **Build** at 1920×1080, 60 fps, with physics for anything soft (see the soft-body recipe below)
   and eased curves for designed moves. Keep the event times as named constants in one place.
6. **Verify** (see the Verify section below), fix, and repeat.

## What made it smooth

Ranked by how much each one changed the result.

1. **Physics instead of sine waves.** The first version faked jelly with sine ripples and hand-placed
   wobble "kicks" on a timer. It looked dead, because nothing reacted to motion. A soft-body
   simulation gives lag, overshoot and settle that respond to every push.
2. **Anticipation, hit-pause, overshoot on every big event.**
   - Before the event, wind up the opposite way: the nucleus dips 4% before it bursts, chromosome arms
     are tugged open for 18 frames, the lobes squash sideways before the pinch.
   - Freeze the whole simulation for 4 frames right before the release.
   - After the release, overshoot and settle. The underdamped step response
     `1 - e^(-ζωt)(cos ω_d t + (ζω/ω_d) sin ω_d t)` with ζ = 0.5 and ω = 12 gives one visible overshoot.
   - Force the event to happen on its frame instead of detecting it, so it always lands on the beat.
3. **One focal mover per beat.** People track about 4 objects at once, and the start of a motion is
   what grabs the eye. Stagger related reactions by 3–5 frames and rest 15–30 frames between beats.
   Keep idle motion slow and at about 5% of the hero motion's amplitude.
4. **Contents trail and react.** Organelles sit on damped anchor springs (stiffness 60, damping 5.4),
   collide with the membrane and with each other, and squash along their velocity:
   `rotate(dir) scale(1+s, 1/(1+s)) rotate(-dir)`, with `s = min(0.22, speed/1600)`. A lean into
   horizontal motion sells weight.
5. **60 fps.** Elastic motion at 30 fps strobes.
6. **Detail without clutter.**
   - **Depth:** 5 parallax layers (far blurred cells, two dot layers, the subject, blurry foreground
     dots). Turn the far layers down until they stop competing with the subject; the first pass was
     too loud.
   - **Lighting:** fill the outline, then draw inner bands as strokes clipped to the outline (wide dark
     band, medium band, thin rim light). Add an offset lighter fill for a shading crescent, and a
     highlight arc made from the outline's own upper-left points pulled toward the centre, so it
     follows every deformation. A peanut shape needs one arc per lobe, or the arc hooks into the neck.
   - **Payoff juice:** a flash, a saturation and brightness spike, a glow jump, 6–12 particles that
     linger and drift, and a 2–4 px camera nudge instead of a shake.
   - **Story detail:** spindle fibres growing from glowing centrosomes to each chromosome, timed to
     the stagger. Fragments drift away from the burst.

## Soft-body recipe

Use position-based dynamics (Müller, *Ten Minute Physics*; the method JoltPhysics cites). Precompute
the whole timeline once per render worker (`cache ??= simulate()`) with a fixed step and 4 substeps per
frame. The simulation must be a pure function of time, because every Remotion worker has to produce
identical frames. A 1200-frame run takes about 0.6 s.

**Membrane: a ring of 64 particles.**
- **Goal spring** toward a designed target outline (stiffness 90, damping 2). The target keeps the
  timing art-directed; the lag and overshoot come from the physics.
- **Edge constraints** use the goal polygon's per-edge length, not the average length. With the
  average, the edges fight the goal.
- **Bending constraint:** pull each point's deviation from its neighbours' midpoint toward the goal
  outline's deviation (stiffness 0.12). This removes kinks and keeps the low wobble modes.
- **Area constraint** acts as internal pressure. Keep it soft (stiffness 0.06) so the cell can breathe;
  at 0.3 the membrane was rigid.
- **Goal points** sit at equal arc length along the outline, so a closing neck doesn't crowd points
  into a fold.
- **Neck shape:** for a peanut target, use a smoothed `|cos a|` (`sqrt(cos²a + 0.012)`) so the neck is an
  hourglass, not a cusp.
- **Contractile ring:** add a stiff local pull at the furrow. Without it, pressure pushes the neck
  back open just before the snap.
- **Wobble impulses** must keep the volume: oval `cos 2θ` and three-lobe `cos 3θ` radial velocity
  kicks. The area constraint cancels a uniform outward kick, so it produces no visible wobble.
- **Splitting one ring into two:** split by each particle's fixed goal angle, never by its current x
  position, because a pinched neck folds across the midline. Resample each half to N points by arc
  length. Two guards: no zero-length segments, and the index must never run past the end. The first
  attempt produced NaNs and collapsed daughter cells.
- **Daughters** collide with each other at the midline, then spring apart with one overshoot.

**Contents.**
- Contents are particles on anchor springs. They push membrane particles outward, and the membrane
  takes 80% of the correction, so it bulges locally.
- Contents also push each other apart. Bonded pairs (sister chromatids) are held together until the
  release.
- **Chromatid arms** are dragged tips on a fixed-length tether to the centromere. A minimum gap
  between tips keeps a dragged chromatid a V, never a thin rod.

## Remotion pitfalls

- `spring()` settles in about 1 s whatever the stiffness. For moves over several seconds, use
  `interpolate` with `Easing.bezier`.
- Sprites: `<Img src={staticFile(...svg)}>`, absolutely positioned. Split a sprite in half with
  `clip-path: inset(0 50% 0 0)`.
- For the gooey-blob look without physics, run two circles through an `feGaussianBlur` and an alpha
  threshold `feColorMatrix`. Use it for quick tests only; it cannot react to forces.
- A precomputed simulation indexed by integer frame breaks anything that renders fractional frames,
  such as `CameraMotionBlur`. Interpolate between neighbouring frames first.
- If `bun install` hangs on a Remotion project, use `npm install`.

## Perception principles

1. **One focal mover; motion onset captures attention; track at most about 4 objects.** (Abrams &
   Christ 2003; Pylyshyn & Storm 1988; Mayer's coherence principle)
2. **Ease organic motion; linear reads mechanical.** (Flash & Hogan 1985; Viviani & Flash 1995)
3. **Squash and stretch with conserved area, anticipation, follow-through.** (Lasseter 1987)
4. **Round shapes read friendly, sharp shapes read as threat.** The effect is modest. (Bar & Neta 2006)
5. **Visual change lands on the word that names it.** (Mayer: temporal contiguity)
6. **Palette of 3–5 hues:** cool dark background, lighter figure, one warm accent, saturation saved
   for the climax. (Schloss & Palmer 2011; Valdez & Mehrabian 1994)
7. **Low-clutter background, high-contrast subject.** (Reber, Schwarz & Winkielman 2004; Rosenholtz
   et al. 2007)
8. **Build tension, then one clean payoff; parts that move together read as one thing.** (Cheung et
   al. 2019; Wagemans et al. 2012)

## Verify

You cannot watch the video, so measure it.

- **Headless simulation check before any render.** A script that runs the simulation and prints:
  - NaNs
  - the frame each event fires on
  - per 0.5 s, the radius spread of each ring (the jiggle amplitude and how it settles)
  - neck width against its target
  - the gap between the daughter cells
- **Stills** at the key frame of each beat, built into a contact sheet.
- **Frame strips** around each event (every 2nd frame for 20–30 frames). Read the wind-up, hold,
  release and settle from the strip.
- **The final encoded MP4:** extract frames from it too, not only from Remotion stills.
- **Checklist:**
  - one hero motion per beat
  - no linear motion on organic parts
  - area conserved
  - anticipation and overshoot on every big event
  - contents lag and react
  - no overlaps
  - palette of 3–5 hues
  - idle motion slow
  - payoff held at least 20 frames
  - depth, lighting and juice on the payoff

## Safe rendering on a laptop

- Never delete files in the same command as a render, and never use `rm -rf`. Write every round to new
  versioned folders (`build-v5`, `out/stills-v5`).
- Run every bundle and render inside a memory cap:
  `systemd-run --user --scope -p MemoryMax=4G -p MemorySwapMax=0 --quiet bash -c '...'`. Use 6G and
  `--concurrency=3` for full renders, and run one render at a time. One stills round peaked at about
  0.8 GB, and a full 20 s 1080p60 render took about a minute.
