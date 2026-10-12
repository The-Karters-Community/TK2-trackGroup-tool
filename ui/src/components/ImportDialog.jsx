import { useEffect, useRef } from "react";
import { Cross2Icon } from "@radix-ui/react-icons";
import ImportReview from "./ImportReview.jsx";

export default function ImportDialog(props) {
  const dialog = useRef();
  const running = props.confirmed && props.job?.state === "running";
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="import-dialog"
      aria-label={`Import ${props.preview.destinationName}`}
      onCancel={(e) => {
        e.preventDefault();
        if (!running) props.onBack();
      }}
    >
      <button
        className="icon-button dialog-close"
        aria-label="Close import review"
        disabled={running}
        onClick={props.onBack}
      >
        <Cross2Icon />
      </button>
      <ImportReview {...props} />
    </dialog>
  );
}
