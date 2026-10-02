import type { ReactNode } from "react";
import SessionNav from "@/components/SessionNav";

export default function ConvolutionLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      <SessionNav kernelId="convolution" />
      {children}
    </>
  );
}
