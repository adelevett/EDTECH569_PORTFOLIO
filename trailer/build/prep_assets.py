"""Build web-ready plates: colour JPEGs, packed 16-bit depth (RG) + tear map (B), layer mattes, voxel data."""
import cv2, numpy as np, json, pathlib, struct, sys
G = pathlib.Path('gen'); K = pathlib.Path('keyed'); OUT = pathlib.Path('../assets/img'); OUT.mkdir(parents=True, exist_ok=True)
META = {}

def guided(I, p, r, eps):
    mI = cv2.boxFilter(I, -1, (r, r)); mp = cv2.boxFilter(p, -1, (r, r))
    cIp = cv2.boxFilter(I * p, -1, (r, r)) - mI * mp
    vI = cv2.boxFilter(I * I, -1, (r, r)) - mI * mI
    a = cIp / (vI + eps); b = mp - a * mI
    return cv2.boxFilter(a, -1, (r, r)) * I + cv2.boxFilter(b, -1, (r, r))

def load_depth(name, W=1920, H=1080, refine=True):
    d = cv2.imread(str(G / f'{name}_depth.png'), -1).astype(np.float32) / 65535.0
    img = cv2.imread(str(G / f'{name}.png'))
    d = cv2.resize(d, (W, H), interpolation=cv2.INTER_AREA)
    if refine:
        g = cv2.cvtColor(cv2.resize(img, (W, H), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY).astype(np.float32) / 255
        d = guided(g, d, 9, 2e-4)
        d = cv2.medianBlur(d.astype(np.float32), 5)
    return np.clip(d, 0, 1)

def save_depth(d, name, W=1280, H=720, grid=(320, 180)):
    d = cv2.resize(d, (W, H), interpolation=cv2.INTER_AREA)
    # tear: local depth discontinuity measured at mesh-grid spacing
    sx = max(1, W // grid[0])
    k = np.ones((2 * sx + 1, 2 * sx + 1), np.uint8)
    tear = cv2.dilate(d, k) - cv2.erode(d, k)
    v = np.round(d * 65535).astype(np.uint32)
    rgb = np.dstack([np.clip(tear * 4 * 255, 0, 255).astype(np.uint8), (v & 255).astype(np.uint8), (v >> 8).astype(np.uint8)])  # BGR order: B=tear, G=lo, R=hi
    cv2.imwrite(str(OUT / f'{name}_depth.png'), rgb)

def save_color(img, name, q=90, size=None):
    if size: img = cv2.resize(img, size, interpolation=cv2.INTER_AREA)
    cv2.imwrite(str(OUT / f'{name}.jpg'), img, [cv2.IMWRITE_JPEG_QUALITY, q, cv2.IMWRITE_JPEG_OPTIMIZE, 1])

def inpaint_layer(img, d, mask, scale=4):
    """fill masked region of colour and depth (for the layer behind a foreground cut)."""
    h, w = mask.shape
    sm = cv2.resize(img, (w // scale, h // scale), interpolation=cv2.INTER_AREA)
    mm = cv2.resize(mask, (w // scale, h // scale), interpolation=cv2.INTER_NEAREST)
    fill = cv2.inpaint(sm, mm, 12, cv2.INPAINT_TELEA)
    fill = cv2.resize(fill, (w, h), interpolation=cv2.INTER_CUBIC)
    m3 = cv2.GaussianBlur(mask.astype(np.float32) / 255, (0, 0), 3)[..., None]
    out = (img * (1 - m3) + fill * m3).astype(np.uint8)
    dd = cv2.resize(d, (w // scale, h // scale), interpolation=cv2.INTER_AREA)
    dm = cv2.resize(mask, (w // scale, h // scale), interpolation=cv2.INTER_NEAREST)
    dd8 = (dd * 65535).astype(np.uint16)
    dfill = cv2.inpaint((dd * 255).astype(np.uint8), dm, 12, cv2.INPAINT_TELEA).astype(np.float32) / 255
    dfill = cv2.resize(dfill, (w, h), interpolation=cv2.INTER_CUBIC)
    mm2 = cv2.GaussianBlur(mask.astype(np.float32) / 255, (0, 0), 3)
    return out, d * (1 - mm2) + dfill * mm2

def diff_matte(a, b, region, thr=14, open_k=3, close_k=9, blur=2.0, sig=4, guide=None):
    A = cv2.GaussianBlur(cv2.cvtColor(a, cv2.COLOR_BGR2LAB).astype(np.float32), (0, 0), sig)
    B = cv2.GaussianBlur(cv2.cvtColor(b, cv2.COLOR_BGR2LAB).astype(np.float32), (0, 0), sig)
    da = np.sqrt(((A - B) ** 2).sum(2))
    m = (da > thr).astype(np.uint8) * 255
    m = cv2.bitwise_and(m, region)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((open_k, open_k), np.uint8))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((close_k, close_k), np.uint8))
    # keep big blobs, fill their holes
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, 8)
    keep = np.zeros_like(m)
    for i in range(1, n):
        if st[i, 4] > 0.002 * m.size: keep[lab == i] = 255
    cnts, _ = cv2.findContours(keep, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    filled = np.zeros_like(keep); cv2.drawContours(filled, cnts, -1, 255, -1)
    al = filled.astype(np.float32) / 255
    if guide is not None:
        g = cv2.cvtColor(guide, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255
        al = np.clip(guided(g, al, 7, 1e-3), 0, 1)
    al = cv2.GaussianBlur(al, (0, 0), blur)
    return (al * 255).astype(np.uint8)

def rgba_crop(img, alpha, name, pad=8):
    ys, xs = np.where(alpha > 8)
    x0, y0 = max(0, xs.min() - pad), max(0, ys.min() - pad)
    x1, y1 = min(img.shape[1], xs.max() + pad), min(img.shape[0], ys.max() + pad)
    cv2.imwrite(str(OUT / f'{name}.png'), np.dstack([img[y0:y1, x0:x1], alpha[y0:y1, x0:x1]]))
    return dict(x=int(x0), y=int(y0), w=int(x1 - x0), h=int(y1 - y0), W=int(img.shape[1]), H=int(img.shape[0]))

step = sys.argv[1] if len(sys.argv) > 1 else 'all'

if step in ('all', 'p1'):
    img = cv2.imread(str(G / 'P1_overlook.png')); d = load_depth('P1_overlook', 3840, 2160)
    fg = (d > 0.70).astype(np.uint8) * 255
    fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, np.ones((9, 9), np.uint8))
    bgimg, bgd = inpaint_layer(img, d, cv2.dilate(fg, np.ones((25, 25), np.uint8)))
    save_color(img, 'P1_color'); save_depth(d, 'P1')
    save_color(bgimg, 'P1_bg_color'); save_depth(bgd, 'P1_bg')
    a = cv2.GaussianBlur(fg, (0, 0), 2.0)
    META['P1_fg'] = dict(note='fg = near ridge, alpha only', thr=0.70)
    cv2.imwrite(str(OUT / 'P1_fgmask.png'), cv2.resize(a, (1920, 1080), interpolation=cv2.INTER_AREA))
    print('P1 done', (fg > 0).mean())

if step in ('all', 'p2'):
    p2 = cv2.imread(str(G / 'P2_docks.png')); pc = cv2.imread(str(G / 'P2_clean.png')); pn = cv2.imread(str(G / 'P2_noship.png'))
    H, W = p2.shape[:2]
    d2 = load_depth('P2_docks', W, H); dc = load_depth('P2_clean', W, H); dn = load_depth('P2_noship', W, H)
    reg = np.zeros((H, W), np.uint8); reg[:, :int(W * 0.36)] = 255
    lamp = diff_matte(p2, pc, reg, thr=13, close_k=21, blur=1.2, guide=p2)
    META['P2_fg'] = rgba_crop(p2, lamp, 'P2_fg')
    save_depth(d2, 'P2')  # fg + ship use P2 depth
    save_color(pc, 'P2_clean_color'); save_depth(dc, 'P2_clean')
    save_color(pn, 'P2_noship_color'); save_depth(dn, 'P2_noship')
    save_color(p2, 'P2_color')
    reg2 = np.zeros((H, W), np.uint8); reg2[:int(H * 0.80), int(W * 0.52):] = 255
    ship = diff_matte(p2, pn, reg2, thr=12, open_k=3, close_k=25, blur=1.5)
    META['P2_ship'] = rgba_crop(p2, ship, 'P2_ship')
    S = '/tmp/claude-0/-home-user-EDTECH569-PORTFOLIO/95c852e6-6b04-5eaf-86f9-c2721e7a47a1/scratchpad/'
    cv2.imwrite(S + 'mattes.jpg', np.hstack([cv2.resize(lamp, (960, 540)), cv2.resize(ship, (960, 540))]))
    print('P2 done')

if step in ('all', 'graphite'):
    for n, o in [('G1_desk', 'G1'), ('G3_floor', 'G3')]:
        img = cv2.imread(str(G / f'{n}.png')); d = load_depth(n, img.shape[1], img.shape[0])
        save_color(img, f'{o}_color'); save_depth(d, o)
    save_color(cv2.imread(str(G / 'G4a_eye_open.png')), 'G4a_color', size=(1920, 1080))
    save_color(cv2.imread(str(G / 'G4b_eye_closed_aligned.png')), 'G4b_color', size=(1920, 1080))
    print('graphite done')

if step in ('all', 'sprites'):
    import shutil
    for f in sorted(K.glob('*.png')):
        im = cv2.imread(str(f), cv2.IMREAD_UNCHANGED)
        h, w = im.shape[:2]
        s = min(1.0, 1400 / max(h, w))
        if s < 1: im = cv2.resize(im, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)
        cv2.imwrite(str(OUT / f.name), im)
        META[f.stem] = dict(w=im.shape[1], h=im.shape[0])
    print('sprites done', len(list(K.glob('*.png'))))

if step in ('all', 'rott'):
    def voxels(name, cell, lum_thr, dscale, out, extra=None):
        img = cv2.imread(str(G / f'{name}.png'), cv2.IMREAD_GRAYSCALE).astype(np.float32) / 255
        d = cv2.imread(str(G / f'{name}_depth.png'), -1).astype(np.float32) / 65535
        H, W = img.shape
        lum_s = cv2.resize(img, (W // cell, H // cell), interpolation=cv2.INTER_AREA)
        d_s = cv2.resize(d, (W // cell, H // cell), interpolation=cv2.INTER_AREA)
        pts = []
        for j in range(lum_s.shape[0]):
            for i in range(lum_s.shape[1]):
                l = lum_s[j, i]
                if l < lum_thr: continue
                u = (i + 0.5) / lum_s.shape[1]; v = (j + 0.5) / lum_s.shape[0]
                pts.append((u, v, float(d_s[j, i]), float(l)))
        arr = np.array(pts, np.float32)
        arr.tofile(str(OUT / out))
        META[out] = dict(count=len(pts), cols=lum_s.shape[1], rows=lum_s.shape[0], aspect=W / H)
        print(out, len(pts))
    voxels('R1_rott_face', 6, 0.07, 1, 'rott_face.bin')
    voxels('R2_rott_hand', 7, 0.08, 1, 'rott_hand.bin')

mp = OUT / 'meta.json'
old = json.loads(mp.read_text()) if mp.exists() else {}
old.update(META); mp.write_text(json.dumps(old, indent=1))
