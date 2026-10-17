import { StackIcon, ListBulletIcon, GlobeIcon } from "@radix-ui/react-icons";
import "./navigation.css";

export const TRACK_PAGES = ["browse", "local", "tracks"];

export default function TracksHub({
  active,
  onChange,
  busy = false,
  browser = false,
  children,
}) {
  const tabs = [
    ["browse", GlobeIcon, "Discover groups"],
    ["local", StackIcon, "My groups"],
    ...(!browser ? [["tracks", ListBulletIcon, "My tracks"]] : []),
  ];
  return (
    <section className="tracks-hub" aria-label="Tracks">
      <header className="tracks-hub-heading">
        <h1>Tracks</h1>
        <nav className="tracks-hub-tabs" aria-label="Track collections">
          {tabs.map(([id, Icon, label]) => (
            <button
              key={id}
              aria-current={active === id ? "page" : undefined}
              disabled={busy}
              onClick={() => onChange(id)}
            >
              <Icon aria-hidden="true" />
              {label}
            </button>
          ))}
        </nav>
      </header>
      <div className="tracks-hub-content">{children}</div>
    </section>
  );
}
