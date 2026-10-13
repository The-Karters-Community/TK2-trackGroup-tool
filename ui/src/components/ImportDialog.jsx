import { Cross2Icon } from "@radix-ui/react-icons";
import ImportReview from "./ImportReview.jsx";
import Dialog from "./Dialog.jsx";

export default function ImportDialog(props) {
  const running = props.confirmed && props.job?.state === "running";
  return (
    <Dialog
      className="import-dialog"
      aria-label={`Import ${props.preview.destinationName}`}
      onClose={props.onBack}
      dismissDisabled={running}
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
    </Dialog>
  );
}
