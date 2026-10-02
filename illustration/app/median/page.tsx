import SessionPlaceholder from "@/components/SessionPlaceholder";
import { kernelById } from "@/lib/kernels";

export default function MedianPage() {
  return <SessionPlaceholder kernel={kernelById("median")} />;
}
