import IouLab from "@/components/IouLab";

export default function IouPage() {
  return (
    <>
      <h1>IoU lab</h1>
      <p>
        Picture on one side, intersection / union / IoU on the other. Suppress
        only if IoU is strictly greater than the threshold.
      </p>
      <IouLab />
    </>
  );
}
