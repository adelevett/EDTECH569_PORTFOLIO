"""Use an audio-capable LLM as a listening proxy (I cannot hear). Logs cost to the ledger."""
import sys, json, base64, time, requests, pathlib; sys.path.insert(0, '.')
import orclient as oc
JUDGE = 'google/gemini-3.8-flash'

def ask(wavs, question, max_tokens=6000):
    oc.guard(0.02)
    content = [{"type": "text", "text": question}]
    for label, w in wavs:
        content.append({"type": "text", "text": f"Audio clip {label}:"})
        content.append({"type": "input_audio", "input_audio": {"data": base64.b64encode(pathlib.Path(w).read_bytes()).decode(), "format": "wav"}})
    body = {"model": JUDGE, "messages": [{"role": "user", "content": content}], "max_tokens": max_tokens, "temperature": 0.2, "reasoning": {"effort": "low"}}
    r = requests.post(oc.API + "/chat/completions", headers=oc._h(), json=body, timeout=300)
    j = r.json()
    if 'choices' not in j:
        print(j); raise SystemExit('judge failed')
    u = j.get('usage', {})
    oc._log({"t": time.time(), "kind": "judge", "model": JUDGE, "purpose": "listen: " + question[:60], "usage": u, "cost": u.get('cost', 0.01)})
    return j['choices'][0]['message']['content']

if __name__ == '__main__':
    role, direction = sys.argv[1], sys.argv[2]
    files = sorted(pathlib.Path('vo').glob(f'aud_{role}_*.wav'))
    wavs = [(chr(65 + i), str(f)) for i, f in enumerate(files)]
    for lab, f in wavs: print(lab, f)
    q = ("You are a film trailer casting director with expert ears. Several text-to-speech takes of the SAME line follow. "
         f"Direction for the character: {direction}\n"
         "For each clip give: verbatim transcript, perceived gender/age, 1-10 scores for (a) naturalness/human realism, "
         "(b) emotional match to the direction, (c) clarity, (d) absence of artifacts/glitches, and one sentence of notes "
         "(mention any mispronunciation, robotic prosody, clipping, odd pauses). Then name the single best take for a "
         "high-end cinematic trailer and why. Be critical and specific.")
    print(ask(wavs, q))
