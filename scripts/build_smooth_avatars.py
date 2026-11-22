#!/usr/bin/env python3
"""Repair low-resolution/two-frame GIF avatars into smooth, centered animated WebP.

Source: source/img/avatar/{star,sakura,moon,heart}.gif (never overwritten)
Output: source/img/avatar/{star,sakura,moon,heart}-smooth.webp

The originals have two sharply different frames (400ms each) and several
frame positions differ vertically. Recenter, scale, tween and encode WebP
with proper alpha, eliminating the hard two-frame flash/folding.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / "source/img/avatar"
NAMES = ("star", "sakura", "moon", "heart")
SIZE = 320
ICON_SIZE = 296
STEPS = 4
FRAME_MS = 260

def normalized_pose(frame):
    frame = frame.convert("RGBA")
    bbox = frame.getchannel("A").getbbox()
    if not bbox:
        raise ValueError("Empty avatar frame")
    icon = frame.crop(bbox).resize((ICON_SIZE, ICON_SIZE), Image.Resampling.LANCZOS)
    result = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    result.alpha_composite(icon, ((SIZE-ICON_SIZE)//2, (SIZE-ICON_SIZE)//2))
    return result

for name in NAMES:
    path = ROOT / (name + ".gif")
    with Image.open(path) as source:
        if source.n_frames < 2:
            raise ValueError(f"{name} must have two animation poses")
        poses = []
        for i in (0, 1):
            source.seek(i)
            poses.append(normalized_pose(source.copy()))

    frames = []
    for start, end in ((poses[0], poses[1]), (poses[1], poses[0])):
        for step in range(STEPS):
            frames.append(Image.blend(start, end, step/STEPS))

    target = ROOT / (name + "-smooth.webp")
    frames[0].save(
        target, format="WEBP", save_all=True, append_images=frames[1:],
        duration=FRAME_MS, loop=0, quality=79, method=2
    )
    with Image.open(target) as check:
        if check.size != (SIZE, SIZE) or check.n_frames != len(frames):
            raise RuntimeError(f"Invalid generated avatar {target}")
    print(f"{target.name}: {target.stat().st_size:,} bytes, {len(frames)} frames")
