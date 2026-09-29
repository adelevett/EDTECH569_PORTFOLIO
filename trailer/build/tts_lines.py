import sys, pathlib; sys.path.insert(0, '.')
import orclient as oc
from tts_audition import to_wav
GEM = 'google/gemini-3.8-flash-tts'
def st(s): return {'google-ai-studio': {'speech_metadata': {'style': s}}}
LINES = {
 'alpha_baited_a': ('Leda', "She baited the trail...", 'a young woman whispering in dawning horror, breathless and trembling, barely audible, the realisation hitting her'),
 'alpha_baited_b': ('Leda', "She... baited the trail.", 'hushed, frozen horror; a shaky whisper with a sharp intake of breath before speaking'),
 'alpha_scatter_a': ('Leda', "Reroute! Scatter!", 'screaming at the top of her lungs in raw terror, a desperate frantic command, voice cracking'),
 'alpha_scatter_b': ('Leda', "REROUTE! SCATTER!", 'an all-out panicked shriek, loud and ragged, like yelling over a hurricane'),
}
for tag in (sys.argv[1:] or LINES):
    voice, text, style = LINES[tag]
    raw = f'vo/{tag}.pcm'
    out, hdr = oc.tts(GEM, text, voice, raw, fmt='pcm', provider_opts=st(style), purpose='line ' + tag, estimate=0.02)
    to_wav(raw, hdr.get('Content-Type'), f'vo/{tag}.wav')
    print(tag, 'ok')
