import { useEffect, useRef, useState } from "react";
import { PersonIcon } from "@radix-ui/react-icons";

export default function LobbySetupImage({
  snapshots,
  data,
  revision,
  loading,
  name,
  onInspect,
}) {
  const element = useRef();
  const [visible, setVisible] = useState(false);
  const [result, setResult] = useState(null);
  const signature = JSON.stringify({ data, revision });
  useEffect(() => {
    if (!window.IntersectionObserver) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "100px" },
    );
    observer.observe(element.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible || !snapshots || loading) return;
    const abort = new AbortController();
    snapshots
      .get(JSON.parse(signature), abort.signal)
      .then((image) => {
        if (!abort.signal.aborted) setResult({ signature, image });
      })
      .catch((error) => {
        if (!abort.signal.aborted)
          setResult({ signature, error: error.message });
      });
    return () => abort.abort();
  }, [snapshots, signature, loading, visible]);
  const current = result?.signature === signature ? result : null;
  return (
    <button
      ref={element}
      className="lobby-setup-image"
      onClick={onInspect}
      aria-label={`View ${name} full setup`}
    >
      {current?.image ? (
        <img src={current.image} alt={`${name} full setup`} />
      ) : (
        <span role="status">
          <PersonIcon aria-hidden="true" />
          {current?.error
            ? "Setup image unavailable"
            : "Preparing setup image…"}
        </span>
      )}
      <small>
        {current?.image
          ? "Full setup · open 3D"
          : current?.error
            ? "Open 3D for details"
            : "Rendered locally"}
      </small>
    </button>
  );
}
