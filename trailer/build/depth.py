"""Monocular depth (Depth Anything V2 Large, ONNX, CPU) for painted plates.
Outputs relative inverse depth (disparity) normalised 0..1 (1 = near) as 16-bit PNG."""
import sys, time, numpy as np, onnxruntime as ort, cv2
MODEL = "/tmp/claude-0/-home-user-EDTECH569-PORTFOLIO/95c852e6-6b04-5eaf-86f9-c2721e7a47a1/scratchpad/models/dav2_large.onnx"
_sess = None

def sess():
    global _sess
    if _sess is None:
        so = ort.SessionOptions(); so.intra_op_num_threads = 4
        _sess = ort.InferenceSession(MODEL, so, providers=["CPUExecutionProvider"])
    return _sess

def infer(img_bgr, long_side=770):
    h, w = img_bgr.shape[:2]
    s = long_side / max(h, w)
    nh, nw = int(round(h * s / 14)) * 14, int(round(w * s / 14)) * 14
    x = cv2.resize(img_bgr, (nw, nh), interpolation=cv2.INTER_CUBIC)[:, :, ::-1].astype(np.float32) / 255.0
    x = (x - np.array([0.485, 0.456, 0.406], np.float32)) / np.array([0.229, 0.224, 0.225], np.float32)
    x = x.transpose(2, 0, 1)[None]
    inp = sess().get_inputs()[0].name
    out = sess().run(None, {inp: x})[0]
    d = out[0] if out.ndim == 3 else out[0, 0]
    d = cv2.resize(d.astype(np.float32), (w, h), interpolation=cv2.INTER_CUBIC)
    return d

def infer_tta(img_bgr):
    # average two scales + horizontal flip for stabler, sharper depth
    ds = []
    for ls in (518, 812):
        ds.append(infer(img_bgr, ls))
        ds.append(infer(img_bgr[:, ::-1].copy(), ls)[:, ::-1])
    ds = [ (d - d.min()) / (d.max() - d.min() + 1e-6) for d in ds ]
    return np.mean(ds, 0)

if __name__ == "__main__":
    src, dst = sys.argv[1], sys.argv[2]
    img = cv2.imread(src, cv2.IMREAD_COLOR)
    t = time.time()
    d = infer_tta(img)
    d = (d - d.min()) / (d.max() - d.min() + 1e-6)
    cv2.imwrite(dst, (d * 65535).astype(np.uint16))
    print(f"depth {src} -> {dst} {img.shape} in {time.time()-t:.1f}s")
