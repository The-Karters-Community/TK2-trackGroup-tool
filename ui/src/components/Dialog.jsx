import { useEffect, useRef } from "react";

// Keep native focus trapping, Escape handling and focus restoration. Only a
// primary press that starts and ends on the backdrop can dismiss the dialog.
export default function Dialog({
  onClose,
  dismissDisabled = false,
  children,
  ...props
}) {
  const dialog = useRef();
  const backdropPress = useRef(false);
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);

  function onBackdrop(event) {
    if (event.target !== event.currentTarget) return false;
    const { left, right, top, bottom } =
      event.currentTarget.getBoundingClientRect();
    return (
      event.clientX < left ||
      event.clientX > right ||
      event.clientY < top ||
      event.clientY > bottom
    );
  }

  return (
    <dialog
      {...props}
      ref={dialog}
      onCancel={(event) => {
        event.preventDefault();
        if (!dismissDisabled) onClose();
      }}
      onPointerDown={(event) => {
        backdropPress.current = event.button === 0 && onBackdrop(event);
      }}
      onPointerCancel={() => {
        backdropPress.current = false;
      }}
      onClick={(event) => {
        const dismiss = backdropPress.current && onBackdrop(event);
        backdropPress.current = false;
        if (dismiss && !dismissDisabled) onClose();
      }}
    >
      {children}
    </dialog>
  );
}
