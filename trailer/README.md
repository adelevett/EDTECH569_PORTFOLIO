# THREE BLIND MICE: SEA-ALL: teaser trailer

A 29.0-second cinematic teaser for *Three Blind Mice Sea-All* (`../Three_blind_mice_sea-all.txt`), built in pure
JavaScript (Three.js/WebGL2 + Web Audio). Everything is driven by one deterministic timeline, so the interactive page and the
offline render show the same frames.

| Deliverable | Path |
|---|---|
| Interactive trailer (Play button, scrub bar, ←/→ frame step, Space) | `index.html` (+ `assets/`, `audio/`) |
| Rendered film: 1920×1080, 30 fps, 870 frames, 29.000 s, H.264 ~22 Mb/s + AAC 320k, 80.8 MB | `trailer.mp4` |
| Bounced mix (the page plays this same file) | `audio/trailer_mix.wav` |
| Script, beat sheet and design notes | `build/SCRIPT.md` |

`index.html` opens straight from disk (`file://`) with no network access. Assets are packed as data-URI scripts in
`assets/pack/`, fonts are inlined in `assets/fonts.css`, and Three.js is bundled into `assets/app.js`.

## Concept
Three mouse navigators, jacked into the **Sea-All**, follow a trail to Port Fauxlio. The Sea-All sits over the painted harbour
as world-space sheets of pixel-mosaic tiles that quantise whatever lies behind them. The sheets parallax, flip where the
lighthouse beam touches them, and the camera flies through them. The overlay curdles into **Digitail Rott**, a 16k-voxel
simulation that assembles from the sky's tiles, speaks, glitches and sheds blocky residue. After the maelstrom and the title,
a single pull-back through curved glass reveals that the Sea of Mestre is a snow globe on a student's desk (SEMESTER, GRADE
POINT AVERAGE, PORTFOLIO), with the three mice harnessed in its base. The globe goes over the edge. **PLUNK.** The world
switches to graphite drawn on twos, and Alpha's real eye snaps open.

The two realities are built to clash:

| | Sea-All | Physical |
|---|---|---|
| Image | oil paint, navy/amber/cyan, bloom, flare, chromatic aberration, bokeh | graphite on paper tooth, no bloom, no flare |
| Motion | continuous 30 fps with sub-frame motion blur | 12 fps on twos, line boil |
| Sound | wide stereo, huge hall, orchestral bed, radio channel | mono, dry, close Foley, a tiny music box |

## Rebuilding
Everything below runs from `build/`. It needs Node 22, Python 3.11 and ffmpeg. The OpenRouter key is read from `../../.env`
(`OPENROUTER_API_KEY=...`) by the build scripts only; it never enters the output.

1. Assets (paid, already generated): `gen_plates.py` and `run_batch.py` produce the images, `tts_lines.py` / `tts_audition.py`
   the voices, `music_gen.py` the score. `orclient.py` keeps a spend ledger (`ledger.jsonl`) and refuses new calls at $9.
2. Asset prep: `depth.py` (Depth Anything V2 Large, ONNX), `prep_assets.py`, `keying.py`, `tails.py`.
3. `node build.mjs` bundles the app. `node pack.mjs` packs the assets for `file://`.
4. `node build_audio.mjs` renders the mix with OfflineAudioContext. It measures speech against music, ducks until music sits
   at least 12 dB under every line, and normalises to a −1.5 dBTP true peak.
5. `node render.mjs --workers=3` renders frames in headless Chromium: 3–6 jittered sub-frames per frame, clamped per cut.
   `./mux.sh` encodes `trailer.mp4`.

## Measured (final QA)
- Runtime: 29.000 s (870 frames at 30 fps, title card included). The audio track is 29.000 s and sample-aligned with the picture.
- Loudness: music sits at least 13.0 dB under speech in all four dialogue windows. Master sample peak −1.63 dBFS, true peak
  −1.52 dBTP, measured on the audio decoded from the MP4.
- Sync: every hit lands 0–56 ms after its picture cut (impact, cuts, PLUCK, PLUNK, eye snap).
- Clean: no console errors across the 870-frame render or the `file://` playback test.
- Spend: $2.3615 of the $10 cap. The build ledger and OpenRouter's key-usage endpoint agree.

## Credits and licences
- Images: OpenAI GPT Image 2.5 Sunburst, via OpenRouter, from the three reference paintings in this repo.
- Voices: Google Gemini 3.8 Flash TTS (Leda as Alpha, Fenrir as Bravo, Despina as Digitail Rott), via OpenRouter.
- Score bed: Google Lyria 3 Pro Preview, via OpenRouter. The motif, braams, music box and all sync-critical sound design are
  synthesised in Web Audio.
- Foley one-shots: Kenney *Impact Sounds* and *Sci-fi Sounds*, CC0 (licence files in `audio/stems/cc0/`).
- Fonts: Cinzel, Silkscreen, VT323, IM Fell English SC, Caveat, Share Tech Mono, Cormorant Garamond (SIL OFL 1.1) and Special
  Elite (Apache 2.0), all via Fontsource.
- Three.js (MIT). Depth Anything V2 (Apache 2.0).
