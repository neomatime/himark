# HIMARK · Image System

Single source of truth for how images are added, optimized, and
served on himark.co.za.

---

## 1. The 30-second mental model

```
       drop file into  /images/
              │
              ▼
   add a key in images.config.js   ← single source of truth
              │
              ▼
   reference the key in HTML
              │
              ▼
   (optional) run scripts/optimize-images.js → next-gen .webp
```

There are two layers:

1. **`images.config.js`** maps friendly keys (`hero.about`, `hero.press`)
   to file paths. The loader at the bottom of that file resolves
   `data-bg-key` and `data-img-key` attributes at page-ready.
2. **`scripts/optimize-images.js`** converts source JPEG / PNG into
   next-gen WebP variants — without touching the manifest. You then
   swap the manifest paths once you're happy with the output.

This separation lets you experiment with optimization without
breaking the live site.

---

## 2. Add a new image

```bash
# 1) Drop the file
cp ~/Downloads/new-press-hero.jpg  images/

# 2) (optional) Optimize it
node scripts/optimize-images.js --only new-press

# 3) Register a key in images.config.js
#    'hero.press': 'images/new-press-hero.jpg'   (original)
#    'hero.press': 'images/new-press-hero.webp'  (optimized)

# 4) Reference it
#    <div data-bg-key="hero.press" style="background-image:url('images/new-press-hero.jpg')"></div>
```

The inline `style=` attribute is a JS-disabled fallback — it renders
even if `images.config.js` never loads.

---

## 3. Optimization script

### Run

```bash
# everything in /images
node scripts/optimize-images.js

# preview only — no files written
node scripts/optimize-images.js --dry-run

# only files matching "hero"
node scripts/optimize-images.js --only hero

# tighter quality (default is 82)
node scripts/optimize-images.js --quality 78

# re-run even if .webp already exists
node scripts/optimize-images.js --force
```

### What it does

- Finds every `.jpg` / `.jpeg` / `.png` in `/images`.
- Generates a full-size `.webp` next to each source file.
- For "hero-class" files (names containing `hero`, `backdrop`, or
  `cover`), also generates **responsive variants** at 1600px, 1200px,
  and 800px wide.
- Uses `npx sharp-cli` under the hood — no dependency install needed.

### Output naming

| Source                  | Generated                                                |
| ----------------------- | -------------------------------------------------------- |
| `about-hero.jpg`        | `about-hero.webp`, `about-hero@1600.webp`, `@1200`, `@800` |
| `apply-hero.jpg`        | (same pattern — matches `hero`)                          |
| `algos.jpeg`            | `algos.webp` (single variant — not a hero)               |

---

## 4. Using the optimized files

There are three ways to serve the new variants, in increasing order
of effort.

### a) Swap the manifest path (simplest)

`images.config.js`:

```js
'hero.about': 'images/about-hero.webp',   // was 'about-hero.jpg'
```

Caveat: ~3% of users on very old browsers (no WebP support) will
see a broken image. This is fine for marketing surfaces, not for
critical UX paths.

### b) Use a `<picture>` element (recommended for `<img>`)

For tags rendered as `<img>` rather than CSS backgrounds, the
`<picture>` element negotiates format and size in one block. The
browser picks the smallest format/size it understands; legacy
browsers fall back to the `<img>` tag inside.

```html
<picture>
  <source
    type="image/webp"
    srcset="
      images/about-hero@800.webp   800w,
      images/about-hero@1200.webp 1200w,
      images/about-hero@1600.webp 1600w,
      images/about-hero.webp      2400w
    "
    sizes="(max-width: 768px) 100vw, 1200px"
  />
  <img
    src="images/about-hero.jpg"
    alt="HIMARK doctrine hero"
    width="2400" height="1200"
    loading="lazy"
    decoding="async"
  />
</picture>
```

Key attributes:

- `srcset` lists every available size with its native width.
- `sizes` tells the browser how wide the image **will be displayed**
  at a given viewport — so it picks the right `srcset` entry.
- `loading="lazy"` defers off-screen images.
- `width` / `height` reserve layout space — prevents CLS.

### c) Use CSS `image-set()` (for background-image)

For `background-image` (the hero pattern used on this site), there's
no `<picture>` equivalent — but `image-set()` does the same job in
CSS. Pair with a flat-URL fallback for legacy browsers:

```css
.np-hero-bg{
  /* Fallback for any browser that doesn't support image-set() */
  background-image: url('../images/about-hero.jpg');
  /* Modern browsers — picks the best format */
  background-image: image-set(
    url('../images/about-hero.webp') type('image/webp'),
    url('../images/about-hero.jpg')  type('image/jpeg')
  );
}
```

Browser support for `image-set()` is now >97% globally. If you want
responsive switching too, use media queries to vary the URL:

```css
.np-hero-bg{ background-image: url('../images/about-hero@800.webp'); }
@media (min-width: 768px){
  .np-hero-bg{ background-image: url('../images/about-hero@1200.webp'); }
}
@media (min-width: 1280px){
  .np-hero-bg{ background-image: url('../images/about-hero@1600.webp'); }
}
```

---

## 5. Budgets

| Surface                  | Target source size | Notes                                                  |
| ------------------------ | ------------------ | ------------------------------------------------------ |
| Hero (full-bleed)        | < 250 KB           | After WebP conversion. Use the @1600 variant.          |
| Inline content image     | < 100 KB           | Use the @800 variant for body-width images.            |
| Card / thumbnail         | < 40 KB            | Crop to display dimensions before exporting.           |
| Glyph / icon (vector)    | < 4 KB             | Always SVG. Inline if used once.                       |

If you're over budget after WebP, drop `--quality` to 76 or 70 and
re-run with `--force`. Visual fidelity holds up surprisingly well
below 80 for photographic source material.

---

## 6. Accessibility checklist

- Every `<img>` has a meaningful `alt` attribute — describe the
  function or content, not the visual ("HIMARK doctrine hero", not
  "blue gradient image").
- Decorative images use `alt=""` and never `aria-hidden="true"` on the
  `<img>` itself (the empty alt is enough).
- Background images carry **no semantic information** — anything
  important goes in HTML text adjacent to the background.

---

## 7. Quick reference

```bash
# Audit what's largest
ls -lhS images/*.jpg images/*.jpeg images/*.png | head

# Optimize everything
node scripts/optimize-images.js

# Re-optimize a specific image after replacing it
node scripts/optimize-images.js --only mandates-hero --force

# Dry-run to see what would happen
node scripts/optimize-images.js --dry-run
```
