import { useEffect, useRef, useState } from "react";
import { PersonIcon } from "@radix-ui/react-icons";

// The desktop host supplies an authenticated loader. The static browser edition
// only uses files explicitly chosen by the user, and contains no desktop transport.
export default function PresetPreview({
  source,
  loadImage,
  alt,
  className = "",
}) {
  const [image, setImage] = useState("");
  const [visible, setVisible] = useState(false);
  const element = useRef();
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
      .catch(() => {});
    return () => {
      abort.abort();
      if (url && loadImage) URL.revokeObjectURL(url);
    };
  }, [source, visible, loadImage]);
  return (
    <span ref={element} className={`preset-preview ${className}`}>
      {image ? (
        <img
          src={image}
          alt={alt}
          loading="lazy"
          onError={() => setImage("")}
        />
      ) : (
        <PersonIcon aria-hidden="true" />
      )}
    </span>
  );
}
