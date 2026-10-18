import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Cross2Icon } from "@radix-ui/react-icons";
import "./Feedback.css";

// Native modal dialogs occupy the browser's top layer. A page z-index cannot
// reach it, so notices follow the currently active dialog, including nested ones.
export default function Feedback({ message, error = false, onDismiss }) {
  const [target, setTarget] = useState(document.body);
  useEffect(() => {
    const followDialog = () => {
      const dialogs = [...document.querySelectorAll("dialog[open]")];
      setTarget(dialogs.at(-1) || document.body);
    };
    followDialog();
    const observer = new MutationObserver(followDialog);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["open"],
    });
    return () => observer.disconnect();
  }, []);
  if (!message) return null;
  return createPortal(
    <div
      className={`feedback toast app-notice${error ? " error" : ""}`}
      role={error ? "alert" : "status"}
    >
      <span>{message}</span>
      <button
        className="icon-button"
        aria-label={error ? "Dismiss error" : "Dismiss message"}
        onClick={onDismiss}
      >
        <Cross2Icon />
      </button>
    </div>,
    target,
  );
}
