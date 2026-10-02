import IntrinsicLab from "@/components/IntrinsicLab";
import styles from "../../home.module.css";

export default function IntrinsicsPage() {
  return (
    <>
      <p className={styles.kicker}>
        Intrinsics · rvv:: wrappers used by vec::NonMaxSuppression
      </p>
      <h1>NMS intrinsics</h1>
      <p>
        One slide per operation. Integer, float, and LMUL wrappers that do the
        same thing share that slide, so Merge covers Blend, and one Compress
        stands for both scores and ids.
      </p>
      <IntrinsicLab />
    </>
  );
}
