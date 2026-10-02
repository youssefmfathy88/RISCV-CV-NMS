---
name: kernel-session
description: >-
  Build interactive RISC-V CV illustration sessions in the NMS style
  (Concepts vs Walkthrough, Scalar/Vector per stage, LessonBoard, one RVV
  intrinsic per step). Use when adding or restyling convolution, median, or
  any new kernel under illustration/, or when the user asks for a walkthrough,
  vectorization lab, FocusBuffers, VectorDataFlow, or SessionNav.
---

# Kernel illustration session

NMS is the gold style. New kernels (convolution, median, later filters) must
feel like the same product: same chrome, same board, same teaching voice.
Do not invent a third layout.

Canonical example: `/nms`, `/nms/walkthrough`, and `/nms/intrinsics`. File map:
[nms-map.md](nms-map.md).

## Before coding

Read, in order:

1. `lib/source/<Kernel>.cpp` — `ref::` and `vec::` (source of truth)
2. `lib/include/riscv_wrappers.hpp` — helper names, never raw `__riscv_*` in kernels
3. `illustration/lib/kernels.ts` — registry
4. Existing NMS components listed in [nms-map.md](nms-map.md)

Port scalar helpers into `illustration/lib/<kernel>.ts` the way `nms.ts` ports
`test/reference/source/NMS.cpp`. Vector lessons simulate `vec::` strip-mining
with a teaching VLMAX, not hardware VLMAX.

## Session shape (required)

```
SessionNav
  Concepts          Walkthrough          Intrinsics (optional primer)
    Overview          (no Scalar|Vector row here)
    concept labs…                          family pills on the page, not a nav row

Walkthrough page
  Stage tabs (algorithm steps, 1-based labels)
  Mode tabs: Brief | Scalar | Vector  ← every stage; stage click returns to Brief
  Optional Vector subtabs             ← only when one stage hides two vector stories
  Teaching VLMAX (2/4/8, default 4)   ← Vector only
  LessonBoard (watching / code / data / what changed)
```

- **Concepts** = picture + intuition (IoU, sort, flow). Quizzes stay in `<details class="fold">`.
- **Walkthrough** = arrays + kernel code. Vectorization lives here, not a top-level SessionNav tab.
- **Intrinsics** (NMS) = session primer: one slide per RVV operation the kernel uses (type/LMUL variants share a slide). Family filters stay on the page toolbar.
- Do **not** add SessionNav children `Brief` / `Scalar` / `Vector`. Mode tabs belong inside the walkthrough shell (see `WalkthroughSession.tsx`).
- Keep at most two SessionNav rows. Extra mode/subtab/VLMAX/family controls stay on the lesson toolbar.

## Reuse, do not fork

Use these as-is. Kernel-specific logic goes in new files; do not copy-paste a second LessonBoard.

| Piece | Path | Role |
| --- | --- | --- |
| Registry | `illustration/lib/kernels.ts` | `id`, `slug`, `title`, `pages` |
| Session chrome | `SessionNav` + `app/<slug>/layout.tsx` | `kernelId="<id>"` |
| Board | `LessonBoard` | watching, step nav, code highlight, data, changed |
| Stage brief | `StageBrief` + `lib/stageBriefs.ts` | Input→output, then Scalar/Vector recipes before deep steps |
| Lane cells | `LaneCells` | register / memory strips shared by Brief and Vector |
| Scalar buffers | `FocusBuffers` **or** a kernel-specific panel using `ArrayPanel.module.css` | stage-gated arrays |
| Vector board | `VectorDataFlow` + `VectorLesson` pattern | lanes, masks, memory, descriptions |
| Intrinsics primer | `IntrinsicLab` + `lib/nmsIntrinsics.ts` | toolbox slides, family pills, Replay |
| Format | `lib/format.ts` | `fmtNum`, `fmtScore` |
| Tokens | `app/globals.css` | `--class0`, `--keep`, `--drop`, `--current`, `--quiz` |
| Placeholder | `SessionPlaceholder` | only while `status: "placeholder"` |

New CSS: a small `*.module.css` next to the new component. Prefer existing tokens.
Pill buttons: copy `WalkthroughSession.module.css` (`.stages`, `.on`, `.vectorOn`).

## Register a kernel

1. Append to `KERNELS` in `illustration/lib/kernels.ts`.
2. `app/<slug>/layout.tsx` with `<SessionNav kernelId="<id>" />`.
3. `app/<slug>/page.tsx` (Concepts overview) and `app/<slug>/walkthrough/page.tsx`.
4. Set `status: "ready"` only when Scalar + Vector walkthroughs both run.
5. Home catalog and top nav pick the kernel up from the registry. No chrome rewrite.

Concepts children are optional labs (NMS: Flow, IoU, Sort). Add a lab only when it teaches one idea that the walkthrough would clutter. An Intrinsics primer is a top-level SessionNav tab, not a Concepts child.

## Walkthrough implementation pattern

Mirror NMS:

1. `lib/<kernel>/stages.ts` — `StageId`, stage labels, `LessonMode`, teaching VLMAX helper (`setTeachingVl`).
2. `lib/<kernel>/scalarTrace.ts` — pure `buildTrace` of `ref::` (see `illustration/lib/trace.ts`).
3. `lib/<kernel>/vectorTrace.ts` — pure `buildVectorLesson` of `vec::` (see `illustration/lib/vectorTrace.ts`).
4. `components/<Kernel>Session.tsx` — owns `stage`, `mode` (Brief first), `vectorPart?`, `stepIndex`, `vlmax`. Reset `stepIndex` in click handlers (not `useEffect`). Stage click returns to Brief.
5. Brief (`StageBrief`) + Scalar renderer + Vector renderer. Vector feeds `LessonBoard` + `VectorDataFlow`. Do not prepend brief slides onto the scalar/vector traces.

**Scalar data column:** buffers the current stage needs. Hide later arrays.

**Vector data column (`VectorDataFlow`):** every step must fill

- `whatItDoes`, `whyNeeded`, `laneRule`
- `helper` (wrapper) + `intrinsic` (`__riscv_*`)
- `remaining`, `offset`, `vl`, `vlmax`, `strip`, SEW/LMUL
- register lanes (active vs tail `—`) and/or memory cells
- `changed` one-liner
- optional `flow` arrow text (`memory → register`)
- end-of-lesson `checkpoint` vs scalar helper output

One **primary** intrinsic per Next/Prev step. Bitcast then shift are two steps.
Show a wrong contiguous load when gather/index is the point.

## Teaching rules

- Indices are **0-based** (slots, lanes, boxes, pixels). Stage **tabs** may be `1. Inputs`.
- Teach **one** simple scene first (NMS: one class, six boxes). Extra golden scenes belong on Concepts, not the walkthrough dropdown.
- Vectorize only what `vec::` vectorizes. Outer loops, sequential dependence, and single-tuple writes stay scalar — say so on the Inputs Vector lesson.
- `SetVl*` runs **inside** strip-mined helpers, not once globally. Teaching VLMAX is a labeled simulation.
- Score / threshold language must match the kernel (`>=` vs `>`, strict vs not).
- Checkpoints must equal `illustration/lib/<kernel>.ts` helpers for VLMAX `2`, `4`, and `8`. Export `verify*Traces()` and run it on module load (see `verifyVectorTraces` / `verifyScenes`).
- Do not claim score-filter or other vectorized stages “stay scalar” unless `vec::` is actually scalar there.

## Voice and copy

- Kicker: `Walkthrough · ref:: and vec::<Symbol>` (mono, uppercase via `.kicker`).
- Banner: `Now watching.` + one concrete sentence (what this step does to **this** data).
- Footer: `What changed` + compact buffer mutation, not a paragraph.
- Function label: `FnName · HelperName` on Vector.
- No emoji. Short complete sentences. Define kernel terms once (`order` = box indices, not slots).
- Quizzes off the main board (`<details class="fold">`).

## Implementation order

```
Task progress:
- [ ] Port ref:: helpers + a tiny teaching scene; verify against expected output
- [ ] Registry + layout + Concepts overview (contract list)
- [ ] Scalar walkthrough (stages + LessonBoard + buffers)
- [ ] Vector Inputs (pipeline + SEW/LMUL/VL vs VLMAX)
- [ ] Vector per remaining stage (one intrinsic/step, strip-mining)
- [ ] Checkpoints VLMAX 2/4/8; tsc; eslint; next build
```

Do not skip Scalar. Vector without a matching scalar lesson is out of style.

## Verify

```bash
cd illustration
npx tsc --noEmit
npx eslint . --max-warnings 0
npx next build
```

Manually: desktop and ~960px stack, stage/mode/subtab resets, Prev disabled on step 0, Next on last step, placeholder kernels still listed.

## Additional resources

- NMS file map and schemas: [nms-map.md](nms-map.md)
