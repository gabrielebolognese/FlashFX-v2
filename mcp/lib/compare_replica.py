"""Compare a FlashFX replica against its reference video.

    python -I mcp/lib/compare_replica.py <reference.mp4> <replica.mp4> <out_dir> [--max-shift 12] [--ssim-side 960]

Writes into <out_dir>:
  side-by-side.mp4   reference left, replica right (same height), 1-based reference frame counter burned in
  ssim.json          offset used, mean / median / min SSIM, per-shot means if --shots is given, the worst 10 frames
  ssim.csv           frame (1-based reference numbering), replica frame (0-based FlashFX), ssim
  worst/             the 10 worst frames as reference | replica pairs (JPEG, SSIM in the label)

SSIM: luma (BT.601), Gaussian window 11 / sigma 1.5 (Wang et al. 2004), computed after downscaling both frames so the
long side is --ssim-side px (default 960). Temporal alignment: the replica is shifted by the integer offset in
[-max-shift, +max-shift] that maximizes mean SSIM over every 4th frame at a 240 px proxy; the side-by-side uses the
same offset. A FlashFX frame f (0-based) is reference frame f + 1 (1-based) at offset 0.

Only numpy, OpenCV and the ffmpeg CLI are needed. Inputs are treated as data (decoded by ffmpeg, never executed).
"""
import argparse
import json
import os
import subprocess
import sys

import cv2
import numpy as np


def probe(path):
    out = subprocess.run(
        ['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate,nb_frames',
         '-of', 'json', path], capture_output=True, text=True, check=True).stdout
    s = json.loads(out)['streams'][0]
    num, den = s['r_frame_rate'].split('/')
    return int(s['width']), int(s['height']), float(num) / float(den)


def read_gray(path, w, h, fps):
    """Every frame as uint8 luma at w x h, resampled to fps (both videos normally already match)."""
    cmd = ['ffmpeg', '-v', 'error', '-i', path, '-vf', f'fps={fps},scale={w}:{h}:flags=area,format=gray', '-f', 'rawvideo', '-']
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    n = len(raw) // (w * h)
    return np.frombuffer(raw[: n * w * h], np.uint8).reshape(n, h, w)


def fg_mask(f):
    """Foreground = pixels more than 14 luma levels from the frame's dominant (median) level: the flat grounds of
    motion design dominate whole-frame SSIM, so the content-only score is reported next to it."""
    m = np.abs(f.astype(np.int16) - int(np.median(f))) > 14
    return cv2.dilate(m.astype(np.uint8), np.ones((9, 9), np.uint8)) > 0


def ssim_fg(a, b):
    """(SSIM over the union of both foregrounds, foreground IoU); (None, None) when neither frame has content."""
    ma, mb = fg_mask(a), fg_mask(b)
    u = ma | mb
    if u.sum() < 50:
        return None, None
    m = ssim_map(a, b)
    return float(m[u].mean()), float((ma & mb).sum() / u.sum())


def ssim(a, b):
    return float(ssim_map(a, b)[5:-5, 5:-5].mean())


def ssim_map(a, b):
    a = a.astype(np.float64)
    b = b.astype(np.float64)
    c1, c2 = (0.01 * 255) ** 2, (0.03 * 255) ** 2
    blur = lambda x: cv2.GaussianBlur(x, (11, 11), 1.5)
    mu_a, mu_b = blur(a), blur(b)
    saa = blur(a * a) - mu_a * mu_a
    sbb = blur(b * b) - mu_b * mu_b
    sab = blur(a * b) - mu_a * mu_b
    return ((2 * mu_a * mu_b + c1) * (2 * sab + c2)) / ((mu_a ** 2 + mu_b ** 2 + c1) * (saa + sbb + c2))


def pairs(n_ref, n_rep, off):
    """Reference index i (0-based) pairs with replica index i - off."""
    return [(i, i - off) for i in range(n_ref) if 0 <= i - off < n_rep]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('reference')
    ap.add_argument('replica')
    ap.add_argument('out_dir')
    ap.add_argument('--max-shift', type=int, default=12)
    ap.add_argument('--ssim-side', type=int, default=960)
    ap.add_argument('--shots', help='JSON list of [id, in, out] (1-based reference frames) for per-shot means')
    ap.add_argument('--offset', type=int, help='Force the temporal offset instead of searching')
    ap.add_argument('--no-video', action='store_true', help='Skip the side-by-side render')
    args = ap.parse_args()
    os.makedirs(args.out_dir, exist_ok=True)

    rw, rh, rfps = probe(args.reference)
    pw, ph, pfps = probe(args.replica)
    scale = args.ssim_side / max(rw, rh)
    sw, sh = max(16, round(rw * scale / 2) * 2), max(16, round(rh * scale / 2) * 2)
    ref = read_gray(args.reference, sw, sh, rfps)
    rep = read_gray(args.replica, sw, sh, rfps)

    # 1. temporal alignment on a 240 px proxy
    px = 240 / max(sw, sh)
    pw2, ph2 = max(16, round(sw * px)), max(16, round(sh * px))
    small = lambda arr: np.stack([cv2.resize(f, (pw2, ph2), interpolation=cv2.INTER_AREA) for f in arr])
    ref_s, rep_s = small(ref), small(rep)
    search = {}
    if args.offset is not None:
        best = args.offset
    else:
        for off in range(-args.max_shift, args.max_shift + 1):
            pr = pairs(len(ref_s), len(rep_s), off)[::4]
            search[off] = float(np.mean([ssim(ref_s[i], rep_s[j]) for i, j in pr])) if pr else -1
        best = max(search, key=search.get)

    # 2. full SSIM at the chosen offset (and at 0 for honesty)
    rows = []
    fg = []
    for i, j in pairs(len(ref), len(rep), best):
        rows.append((i + 1, j, ssim(ref[i], rep[j])))
        fg.append(ssim_fg(ref[i], rep[j]))
    vals = np.array([r[2] for r in rows])
    zero = [ssim(ref[i], rep[j]) for i, j in pairs(len(ref), len(rep), 0)[::4]]
    with open(os.path.join(args.out_dir, 'ssim.csv'), 'w') as f:
        f.write('ref_frame_1based,replica_frame_0based,ssim,ssim_fg,fg_iou\n')
        for (a, b, s), (sf, iou) in zip(rows, fg):
            f.write(f'{a},{b},{s:.5f},{"" if sf is None else f"{sf:.5f}"},{"" if iou is None else f"{iou:.4f}"}\n')
    fgv = np.array([x[0] for x in fg if x[0] is not None])
    iouv = np.array([x[1] for x in fg if x[1] is not None])

    worst = sorted(rows, key=lambda r: r[2])[:10]
    wdir = os.path.join(args.out_dir, 'worst')
    os.makedirs(wdir, exist_ok=True)
    for old in os.listdir(wdir):
        os.remove(os.path.join(wdir, old))
    for a, b, s in worst:
        L = full_frame(args.reference, a - 1, rfps, rw, rh)
        R = full_frame(args.replica, b, rfps, rw, rh)
        img = np.concatenate([L, R], axis=1)
        tw = 1600
        img = cv2.resize(img, (tw, round(img.shape[0] * tw / img.shape[1])), interpolation=cv2.INTER_AREA)
        label = f'ref f{a} | replica f{b} | SSIM {s:.3f}'
        cv2.rectangle(img, (0, 0), (img.shape[1], 34), (0, 0, 0), -1)
        cv2.putText(img, label, (10, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2, cv2.LINE_AA)
        cv2.imwrite(os.path.join(wdir, f'worst_ref{a:05d}_ssim{s:.3f}.jpg'), img, [cv2.IMWRITE_JPEG_QUALITY, 88])

    shots = []
    if args.shots:
        for sid, a, b in json.loads(open(args.shots).read() if os.path.exists(args.shots) else args.shots):
            v = [r[2] for r in rows if a <= r[0] <= b]
            vf = [x[0] for r, x in zip(rows, fg) if a <= r[0] <= b and x[0] is not None]
            if v:
                shots.append({'shot': sid, 'in': a, 'out': b, 'mean': round(float(np.mean(v)), 4), 'min': round(float(np.min(v)), 4),
                              'fg_mean': round(float(np.mean(vf)), 4) if vf else None})

    report = {
        'reference': os.path.abspath(args.reference), 'replica': os.path.abspath(args.replica),
        'reference_size': [rw, rh, rfps], 'replica_size': [pw, ph, pfps],
        'frames_compared': len(rows), 'reference_frames': len(ref), 'replica_frames': len(rep),
        'ssim_resolution': [sw, sh], 'method': 'luma SSIM, Gaussian 11/1.5, after temporal alignment',
        'offset_frames': best, 'offset_meaning': 'replica frame j shows reference frame j + 1 + offset (1-based)',
        'ssim_mean': round(float(vals.mean()), 4), 'ssim_median': round(float(np.median(vals)), 4),
        'ssim_min': round(float(vals.min()), 4), 'ssim_p10': round(float(np.percentile(vals, 10)), 4),
        'ssim_fg_mean': round(float(fgv.mean()), 4) if len(fgv) else None,
        'ssim_fg_median': round(float(np.median(fgv)), 4) if len(fgv) else None,
        'fg_iou_mean': round(float(iouv.mean()), 4) if len(iouv) else None,
        'fg_note': 'ssim_fg = SSIM averaged only over pixels that are foreground (> 14 luma levels from the median) in either frame; fg_iou = overlap of the two foreground masks. Whole-frame SSIM is inflated by flat grounds.',
        'ssim_mean_offset0_sampled': round(float(np.mean(zero)), 4) if zero else None,
        'offset_search': {str(k): round(v, 4) for k, v in search.items()},
        'per_shot': shots,
        'worst10': [{'ref_frame': a, 'replica_frame': b, 'ssim': round(s, 4)} for a, b, s in worst],
    }
    with open(os.path.join(args.out_dir, 'ssim.json'), 'w') as f:
        json.dump(report, f, indent=1)

    if not args.no_video:
        side_by_side(args.reference, args.replica, os.path.join(args.out_dir, 'side-by-side.mp4'), best, rw, rh, rfps)
    print(json.dumps({k: report[k] for k in ('offset_frames', 'ssim_mean', 'ssim_median', 'ssim_min', 'ssim_fg_mean', 'fg_iou_mean', 'frames_compared')}))


def full_frame(path, idx, fps, w, h):
    t = idx / fps
    cmd = ['ffmpeg', '-v', 'error', '-ss', f'{max(0.0, t):.6f}', '-i', path, '-frames:v', '1', '-vf', f'scale={w}:{h}',
           '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-']
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    if len(raw) < w * h * 3:
        return np.zeros((h, w, 3), np.uint8)
    return np.frombuffer(raw[: w * h * 3], np.uint8).reshape(h, w, 3).copy()


def side_by_side(reference, replica, out, off, w, h, fps):
    """hstack at the reference height (capped at 1080), offset applied to the replica, frame counters burned in."""
    H = min(h, 1080)
    H -= H % 2
    W = round(w * H / h / 2) * 2
    font = 'C\\:/Windows/Fonts/arial.ttf' if os.name == 'nt' else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
    fs = max(18, H // 40)
    # replica frame j shows reference frame j + 1 + off: delay the replica by `off` frames (pad) or cut its head.
    if off >= 0:
        shift = f'tpad=start={off}:color=black,'
    else:
        shift = f'trim=start_frame={-off},setpts=PTS-STARTPTS,'
    txt = lambda label: (f"drawtext=fontfile='{font}':text='{label}  f%{{eif\\:n+1\\:d}}':x=16:y=16:fontsize={fs}:"
                         "fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=8")
    fc = (f"[0:v]fps={fps},scale={W}:{H},setsar=1,{txt('REFERENCE')}[a];"
          f"[1:v]fps={fps},{shift}scale={W}:{H},setsar=1,{txt('FLASHFX REPLICA (ref frame)')}[b];"
          "[a][b]hstack=inputs=2:shortest=1[v]")
    cmd = ['ffmpeg', '-v', 'error', '-y', '-i', reference, '-i', replica, '-filter_complex', fc, '-map', '[v]', '-an',
           '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'medium', out]
    subprocess.run(cmd, check=True)


if __name__ == '__main__':
    sys.exit(main())
