"use client";

import { MemoryBlock, RegisterBlock } from "@/components/LaneCells";
import LessonBoard from "@/components/LessonBoard";
import { stageBriefs, type BriefSlide } from "@/lib/stageBriefs";
import type { StageId } from "@/lib/walkthrough";
import styles from "./StageBrief.module.css";

type Props = {
  stage: StageId;
  stepIndex: number;
  onStepIndex: (index: number) => void;
};

function Recipe({ slide }: { slide: BriefSlide }) {
  if (slide.groups && slide.groups.length > 0) {
    return (
      <>
        {slide.groups.map((group) => (
          <section key={group.title} className={styles.group}>
            <h3 className={styles.groupTitle}>{group.title}</h3>
            <ol className={styles.groupList}>
              {group.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </section>
        ))}
      </>
    );
  }
  if (slide.steps.length === 0) {
    return null;
  }
  return (
    <ol className={styles.recipe}>
      {slide.steps.map((step) => (
        <li key={step}>{step}</li>
      ))}
    </ol>
  );
}

export default function StageBrief({ stage, stepIndex, onStepIndex }: Props) {
  const slides = stageBriefs(stage);
  const last = Math.max(0, slides.length - 1);
  const index = Math.min(stepIndex, last);
  const slide = slides[index];

  if (!slide) {
    return <p>No brief for this stage.</p>;
  }

  return (
    <LessonBoard
      watching={slide.watching}
      fn={slide.fn}
      index={index}
      total={Math.max(slides.length, 1)}
      onReset={() => onStepIndex(0)}
      onPrev={() => onStepIndex(Math.max(0, index - 1))}
      onNext={() => onStepIndex(Math.min(last, index + 1))}
      code={slide.snippet}
      highlightLine={slide.highlightLine}
      changed={slide.changed}
      data={
        <div className={styles.stack}>
          <Recipe slide={slide} />
          {slide.flow ? <p className={styles.flow}>{slide.flow}</p> : null}
          {slide.registers.map((register) => (
            <RegisterBlock key={register.name} register={register} />
          ))}
          {slide.memories.map((memory) => (
            <MemoryBlock
              key={`${memory.name}-${memory.hint ?? ""}`}
              memory={memory}
            />
          ))}
        </div>
      }
    />
  );
}
