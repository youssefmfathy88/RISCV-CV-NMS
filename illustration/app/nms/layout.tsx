import type { ReactNode } from "react";
import SessionNav from "@/components/SessionNav";

export default function NmsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SessionNav kernelId="nms" />
      {children}
    </>
  );
}
