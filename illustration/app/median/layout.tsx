import type { ReactNode } from "react";
import SessionNav from "@/components/SessionNav";

export default function MedianLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SessionNav kernelId="median" />
      {children}
    </>
  );
}
