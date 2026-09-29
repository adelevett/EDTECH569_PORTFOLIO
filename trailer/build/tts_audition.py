import sys, json, subprocess, pathlib; sys.path.insert(0, '.')
import orclient as oc

def to_wav(raw_path, ctype, wav_path):
    raw_path = pathlib.Path(raw_path)
    if ctype and 'mpeg' in ctype:
        cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-i', str(raw_path), '-ac', '1', '-ar', '48000', str(wav_path)]
    else:  # raw pcm s16le 24k mono (Gemini/most providers)
        rate = '24000'
        if ctype and 'rate=' in ctype:
            rate = ctype.split('rate=')[1].split(';')[0]
        cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-f', 's16le', '-ar', rate, '-ac', '1', '-i', str(raw_path),
               '-ar', '48000', str(wav_path)]
    subprocess.run(cmd, check=True)

GEM = 'google/gemini-3.8-flash-tts'
takes = {
  'alpha': ("Bravo. Charlie. Prepare to set sail.", [
     (GEM, 'Kore', {'google-ai-studio': {'speech_metadata': {'style': 'a young female ship navigator giving a hushed, urgent order over a crackling radio; tense, thrilled, determined; short pauses after each name'}}}),
     (GEM, 'Leda', {'google-ai-studio': {'speech_metadata': {'style': 'a young female ship navigator giving a hushed, urgent order over a crackling radio; tense, thrilled, determined; short pauses after each name'}}}),
     ('microsoft/mai-voice-2', 'en-US-Harper:MAI-Voice-2', None),
  ]),
  'bravo': ("We did it! We're free!", [
     (GEM, 'Fenrir', {'google-ai-studio': {'speech_metadata': {'style': 'a burly young male sailor bellowing in breathless triumph while running, euphoric, loud'}}}),
     (GEM, 'Orus', {'google-ai-studio': {'speech_metadata': {'style': 'a burly young male sailor bellowing in breathless triumph while running, euphoric, loud'}}}),
     ('minimax/speech-2.8-hd', 'English_PassionateWarrior', None),
  ]),
  'rott': ("Looking for a way out, little anomalies?", [
     (GEM, 'Gacrux', {'google-ai-studio': {'speech_metadata': {'style': 'a colossal, ancient sea-witch; slow, sultry, mocking purr, salty-sweet menace, savouring every word with a cruel smile'}}}),
     (GEM, 'Despina', {'google-ai-studio': {'speech_metadata': {'style': 'a colossal, ancient sea-witch; slow, sultry, mocking purr, salty-sweet menace, savouring every word with a cruel smile'}}}),
     ('minimax/speech-2.8-hd', 'English_AssertiveQueen', None),
  ]),
}
only = sys.argv[1:] or list(takes)
for role in only:
    text, cands = takes[role]
    for i, (model, voice, popts) in enumerate(cands):
        tag = f"aud_{role}_{i}_{voice.split(':')[0]}"
        fmt = 'mp3' if model.startswith('minimax') else 'pcm'
        raw = f"vo/{tag}.{ 'mp3' if fmt=='mp3' else 'pcm'}"
        try:
            out, hdr = oc.tts(model, text, voice, raw, fmt=fmt, provider_opts=popts, purpose=f'audition {role}', estimate=0.02)
        except SystemExit as e:
            print('FAILED', tag, e); continue
        print(tag, hdr.get('Content-Type'), pathlib.Path(raw).stat().st_size)
        to_wav(raw, hdr.get('Content-Type'), f"vo/{tag}.wav")
