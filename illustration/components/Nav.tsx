"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";
import { KERNELS } from "@/lib/kernels";
import styles from "./Nav.module.css";

export default function Nav() {
  const pathname = usePathname();
  return (
    <header className={styles.bar}>
      <Link href="/" className={styles.brand}>
        <span className={styles.mark}>RISC-V CV</span>
        <span className={styles.title}>sessions</span>
      </Link>
      <nav className={styles.tabs}>
        <Link
          href="/"
          className={pathname === "/" ? `${styles.tab} ${styles.active}` : styles.tab}
        >
          Home
        </Link>
        {KERNELS.map((kernel) => {
          const href = `/${kernel.slug}`;
          const active =
            pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={kernel.id}
              href={href}
              className={active ? `${styles.tab} ${styles.active}` : styles.tab}
            >
              {kernel.shortTitle}
            </Link>
          );
        })}
      </nav>
      <ThemeToggle />
    </header>
  );
}
