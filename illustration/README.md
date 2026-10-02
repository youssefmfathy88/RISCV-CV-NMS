# RISC-V CV illustration sessions

Interactive walkthrough of scalar (`ref::`) and vector (`vec::`)
NonMaxSuppression. Open the NMS session from the home page. The kernels in
this branch are stubs; this site is the teaching view of the algorithm you
implement.

NMS numbers in the interactive session use a **six-box** teaching scene
(two clusters of three). The live labs follow the contract of
`NonMaxSuppression` (corner boxes `[y1, x1, y2, x2]`, per-class score filter,
odd-even sort, greedy IoU suppression).

## Get started

```bash
cd illustration
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). That home page lists every
kernel session.

## Static export

```bash
npm run build
```

HTML is written to `out/`. Host that folder anywhere (no Node server required).

## Routes

| Route | What you get |
| --- | --- |
| `/` | Catalog of kernels |
| `/nms` | Concepts: overview and function contract |
| `/nms/flow` | Concepts: full NMS loop on the six-box scene (one class; ONNX two-class available) |
| `/nms/iou` | Concepts: Intersection-over-Union lab |
| `/nms/sort` | Concepts: odd-even (brick) sort lab |
| `/nms/intrinsics` | Primer: one slide per RVV operation NMS uses (type variants share a slide) |
| `/nms/walkthrough` | Scalar + Vector modes per stage; Vector steps RVV intrinsics (score filter packs; greedy splits SoA / scan) |
| `/nms/walkthrough/vector` | Redirects into `/nms/walkthrough` |
| `/convolution` | Placeholder: 2D Convolution |
| `/median` | Placeholder: Median filter |

Old NMS URLs (`/flow`, `/iou`, `/sort`, `/vectorization`, `/nms/vectorization`)
redirect into `/nms/...`.

## Add a kernel later

Follow the **kernel-session** skill so convolution, median, and later filters match NMS:

- [`illustration/.cursor/skills/kernel-session/SKILL.md`](.cursor/skills/kernel-session/SKILL.md)
- File map: [`nms-map.md`](.cursor/skills/kernel-session/nms-map.md)

Short version:

1. Append an entry to [`lib/kernels.ts`](lib/kernels.ts) (`id`, `slug`, `title`, `status`, `summary`, `pages`). Nested `children` become a second session-nav row.
2. Add `app/<slug>/layout.tsx` with `<SessionNav kernelId="..." />` and Concepts + Walkthrough pages.
3. Home cards and the top nav pick the kernel up from the registry. No chrome rewrite.
4. Walkthrough: stage tabs, then Scalar \| Vector on every stage (not a SessionNav Scalar/Vector row). Reuse `LessonBoard` / `VectorDataFlow`.
