"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  isPageActive,
  isSectionActive,
  kernelById,
  type KernelPage,
} from "@/lib/kernels";
import styles from "./SessionNav.module.css";

type Props = {
  kernelId: string;
};

function Tab({
  page,
  active,
}: {
  page: KernelPage;
  active: boolean;
}) {
  return (
    <Link
      href={page.href}
      className={active ? `${styles.tab} ${styles.active}` : styles.tab}
    >
      {page.label}
    </Link>
  );
}

export default function SessionNav({ kernelId }: Props) {
  const pathname = usePathname();
  const kernel = kernelById(kernelId);
  const activeSection =
    kernel.pages.find((page) => isSectionActive(page, pathname, kernel.pages)) ??
    kernel.pages[0];
  const children = activeSection?.children ?? [];

  return (
    <div className={styles.wrap}>
      <nav className={styles.bar} aria-label={`${kernel.shortTitle} session`}>
        {kernel.pages.map((page) => (
          <Tab
            key={page.href}
            page={page}
            active={isSectionActive(page, pathname, kernel.pages)}
          />
        ))}
      </nav>
      {children.length > 0 ? (
        <nav
          className={`${styles.bar} ${styles.sub}`}
          aria-label={`${activeSection.label} pages`}
        >
          {children.map((page) => (
            <Tab
              key={page.href}
              page={page}
              active={isPageActive(
                page.href,
                pathname,
                page.href === activeSection.href,
              )}
            />
          ))}
        </nav>
      ) : null}
    </div>
  );
}
