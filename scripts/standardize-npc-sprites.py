#!/usr/bin/env python3
"""Standardize NPC sprite images: chroma-key green removal, despill, and canvas alignment."""

from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path
import sys
import numpy as np
from PIL import Image

EXPRESSIONS = ("normal", "happy", "cheer", "thinking", "sleepy")
DEFAULT_CANVAS = (764, 1024, 47)


def remove_green_screen(rgba: np.ndarray) -> np.ndarray:
    """Extract transparent alpha from a #00FF00 green screen with 2-ring despill."""
    h, w, _ = rgba.shape
    if h == 0 or w == 0:
        return rgba

    # Skip if all four corners are already transparent
    corners = [rgba[0, 0, 3], rgba[0, w - 1, 3], rgba[h - 1, 0, 3], rgba[h - 1, w - 1, 3]]
    if all(int(c) < 16 for c in corners):
        return rgba

    arr = rgba.astype(np.int32)
    r = arr[:, :, 0]
    g = arr[:, :, 1]
    b = arr[:, :, 2]
    a = arr[:, :, 3]
    max_rb = np.maximum(r, b)

    is_chroma = (a < 16) | (
        (g >= 80) & ((g - max_rb) >= 34) & (g > r * 1.28) & (g > b * 1.28)
    )
    is_seed = (
        (a >= 16) & (g >= 115) & ((g - max_rb) >= 48) & (g > r * 1.35) & (g > b * 1.35)
    )

    visited = np.zeros((h, w), dtype=bool)
    chroma_list = is_chroma.tolist()
    seed_list = is_seed.tolist()
    vis_list = visited.tolist()
    q: deque[tuple[int, int]] = deque()

    def enqueue_if_chroma(y: int, x: int) -> None:
        if not vis_list[y][x] and chroma_list[y][x]:
            vis_list[y][x] = True
            q.append((y, x))

    # 1. Seed all four outer edges
    for x in range(w):
        enqueue_if_chroma(0, x)
        if h > 1:
            enqueue_if_chroma(h - 1, x)
    for y in range(1, h - 1):
        enqueue_if_chroma(y, 0)
        if w > 1:
            enqueue_if_chroma(y, w - 1)

    # 2. Seed strong enclosed chroma-green pockets (hair/hand/prop gaps)
    for y in range(1, h - 1):
        seed_row = seed_list[y]
        vis_row = vis_list[y]
        for x in range(1, w - 1):
            if not vis_row[x] and seed_row[x]:
                vis_row[x] = True
                q.append((y, x))

    while q:
        cy, cx = q.popleft()
        if cx > 0 and not vis_list[cy][cx - 1] and chroma_list[cy][cx - 1]:
            vis_list[cy][cx - 1] = True
            q.append((cy, cx - 1))
        if cx + 1 < w and not vis_list[cy][cx + 1] and chroma_list[cy][cx + 1]:
            vis_list[cy][cx + 1] = True
            q.append((cy, cx + 1))
        if cy > 0 and not vis_list[cy - 1][cx] and chroma_list[cy - 1][cx]:
            vis_list[cy - 1][cx] = True
            q.append((cy - 1, cx))
        if cy + 1 < h and not vis_list[cy + 1][cx] and chroma_list[cy + 1][cx]:
            vis_list[cy + 1][cx] = True
            q.append((cy + 1, cx))

    visited = np.array(vis_list, dtype=bool)
    a[visited] = 0

    # 3. 2-ring boundary feathering & green spill suppression
    vp = np.pad(visited, 1, mode="constant", constant_values=False)
    has_visited_8 = (
        vp[:-2, :-2]
        | vp[:-2, 1:-1]
        | vp[:-2, 2:]
        | vp[1:-1, :-2]
        | vp[1:-1, 2:]
        | vp[2:, :-2]
        | vp[2:, 1:-1]
        | vp[2:, 2:]
    )
    ring1 = (~visited) & has_visited_8

    r1p = np.pad(ring1, 1, mode="constant", constant_values=False)
    has_ring1_4 = r1p[:-2, 1:-1] | r1p[2:, 1:-1] | r1p[1:-1, :-2] | r1p[1:-1, 2:]
    ring2 = (~visited) & (~ring1) & has_ring1_4

    green_excess = g - max_rb

    # Ring 1 adjustments
    r1_mask = ring1 & (a > 0) & (green_excess > 6)
    if np.any(r1_mask):
        af1 = np.clip(1.0 - (green_excess[r1_mask] - 6.0) / 28.0, 0.0, 1.0)
        new_a1 = np.round(a[r1_mask] * af1).astype(np.int32)
        mrb1 = max_rb[r1_mask]
        target_g1 = np.where(mrb1 < 85, np.round(mrb1 * 0.96).astype(np.int32), mrb1)
        g_vals1 = g[r1_mask]
        g[r1_mask] = np.where(new_a1 == 0, g_vals1, np.minimum(g_vals1, target_g1))
        a[r1_mask] = new_a1

    # Ring 2 adjustments
    r2_mask = ring2 & (a > 0) & (green_excess > 8)
    if np.any(r2_mask):
        af2 = np.clip(1.0 - (green_excess[r2_mask] - 8.0) / 48.0, 0.25, 1.0)
        g[r2_mask] = np.minimum(g[r2_mask], max_rb[r2_mask])
        a[r2_mask] = np.round(a[r2_mask] * af2).astype(np.int32)

    out = arr.astype(np.uint8)
    # Zero out RGB for fully transparent pixels to optimize PNG compression
    out[out[:, :, 3] == 0, :3] = 0
    return out


def inspect_alpha_bounds(im: Image.Image) -> tuple[int, int, int, int, int, int, int]:
    """Return (x_min, y_min, x_max, y_max, zero_count, semi_count, opaque_count)."""
    arr = np.array(im.convert("RGBA"))
    alpha = arr[:, :, 3]
    ys, xs = np.where(alpha > 16)
    if len(ys) == 0:
        raise ValueError("Foreground mask is empty after background removal.")
    return (
        int(xs.min()),
        int(ys.min()),
        int(xs.max()),
        int(ys.max()),
        int(np.sum(alpha == 0)),
        int(np.sum((alpha > 0) & (alpha < 255))),
        int(np.sum(alpha == 255)),
    )


def standardize_canvas(
    im: Image.Image, target_w: int, target_h: int, target_top_y: int
) -> Image.Image:
    """Match target canvas size and align character bottom flush with canvas bottom."""
    x_min, y_min, x_max, y_max, _, _, _ = inspect_alpha_bounds(im)
    if (
        im.size == (target_w, target_h)
        and abs(y_min - target_top_y) <= 2
        and y_max >= target_h - 2
    ):
        return im

    src_crop = im.crop((x_min, y_min, x_max + 1, y_max + 1))
    target_char_h = max(1, target_h - target_top_y)
    scale = target_char_h / src_crop.height
    new_w = max(1, round(src_crop.width * scale))
    new_h = target_char_h

    resized = src_crop.resize((new_w, new_h), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))
    paste_x = (target_w - new_w) // 2
    paste_y = target_h - new_h
    canvas.paste(resized, (paste_x, paste_y), resized)
    return canvas


def resolve_target_metrics(
    character: str | None,
    ref_path: str | None,
    out_dir: Path,
    width: int | None,
    height: int | None,
    top_y: int | None,
) -> tuple[int, int, int]:
    """Resolve target canvas width, height, and top margin from a reference sprite or CLI args."""
    ref_w, ref_h, ref_top_y = DEFAULT_CANVAS
    resolved_ref: Path | None = None

    if ref_path:
        resolved_ref = Path(ref_path)
    elif character:
        candidate = out_dir / f"{character}-normal.png"
        if candidate.exists():
            resolved_ref = candidate

    if resolved_ref and resolved_ref.exists():
        ref_im = Image.open(resolved_ref).convert("RGBA")
        ref_w, ref_h = ref_im.size
        _, r_ymin, _, _, _, _, _ = inspect_alpha_bounds(ref_im)
        ref_top_y = r_ymin

    return (
        width if width is not None else ref_w,
        height if height is not None else ref_h,
        top_y if top_y is not None else ref_top_y,
    )


def process_sprite(
    src_path: Path, dst_path: Path, target_w: int, target_h: int, target_top_y: int
) -> None:
    """Process one NPC sprite file and write standardized transparent PNG output."""
    if not src_path.exists():
        raise FileNotFoundError(f"Source image not found: {src_path}")

    im = Image.open(src_path).convert("RGBA")
    cleaned = Image.fromarray(remove_green_screen(np.array(im)), mode="RGBA")
    aligned = standardize_canvas(cleaned, target_w, target_h, target_top_y)

    dst_path.parent.mkdir(parents=True, exist_ok=True)
    aligned.save(dst_path, format="PNG", optimize=True)

    xmin, ymin, xmax, ymax, zero, semi, opaque = inspect_alpha_bounds(aligned)
    print(
        f"[OK] {src_path.name} -> {dst_path} | size={aligned.size} "
        f"| bbox=({xmin}, {ymin}, {xmax}, {ymax}) "
        f"| alpha(0={zero}, semi={semi}, 255={opaque})"
    )


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Standardize NPC expression sprites (green-screen removal + canvas alignment)."
    )
    parser.add_argument(
        "--character",
        choices=("sakuya", "momo", "lynn"),
        help="Target built-in character name (routes --<expr> inputs to public/npc/<character>-<expr>.png).",
    )
    parser.add_argument(
        "--out-dir",
        default="public/npc",
        help="Output directory when using --character (default: public/npc).",
    )
    for expr in EXPRESSIONS:
        parser.add_argument(
            f"--{expr}",
            dest=f"expr_{expr}",
            metavar="IMAGE",
            help=f"Input image path for the '{expr}' expression.",
        )
    parser.add_argument("--ref", help="Optional reference PNG to match canvas dimensions and top margin.")
    parser.add_argument("--width", type=int, help="Override target canvas width.")
    parser.add_argument("--height", type=int, help="Override target canvas height.")
    parser.add_argument("--top-y", type=int, help="Override target top headroom y-coordinate.")
    parser.add_argument(
        "pairs",
        nargs="*",
        help="Optional explicit input=output path pairs.",
    )
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    out_dir = Path(args.out_dir)

    jobs: list[tuple[Path, Path]] = []
    for expr in EXPRESSIONS:
        src = getattr(args, f"expr_{expr}")
        if src:
            if not args.character:
                print(f"Error: --{expr} requires --character.", file=sys.stderr)
                return 2
            jobs.append((Path(src), out_dir / f"{args.character}-{expr}.png"))

    for pair in args.pairs:
        if "=" not in pair:
            print(f"Error: positional pair must look like input=output, got '{pair}'.", file=sys.stderr)
            return 2
        src_str, dst_str = pair.split("=", 1)
        jobs.append((Path(src_str), Path(dst_str)))

    if not jobs:
        print("Error: no input images specified. Provide --character + --<expr> or input=output pairs.", file=sys.stderr)
        return 2

    target_w, target_h, target_top_y = resolve_target_metrics(
        args.character, args.ref, out_dir, args.width, args.height, args.top_y
    )
    print(f"Target spec: width={target_w}, height={target_h}, top_y={target_top_y}")

    for src_path, dst_path in jobs:
        process_sprite(src_path, dst_path, target_w, target_h, target_top_y)

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
