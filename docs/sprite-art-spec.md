# Purr Patrol: character sprite art spec

This spec describes the 2D character art the game can display in place of its 3D models. Follow it exactly and the
images drop straight in: no code changes needed. Any character without art keeps its 3D model, so you can deliver one
character at a time.

**Style:** semi-photorealistic, high-quality game artwork. Natural anatomy and body shapes, realistic fur, eyes, noses,
ears, paws and whiskers, natural colours, realistic soft lighting. Not cartoon, pixel art, low-poly, flat vector or
toy-like.

---

## 1. Format rules (every image)

| Rule | Value |
|---|---|
| File type | **PNG-32** (straight alpha) or **WebP with alpha** (lossless, or quality 90+) |
| Background | Fully transparent |
| Edges | Clean anti-aliased alpha. No white/black/green fringe or halo: decontaminate edge colours after background removal. No 1-bit hard cut-outs. |
| Colour space | sRGB |
| Shadows | **Do not paint a ground shadow.** The game adds a soft contact shadow under every character. Self-shadowing and ambient occlusion on the body are good. |
| Lighting | Soft key light from the **upper left, slightly in front** of the character, the same for every character, direction and frame. Gentle fill, subtle rim light. |
| Padding | Leave at least **8 px of transparent space** around the character inside each frame (prevents bleeding between frames). |
| Max sheet size | 4096 × 4096 px |

---

## 2. Camera and directions

- **View:** ¾ view, camera about **45–50° above the ground**, looking down at the character, mild perspective. Use the
  same angle for every character.
- **8 directions.** Rows of each sheet, top to bottom:

| Row | Name | The character is facing… |
|---|---|---|
| 0 | S | towards the viewer |
| 1 | SE | towards the viewer and to screen-right |
| 2 | E | screen-right (side view) |
| 3 | NE | away from the viewer and to screen-right |
| 4 | N | away from the viewer (we see its back) |
| 5 | NW | away from the viewer and to screen-left |
| 6 | W | screen-left |
| 7 | SW | towards the viewer and to screen-left |

**Mirroring (saves ~40 % of the work):** set `"mirror": true` and supply only rows 0–4 (S, SE, E, NE, N). The game
flips E-side rows to make W, NW and SW. Do not mirror coats with asymmetric markings (calico, Turkish Van patches),
because the patches would swap sides. Use all 8 rows for those.

---

## 3. Sheet layout

- One sheet per animation, e.g. `walk.webp`.
- **Columns = frames** (left to right, in playback order). **Rows = directions** (table above).
- Every frame in a character's sheets has the **same size**, and the character stands at the **same anchor point**: the
  centre of the feet / ground contact. A typical anchor is 50 % across and 92 % down the frame.
- Keep the character at the **same scale** in every animation, so it doesn't grow or shrink when it switches from walking
  to sitting.

Assemble frames with any sprite packer, or ImageMagick (frames named in row-major order, `S_00, S_01 … SW_07`):

```
magick montage frames/*.png -tile 8x8 -geometry 256x256+0+0 -background none walk.webp
```

(`-tile COLUMNSxROWS`: frames × directions.)

---

## 4. Files and manifest

```
public/sprites/
  index.json                    ← list of characters that have art
  cat-persian/                  ← one folder per character id
    sprite.json
    idle.webp  walk.webp  run.webp  sit.webp  ...
```

`public/sprites/index.json`:

```json
{ "characters": ["cat-persian", "cat-street", "rat", "dog"] }
```

`public/sprites/<id>/sprite.json`:

```json
{
  "frameWidth": 256,
  "frameHeight": 256,
  "height": 80,
  "anchor": [0.5, 0.92],
  "directions": 8,
  "mirror": false,
  "shadow": [44, 22],
  "animations": {
    "idle":   { "file": "idle.webp",   "frames": 8, "fps": 8 },
    "walk":   { "file": "walk.webp",   "frames": 8, "fps": 10 },
    "run":    { "file": "run.webp",    "frames": 8, "fps": 14 },
    "pounce": { "file": "pounce.webp", "frames": 6, "fps": 12, "loop": false }
  }
}
```

| Field | Meaning |
|---|---|
| `frameWidth`, `frameHeight` | Size of one frame in pixels |
| `height` | How tall the whole frame is in the game world (see table below) |
| `anchor` | Feet position in the frame, as fractions `[across, down]` |
| `directions` | 8 (or 1 for a non-directional sprite) |
| `mirror` | `true` if only rows S…N are supplied |
| `shadow` | Optional contact-shadow size `[width, depth]` in world units |
| `animations.*.loop` | `false` for one-shot animations (pounce) |

---

## 5. Characters

### Ids, sizes and animations

`height` assumes the animal fills about 85 % of the frame height. If yours fills less, raise `height` proportionally.

| Character | Folder id | Recommended frame | `height` | Animations (frames @ fps) |
|---|---|---|---|---|
| Cat (player) | `cat-<breed>` or `cat-<breed>-<colour>` | 256 × 256 | 80 | **idle** 8@8, **walk** 8@10, **run** 8@14, sit 6@6, pounce 6@12 (one-shot), hiss 6@8, eat 6@8, roll 8@8, sleep 4@3 |
| Lion (Big Paw power) | `lion` | 384 × 384 | 150 | **idle** 8@8, walk 8@10, **run** 8@14, **pounce** 6@12 (one-shot), **roar** 8@10 |
| Mouse / rat | `rat` (all types), or `rat-grey`, `rat-mouse`, `rat-big`, `rat-albino` | 128 × 128 | 30 | **idle** 6@8, **run** 6@14 |
| Owner | `man` | 384 × 384 | 190 | **idle** 6@6, **walk** 8@10, kneel 4@6, give 6@8 |
| Dog (golden retriever) | `dog` | 320 × 320 | 105 | **idle** 6@8, **trot** 8@12, sit 4@6 |
| Eagle (Grip Claw power) | `eagle` | 320 × 320 | 200 | **fly** 8@12, glide 4@6, dive 4@8, climb 8@14 |

**Bold** = required. The others are optional: if an animation is missing the game falls back gracefully
(run → walk → idle, sit → idle, roll → sit, pounce → run, roar/hiss → idle, give → kneel, glide/dive/climb → fly).

- The shared `rat` sheet is drawn at the grey rat's size. The game scales it for the small mouse, big rat and albino
  rat, so use per-type folders if you want their colours to differ.
- The eagle needs wide frames for its wingspan. The owner's `give` animation holds out the right hand: the treat is
  placed there.

### Cat breeds (draw each breed in its signature coat)

| Breed id | Look |
|---|---|
| `street` | Domestic shorthair, classic brown or ginger tabby with a white bib and paws, athletic medium build |
| `persian` | Long silky coat, flat face, large round eyes, small ears, thick neck ruff, plumed tail, stocky low body |
| `siamese` | Slender and long-legged, short cream coat with dark seal points (face mask, ears, legs, tail), blue almond eyes, large ears |
| `curl` | American Curl: ears curling back, medium-long coat (tabby), alert expression |
| `savannah` | Tall, lean, long legs, golden coat with bold black spots, very large upright ears |
| `fold` | Scottish Fold: ears folded forward and down, round head and eyes, sturdy body |
| `ragdoll` | Large, semi-long plush coat, colour-point with white mittens and bib, blue eyes |
| `van` | Turkish Van: white body with coloured head patches and a ringed coloured tail, semi-long coat |
| `sphynx` | Hairless, wrinkled skin, very large ears, lemon-shaped eyes, visible muscle and skin folds |

**Coat colours (optional variants):** `ginger`, `cream`, `brown`, `chocolate`, `grey`, `silver`, `blue`, `black`,
`white`, `calico`. A folder named `cat-<breed>-<colour>` (e.g. `cat-persian-white`) is used when the player picks that
colour; otherwise `cat-<breed>` is used for every colour. Hats, outfits, glasses and collars are not drawn on sprites:
they only appear on the 3D cat.

---

## 6. AI image-generation tips

Consistency across 8 directions and many frames is the hard part. A workflow that works:

1. **Reference first.** Generate one hero image per character and refine it until it's right. Then make an
   **8-direction turnaround sheet** from it and keep it as the reference for everything else (image-prompt or character
   reference features in Midjourney, Leonardo, or Stable Diffusion with IP-Adapter/ControlNet).
2. **Pose by pose.** Generate each direction of each animation pose with the reference attached. For walk and run cycles,
   use ControlNet (OpenPose for animals, or a depth/silhouette guide) from a simple animated guide so the legs move
   correctly.
3. **Clean up.** Remove the background, decontaminate edges, match scale and anchor, fix any drift in markings, then
   pack the sheets.

Prompt template (fill the brackets):

> semi-photorealistic 2D game character sprite of a [breed description] cat, [coat colour], [pose, e.g. "mid-stride
> walking"], three-quarter view from 45 degrees above, facing [direction, e.g. "towards the viewer and to the right"],
> full body in frame, natural anatomy, detailed realistic fur texture, realistic eyes, nose, whiskers and paws, soft
> studio lighting from the upper left, transparent background, no ground shadow, high detail game art

Negative prompt: `cartoon, anime, pixel art, low poly, flat vector, toy, plush, 3D render, cropped, text, watermark,
ground shadow, background`

---

## 7. Checking the art in the game

1. Add the character's id to `public/sprites/index.json` and its folder with `sprite.json` and sheets.
2. Run `npm run dev` and open the game. The menu's 360° preview shows the cat; drag it to see all 8 directions.
3. Useful URL switches:
   - `#sprite-debug`: labelled placeholder sheets (direction name + arrow) for every character, to compare with your
     art's direction order
   - `#nosprites`: hide all sprites and use the 3D models, for comparison
4. Common fixes:
   - Character faces the wrong way: rows are in the wrong order (section 2).
   - Character floats or sinks: adjust `anchor`.
   - Too big or too small: adjust `height`.

**Texture memory:** a 256 px, 8-frame, 8-direction sheet is 2048 × 2048 (about 16 MB of GPU memory once loaded).
Sheets load only when an animation is first used. Mirroring and 256 px frames keep things light; avoid frames larger
than the table recommends.

**Licensing:** only use art you have the rights to use in this game (your own generations under the tool's terms,
commissioned work, or a properly licensed pack).
