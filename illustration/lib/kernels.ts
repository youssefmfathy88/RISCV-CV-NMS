export type KernelStatus = "ready" | "placeholder";

export type KernelPage = {
  href: string;
  label: string;
  children?: KernelPage[];
};

export type Kernel = {
  id: string;
  slug: string;
  title: string;
  shortTitle: string;
  status: KernelStatus;
  summary: string;
  refSymbol?: string;
  pages: KernelPage[];
};

export const KERNELS: Kernel[] = [
  {
    id: "nms",
    slug: "nms",
    title: "Non-Maximum Suppression",
    shortTitle: "NMS",
    status: "ready",
    summary:
      "Per class, keep high-score boxes and drop later boxes that cover almost the same pixels.",
    refSymbol: "ref::NonMaxSuppression",
    pages: [
      {
        href: "/nms",
        label: "Concepts",
        children: [
          { href: "/nms", label: "Overview" },
          { href: "/nms/flow", label: "Flow" },
          { href: "/nms/iou", label: "IoU" },
          { href: "/nms/sort", label: "Odd-Even Sort" },
        ],
      },
      {
        href: "/nms/walkthrough",
        label: "Walkthrough",
      },
      {
        href: "/nms/intrinsics",
        label: "Intrinsics",
      },
    ],
  },
  {
    id: "convolution",
    slug: "convolution",
    title: "2D Convolution",
    shortTitle: "Convolution",
    status: "placeholder",
    summary:
      "Slide a kernel over an image and write each weighted neighborhood into the output.",
    pages: [{ href: "/convolution", label: "Overview" }],
  },
  {
    id: "tiling",
    slug: "tiling",
    title: "Vectorization Tiling",
    shortTitle: "Tiling",
    status: "ready",
    summary:
      "DRAM → VCCM → vector registers → ALU → DRAM. Add, ReduceSum, Matmul, and Softmax have exact outputs. Conv 1D injects padding. NonZero flushes a maximum buffer.",
    pages: [
      {
        href: "/tiling",
        label: "Concepts",
        children: [
          { href: "/tiling", label: "Overview" },
          { href: "/tiling/deck", label: "Examples" },
        ],
      },
    ],
  },
  {
    id: "median",
    slug: "median",
    title: "Median filter",
    shortTitle: "Median",
    status: "placeholder",
    summary:
      "Replace each pixel with the median of its neighborhood to suppress impulse noise.",
    pages: [{ href: "/median", label: "Overview" }],
  },
];

export function kernelById(id: string): Kernel {
  const kernel = KERNELS.find((item) => item.id === id);
  if (!kernel) {
    throw new Error(`Unknown kernel id: ${id}`);
  }
  return kernel;
}

export function isPageActive(href: string, pathname: string, exact: boolean): boolean {
  if (exact) {
    return pathname === href || pathname === `${href}/`;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isSectionActive(
  page: KernelPage,
  pathname: string,
  siblings: KernelPage[],
): boolean {
  const moreSpecific = siblings.filter(
    (other) => other.href !== page.href && other.href.startsWith(`${page.href}/`),
  );
  if (
    moreSpecific.some((other) => isPageActive(other.href, pathname, false))
  ) {
    return false;
  }
  return isPageActive(page.href, pathname, false);
}
