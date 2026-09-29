"""Final QA on trailer.mp4: stills every 1 s, 3-frame strips across every cut, the final 4 s frame by frame,
audio peak/true-peak/runtime, and A/V sync of the key hits. Writes sheets to the scratchpad."""
import subprocess, json, re, sys, os, numpy as np, cv2, soundfile as sf, scipy.signal as ss
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
MP4 = os.path.join(ROOT, 'trailer.mp4')
S = '/tmp/claude-0/-home-user-EDTECH569-PORTFOLIO/95c852e6-6b04-5eaf-86f9-c2721e7a47a1/scratchpad/qa_final'
os.makedirs(S, exist_ok=True)
probe = json.loads(subprocess.run(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', MP4], capture_output=True, text=True).stdout)
v = [s for s in probe['streams'] if s['codec_type'] == 'video'][0]; a = [s for s in probe['streams'] if s['codec_type'] == 'audio'][0]
print(f"video {v['codec_name']} {v['width']}x{v['height']} {v['r_frame_rate']} frames={v.get('nb_frames')} dur={v.get('duration')}")
print(f"audio {a['codec_name']} {a['sample_rate']} Hz ch={a['channels']} dur={a.get('duration')}")
print(f"container duration {float(probe['format']['duration']):.3f}s size {int(probe['format']['size'])/1e6:.1f} MB")
# decode all frames once (small: 870 x 1920x1080x3 = 5.4 GB is too much) -> stream and pick
want = set()
T = lambda t: int(round(t * 30))
stills = [T(x + 0.5) for x in range(29)]
tl = open(os.path.join(ROOT, 'src/timeline.js')).read()
EDIT = {k: [float(p), float(q)] for k, p, q in re.findall(r"(\w+): \[([\d.]+), ([\d.]+)\]", tl)}
MC = [float(x) for x in re.search(r"MAEL_CUTS = \[([^\]]+)\]", tl).group(1).split(',')]
PL = {k: float(eval(x)) for k, x in re.findall(r"(\w+): ([\d./ ]+?)[,}]", re.search(r"PL = \{([^}]+)\}", tl).group(1) + '}')}
cuts = sorted(set([EDIT[k][0] for k in EDIT] + [EDIT['maelstrom'][0] + c for c in MC[1:4]] + [EDIT['plunk'][0] + PL[k] for k in ('deskEnd', 'floorEnd', 'eyeEnd', 'snap')]))
cutframes = [int(np.ceil(c * 30 - 1e-6)) for c in cuts if c > 0]
strips = [[f - 1, f, f + 1] for f in cutframes]
final = list(range(750, 870))
for f in stills + final: want.add(f)
for s in strips: want.update(s)
W, H = 1920, 1080
p = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', MP4, '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-'], stdout=subprocess.PIPE)
frames = {}; i = 0; means = []
while True:
    buf = p.stdout.read(W * H * 3)
    if len(buf) < W * H * 3: break
    im = np.frombuffer(buf, np.uint8).reshape(H, W, 3)
    means.append(float(im.mean()))
    if i in want: frames[i] = cv2.resize(im, (480, 270), interpolation=cv2.INTER_AREA)
    i += 1
print('decoded frames', i)
def lab(im, txt):
    im = im.copy(); cv2.putText(im, txt, (6, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 1); return im
def grid(ims, cols):
    while len(ims) % cols: ims.append(np.zeros_like(ims[0]))
    return np.vstack([np.hstack(ims[k:k + cols]) for k in range(0, len(ims), cols)])
cv2.imwrite(f'{S}/stills.jpg', grid([lab(frames[f], f'{f/30:.1f}s') for f in stills if f in frames], 5), [cv2.IMWRITE_JPEG_QUALITY, 85])
rows = [np.hstack([lab(frames[f], f'f{f} {f/30:.3f}s') for f in s if f in frames]) for s in strips if all(f in frames for f in s)]
for k in range(0, len(rows), 7): cv2.imwrite(f'{S}/strips_{k//7}.jpg', np.vstack(rows[k:k + 7]), [cv2.IMWRITE_JPEG_QUALITY, 85])
for k in range(0, len(final), 20): cv2.imwrite(f'{S}/final_{k//20}.jpg', grid([lab(frames[f], f'f{f} {f/30:.3f}s') for f in final[k:k + 20]], 5), [cv2.IMWRITE_JPEG_QUALITY, 85])
# audio from the MP4
wav = f'{S}/mp4_audio.wav'
subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', MP4, '-vn', '-ac', '2', '-ar', '48000', '-c:a', 'pcm_f32le', wav], check=True)
y, sr = sf.read(wav)
print(f"mp4 audio: dur {len(y)/sr:.3f}s  sample peak {20*np.log10(np.abs(y).max()):.2f} dBFS  true peak(8x) {20*np.log10(np.abs(ss.resample_poly(y, 8, 1, axis=0)).max()):.2f} dBTP")
# black-frame and flash-frame report
lum = np.array(means)
print('near-black frames:', [k for k in range(len(lum)) if lum[k] < 3.0][:40], '...')
print('cut frames checked:', cutframes)
