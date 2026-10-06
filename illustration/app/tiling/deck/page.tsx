import TilingDeck from "@/components/TilingDeck";
import styles from "../../home.module.css";

export default function TilingDeckPage() {
  return (
    <>
      <p className={styles.kicker}>Concepts · vectorization examples</p>
      <h1>Vectorization Examples</h1>
      <p>
        Scalar steps the algorithm on one sheet. Tiling puts that tensor above
        contiguous main memory and moves the largest trip that fits in 36 fast slots.
      </p>
      <TilingDeck />
    </>
  );
}
