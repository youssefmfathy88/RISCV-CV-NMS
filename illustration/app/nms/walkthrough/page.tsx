import WalkthroughSession from "@/components/WalkthroughSession";
import styles from "../../home.module.css";

export default function WalkthroughPage() {
  return (
    <>
      <p className={styles.kicker}>Walkthrough · ref:: and vec::NonMaxSuppression</p>
      <h1>NMS walkthrough</h1>
      <p>
        One class, six boxes. Stage tabs follow the kernel: score filter →
        sort → greedy IoU. Each stage opens on Brief: Input → output, then
        the Scalar and Vector recipes. Scalar and Vector then step the same
        data. Vector is one RISC-V intrinsic at a time (lanes, masks, VLMAX
        strip-mining). Score filter already packs <code>order[]</code> and{" "}
        <code>packed_scores[]</code>. Greedy Vector has two parts: pack box
        corners into four columns (SoA: structure of arrays — one array per
        corner, same slots as <code>order[]</code>), then scan + IoU, which
        is the scalar IoU loop run in vector lanes against later slots.
      </p>
      <WalkthroughSession />
    </>
  );
}
