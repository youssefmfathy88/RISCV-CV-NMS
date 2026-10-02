import SortLab from "@/components/SortLab";

export default function SortPage() {
  return (
    <>
      <h1>Odd-even sort</h1>
      <p>
        One packed row and a separate order row. Even pairs, then odd pairs.
        Swap only if left_score is strictly less than right_score. Default is the
        six-box walkthrough class, packed low → high so even pairs actually swap. A
        six-score reverse worst case is the second scene.
      </p>
      <SortLab />
    </>
  );
}
