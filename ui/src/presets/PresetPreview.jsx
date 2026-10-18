import { useEffect, useRef, useState } from "react";
import { PersonIcon } from "@radix-ui/react-icons";

// The desktop host supplies an authenticated loader. The static browser edition
// only uses files explicitly chosen by the user, and contains no desktop transport.
export default function PresetPreview({
  source,
  loadImage,
  alt,
  className = "",
  revision = "",
}) {
  const [image, setImage] = useState("");
  const [visible, setVisible] = useState(false);
  const element = useRef();
  const [retry, setRetry] = useState(0);
  const retryCount = useRef(0);
  const retryTimer = useRef();
  const scheduleRetry = useRef();
  useEffect(() => {
    retryCount.current = 0;
    clearTimeout(retryTimer.current);
  }, [source, revision]);
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
    setImage("");
    if (!source || !visible) return;
    const abort = new AbortController();
    let url;
    scheduleRetry.current = () => {
      if (abort.signal.aborted || retryCount.current >= 5) return;
      clearTimeout(retryTimer.current);
      const delay = [200, 500, 1000, 2000, 4000][retryCount.current++];
      retryTimer.current = setTimeout(
        () => setRetry((value) => value + 1),
        delay,
      );
    };
    const request = loadImage
      ? loadImage(source, abort.signal)
      : Promise.resolve(source);
    request
      .then((value) => {
        url = value;
        if (abort.signal.aborted) {
          if (loadImage) URL.revokeObjectURL(url);
          return;
        }
        setImage(value);
      })
      .catch(() => scheduleRetry.current?.());
    return () => {
      abort.abort();
      clearTimeout(retryTimer.current);
      if (url && loadImage) URL.revokeObjectURL(url);
    };
  }, [source, visible, loadImage, revision, retry]);
  return (
    <span ref={element} className={`preset-preview ${className}`}>
      {image ? (
        <img
          src={image}
          alt={alt}
          loading="lazy"
          onError={() => {
            setImage("");
            scheduleRetry.current?.();
          }}
        />
      ) : (
        <PersonIcon aria-hidden="true" />
      )}
    </span>
  );
}
