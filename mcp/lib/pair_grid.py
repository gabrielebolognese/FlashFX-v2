"""Reference | replica pairs for a handful of frames, in one labelled grid (fast iteration without a full export).

    python -I mcp/lib/pair_grid.py <reference.mp4> <out.png> <refFrame>=<replica.png> [<refFrame>=<replica.png> ...]

refFrame is 1-based (reference numbering); each replica PNG is a FlashFX render_frame of frame refFrame - 1.
Prints the PNG path, then one JSON line with per-frame and mean scores. Each tile shows the reference frame left and the replica right at 360 px per side, with whole-frame and
foreground SSIM in the label (same metrics as compare_replica.py).
"""
import json
import os
import sys

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from compare_replica import full_frame, probe, ssim, ssim_fg  # noqa: E402


def main():
    ref, out, *items = sys.argv[1:]
    w, h, fps = probe(ref)
    side = 360
    th = round(h * side / w)
    tiles = []
    scores = []
    for it in items:
        f, png = it.split('=', 1)
        f = int(f)
        L = full_frame(ref, f - 1, fps, w, h)
        R = cv2.imread(png)
        R = cv2.resize(R, (w, h), interpolation=cv2.INTER_AREA) if R is not None else np.zeros_like(L)
        gl = cv2.cvtColor(cv2.resize(L, (side * 2, th * 2)), cv2.COLOR_BGR2GRAY)
        gr = cv2.cvtColor(cv2.resize(R, (side * 2, th * 2)), cv2.COLOR_BGR2GRAY)
        s, (sf, iou) = ssim(gl, gr), ssim_fg(gl, gr)
        scores.append({'ref_frame': f, 'ssim': round(s, 4), 'ssim_fg': None if sf is None else round(sf, 4), 'fg_iou': None if iou is None else round(iou, 4)})
        tile = np.concatenate([cv2.resize(L, (side, th)), cv2.resize(R, (side, th))], axis=1)
        cv2.rectangle(tile, (0, 0), (tile.shape[1], 26), (0, 0, 0), -1)
        lab = f'ref f{f} | replica  SSIM {s:.3f}  fg {sf:.3f}' if sf is not None else f'ref f{f} | replica  SSIM {s:.3f}'
        cv2.putText(tile, lab, (8, 19), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1, cv2.LINE_AA)
        cv2.line(tile, (side, 0), (side, th), (0, 0, 255), 2)
        tiles.append(tile)
    cols = 2 if len(tiles) > 1 else 1
    rows = []
    for i in range(0, len(tiles), cols):
        row = tiles[i:i + cols]
        while len(row) < cols:
            row.append(np.zeros_like(tiles[0]))
        rows.append(np.concatenate(row, axis=1))
    cv2.imwrite(out, np.concatenate(rows, axis=0))
    print(out)
    fgs = [x['ssim_fg'] for x in scores if x['ssim_fg'] is not None]
    print(json.dumps({'frames': scores, 'ssim_mean': round(float(np.mean([x['ssim'] for x in scores])), 4),
                      'ssim_fg_mean': round(float(np.mean(fgs)), 4) if fgs else None}))


if __name__ == '__main__':
    main()
