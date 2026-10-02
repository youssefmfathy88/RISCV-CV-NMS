import SessionPlaceholder from "@/components/SessionPlaceholder";
import { kernelById } from "@/lib/kernels";

export default function ConvolutionPage() {
  return <SessionPlaceholder kernel={kernelById("convolution")} />;
}
