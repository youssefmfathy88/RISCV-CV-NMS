import Link from "next/link";
import styles from "../home.module.css";

const LESSONS = [
  {
    href: "/nms/intrinsics",
    title: "Intrinsics",
    body: "One slide per RVV operation. Type variants share an animation. Play them before the labs.",
  },
  {
    href: "/nms/flow",
    title: "Flow",
    body: "One image, two clusters, six detections of one class. Step the kernel with the picture on the right.",
  },
  {
    href: "/nms/iou",
    title: "IoU",
    body: "Intersection, union, and the keep / suppress decision on corner boxes [y1, x1, y2, x2].",
  },
  {
    href: "/nms/sort",
    title: "Sort",
    body: "Packed scores start unsorted. Even/odd compare-swap. A six-score reverse case is the worst case.",
  },
  {
    href: "/nms/walkthrough",
    title: "Walkthrough",
    body: "Arrays only. Each stage has Scalar and Vector: score filter (packs survivors), sort, greedy IoU, one intrinsic at a time.",
  },
];

export default function NmsOverviewPage() {
  return (
    <div className={styles.home}>
      <p className={styles.kicker}>Concepts · ref::NonMaxSuppression</p>
      <h1>Non-Maximum Suppression</h1>
      <p className={styles.lead}>
        Keep high-score boxes, drop overlaps, per class.
      </p>

      <div className={styles.lessons}>
        {LESSONS.map((item) => (
          <Link key={item.href} href={item.href} className={`panel ${styles.lessonCard}`}>
            <h2>{item.title}</h2>
            <p>{item.body}</p>
            <span className={styles.go}>Open →</span>
          </Link>
        ))}
      </div>

      <details className="fold">
        <summary>Show contract</summary>
        <ul className={styles.contractList}>
          <li>
            <code>boxes</code> — <code>[num_batches, spatial_dim, 4]</code> float32, each box{" "}
            <code>[y1, x1, y2, x2]</code> with y1 ≤ y2 and x1 ≤ x2
          </li>
          <li>
            <code>scores</code> — <code>[num_batches, num_classes, spatial_dim]</code> float32
          </li>
          <li>
            <code>score_threshold</code> — drop if score <strong>strictly less</strong> than this
          </li>
          <li>
            <code>iou_threshold</code> — suppress later box if IoU <strong>strictly greater</strong>{" "}
            than this
          </li>
          <li>
            <code>max_output_boxes_per_class</code> — cap per class (also clipped to the box count)
          </li>
          <li>
            <code>center_point_box</code> must be Corners (<code>0</code>)
          </li>
          <li>
            Output: <code>selected_indices</code> rows of <code>[batch, class, box_index]</code>{" "}
            plus the row count
          </li>
        </ul>
      </details>
    </div>
  );
}
