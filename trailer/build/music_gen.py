import sys, json, pathlib, subprocess; sys.path.insert(0, '.')
import orclient as oc
PROMPTS = {
'scoreA': (
 "Instrumental cinematic teaser-trailer score, exactly 30 seconds long, no vocals, no lyrics. Dark, brooding, oceanic, awe-struck. "
 "Key of C minor. Structure: "
 "0-7s: a vast night-harbour overture: deep sub-bass drone, slow low string swells, distant wordless choir pad, and a lonely "
 "celesta playing the 'Three Blind Mice' nursery melody transposed to C minor (E-flat, D, C ... E-flat, D, C ... G, F, F, E-flat), "
 "drenched in cavernous reverb, wonder tinged with dread. "
 "7-11s: momentum builds: pulsing low string ostinato and a glassy digital arpeggio, rising. "
 "11-16s: menace: huge detuned brass braams, dissonant clusters, glitching granular digital textures, the melody warped and slowed. "
 "16-21s: chaos: pounding taiko and orchestral hits, shrieking string runs, a rising metallic riser, maximum intensity. "
 "21-30s: sudden cut to near silence, only a faint low hum. Hollywood trailer production quality, wide stereo, huge low end."),
}
tag = sys.argv[1]
model = sys.argv[2] if len(sys.argv) > 2 else 'google/lyria-3-pro-preview'
out, text, usage = oc.chat_audio(model, [{"role": "user", "content": PROMPTS[tag]}], f"music/{tag}.bin", estimate=0.1, purpose='music ' + tag)
print('text:', text[:300]); print('usage:', usage)
b = pathlib.Path(out).read_bytes()[:16]; print('magic', b)
