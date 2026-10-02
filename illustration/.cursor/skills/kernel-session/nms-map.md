# NMS file map (gold example)

Copy structure, not NMS types. Convolution has pixels/tiles; NMS has boxes/`order`.

## App routes

| Route | File |
| --- | --- |
| `/nms` | `illustration/app/nms/page.tsx` |
| `/nms/flow` `/iou` `/sort` | Concepts labs |
| `/nms/intrinsics` | Intrinsics primer → `IntrinsicLab` |
| `/nms/walkthrough` | `app/nms/walkthrough/page.tsx` → `WalkthroughSession` |
| `/nms/walkthrough/vector` | redirect into `/nms/walkthrough` |

Layout: `app/nms/layout.tsx` → `<SessionNav kernelId="nms" />`.

## Shared chrome

- `illustration/lib/kernels.ts` — `KERNELS` registry
- `illustration/components/SessionNav.tsx` — two-row pills from `pages` / `children`
- `illustration/components/LessonBoard.tsx` — watching, Reset/Prev/Next, code, data, changed
- `illustration/components/Nav.tsx` — home + kernel short titles
- `illustration/app/globals.css` — tokens
- `illustration/app/home.module.css` — `.kicker`, lesson cards

## NMS Intrinsics primer

- `app/nms/intrinsics/page.tsx` — kicker + `IntrinsicLab`
- `components/IntrinsicLab.tsx` — family/helper pills, LessonBoard, Replay, lane animator
- `lib/nmsIntrinsics.ts` — one slide per operation `vec::NonMaxSuppression` uses (type variants listed in `also`)

## NMS walkthrough

- `components/WalkthroughSession.tsx` — stage, Brief\|Scalar\|Vector, Greedy Vector Pack boxes\|Scan + IoU, VLMAX
- `components/StageBrief.tsx` — presenter deck (contract, Scalar recipe, Vector recipe)
- `lib/stageBriefs.ts` — per-stage Input→output + high-level recipes (teaching VLMAX 4)
- `components/LaneCells.tsx` — shared register/memory cells for Brief and Vector
- `components/ScalarWalk.tsx` — `ScalarLesson` + `FocusBuffers` + `buildTrace`
- `components/VectorLesson.tsx` — `buildVectorLesson` → LessonBoard + VectorDataFlow
- `components/VectorDataFlow.tsx` — descriptions, lanes, masks, memory, checkpoint
- `components/FocusBuffers.tsx` — stage-gated `boxes` / `order` / `packed_scores` / `suppressed`
- `lib/walkthrough.ts` — `StageId`, `LessonMode` (`brief` \| `scalar` \| `vector`), `TeachingVlmax`, `setTeachingVl`
- `lib/trace.ts` — scalar `TraceStep` stream
- `lib/vectorTrace.ts` — vector `VectorStep` stream + `verifyVectorTraces`
- `lib/nms.ts` — scalar port of `ref::`
- `lib/scenes.ts` — teaching scene + `verifyScenes`
- `lib/format.ts` — `fmtNum` / `fmtScore` / `fmtIou`
- `lib/lesson.ts` — `bufferSetForKind`, `whatChanged`, highlight line

## VectorStep schema

Reuse this type (or a kernel-prefixed clone that VectorDataFlow can accept). Prefer extending `VectorDataFlow` to take the shared shape rather than forking the component.

```ts
type VectorStep = {
  id: string;
  fn: string;            // C++ function, e.g. ApplyScoreSuppression
  helper: string;        // rvv::LoadF32M4
  intrinsic: string;     // __riscv_vle32_v_f32m4
  snippet: string;       // kernel excerpt
  highlightLine: number; // 0-based inside snippet (VectorLesson adds helper/intrinsic lines)
  watching: string;
  whatItDoes: string;
  whyNeeded: string;
  laneRule: string;
  changed: string;
  sewmLmul: string;      // "e32m4 / vbool8"
  remaining: number;
  offset: number;
  vl: number;
  vlmax: number;
  strip: number;
  registers: RegisterView[];
  memories: MemoryView[];
  flow?: string;
  checkpoint?: { label: string; ok: boolean; detail: string };
};
```

Lane `active: false` → show `—` and tail styling. Mask values `true` / `false`.

## Teaching VLMAX

```ts
vl = min(remaining, teachingVlmax)
```

NMS default `4` so five score-filter survivors are strip `vl=4` then tail `vl=1`. Convolution tile/row leftovers should use the same control.

## Kernel C++ pairing

| Illustration | Repo |
| --- | --- |
| Scalar helpers | `test/reference/source/<Kernel>.cpp` and/or scalar parts of `lib/source/<Kernel>.cpp` (`ref::`) |
| Vector helpers | `lib/source/<Kernel>.cpp` (`vec::`) |
| Wrappers | `lib/include/riscv_wrappers.hpp` |
| Wrapper rule | `.cursor/rules/rvv-wrappers.mdc` |

Illustration Vector UI **may** display `__riscv_*` next to the wrapper. Production kernels still call `rvv::` only.

## Voice samples (NMS)

Watching: `Box 2 score 0.20 < 0.40 → skip. It cannot be selected for person.`

Changed: `order[4] = 5, packed_scores[4] = 0.90`

Vector watching: `The scores that survived sit in registers already. Compress them with the same keep mask so packed_scores[i] lines up with order[i].`

Checkpoint: `Matches scalar ApplyScoreSuppression` + `order = [0, 1, 3, 4, 5]`.
