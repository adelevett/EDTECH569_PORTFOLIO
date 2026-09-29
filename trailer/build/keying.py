"""Chroma-key flat-green sprites, split into connected figures, trim, despill."""
import cv2, numpy as np, json, sys, pathlib

def key_green(img_bgr, lo=18, hi=70):
    f = img_bgr.astype(np.float32)
    b, g, r = f[..., 0], f[..., 1], f[..., 2]
    spill = g - np.maximum(r, b)                     # how green a pixel is
    a = 1.0 - np.clip((spill - lo) / (hi - lo), 0, 1)
    # hard background: very green -> 0
    a[(g > 180) & (r < 90) & (b < 90)] = 0
    # despill: clamp green to max(r,b) plus a little
    g2 = np.minimum(g, np.maximum(r, b) * 1.02 + 2)
    out = np.dstack([b, g2, r]).clip(0, 255).astype(np.uint8)
    a = cv2.GaussianBlur(a, (3, 3), 0)
    return out, (a * 255).astype(np.uint8)

def components(alpha, min_area_frac=0.004, merge_px=24):
    m = (alpha > 40).astype(np.uint8)
    m2 = cv2.dilate(m, np.ones((merge_px, merge_px), np.uint8))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(m2, 8)
    H, W = alpha.shape
    boxes = []
    for i in range(1, n):
        x, y, w, h, area = stats[i]
        if area < min_area_frac * H * W: continue
        boxes.append((x, y, w, h, i))
    boxes.sort(key=lambda b: b[0])
    return boxes, lab

def save_rgba(bgr, a, path, pad=16):
    rgba = np.dstack([bgr, a])
    cv2.imwrite(str(path), rgba)

if __name__ == '__main__':
    src, prefix = sys.argv[1], sys.argv[2]
    split = len(sys.argv) > 3 and sys.argv[3] == 'split'
    img = cv2.imread(src)
    bgr, a = key_green(img)
    meta = []
    if split:
        boxes, lab = components(a)
        for k, (x, y, w, h, i) in enumerate(boxes):
            pad = 12
            x0, y0 = max(0, x - pad), max(0, y - pad); x1, y1 = min(a.shape[1], x + w + pad), min(a.shape[0], y + h + pad)
            m = (lab[y0:y1, x0:x1] == i).astype(np.uint8)
            m = cv2.dilate(m, np.ones((5, 5), np.uint8))
            aa = (a[y0:y1, x0:x1].astype(np.float32) * m).astype(np.uint8)
            p = f"{prefix}_{k}.png"
            save_rgba(bgr[y0:y1, x0:x1], aa, p)
            meta.append(dict(file=pathlib.Path(p).name, x=int(x0), y=int(y0), w=int(x1 - x0), h=int(y1 - y0)))
    else:
        ys, xs = np.where(a > 20)
        x0, y0, x1, y1 = max(0, xs.min() - 12), max(0, ys.min() - 12), min(a.shape[1], xs.max() + 12), min(a.shape[0], ys.max() + 12)
        p = f"{prefix}.png"
        save_rgba(bgr[y0:y1, x0:x1], a[y0:y1, x0:x1], p)
        meta.append(dict(file=pathlib.Path(p).name, x=int(x0), y=int(y0), w=int(x1 - x0), h=int(y1 - y0)))
    print(json.dumps(meta))
