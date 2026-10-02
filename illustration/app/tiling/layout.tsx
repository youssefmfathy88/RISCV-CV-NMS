import type { ReactNode } from "react";
import SessionNav from "@/components/SessionNav";

export default function TilingLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      <SessionNav kernelId="tiling" />
      {children}
    </>
  );
}
