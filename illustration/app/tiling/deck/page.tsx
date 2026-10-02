import TilingDeck from "@/components/TilingDeck";
import styles from "../../home.module.css";

export default function TilingDeckPage() {
  return (
    <>
      <p className={styles.kicker}>Concepts · vectorization examples</p>
      <h1>Vectorization Examples</h1>
      <p>
        One path: DRAM → Vector Memory → Vector Registers → ALU → DRAM. Memory
        tiling stages a tile in fast memory. Register tiling then strip-mines
        that tile with <code>vsetvli</code>. Step through Add first, then
        Convolution.
      </p>
      <TilingDeck />
    </>
  );
}
