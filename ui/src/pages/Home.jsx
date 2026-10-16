import {
  ArrowRightIcon,
  PersonIcon,
  StackIcon,
  GearIcon,
} from "@radix-ui/react-icons";
import { assetUrl } from "../assets.js";

export default function Home({
  onNavigate,
  onQuickSetup,
  browser = false,
  presetCount = 0,
  groupCount = 0,
}) {
  return (
    <section className="garage-home">
      <div className="home-art">
        <img
          src={assetUrl("/BobbysGarageV4.png")}
          alt="Bobby’s Garage, a workshop for your next race"
        />
      </div>
      <div className="home-menu">
        <header>
          <h1>Bobby’s Garage</h1>
          <p>Your racer. Your setup. Your next race.</p>
        </header>
        <div className="home-destinations">
          <button className="home-primary" onClick={onQuickSetup}>
            <PersonIcon />
            <span>
              <strong>Quick Setup</strong>
              <small>Customize the racer you use in the game</small>
            </span>
            <ArrowRightIcon />
          </button>
          <button onClick={() => onNavigate("presets")}>
            <PersonIcon />
            <span>
              <strong>Presets & customization</strong>
              <small>
                {presetCount
                  ? `${presetCount} saved setups`
                  : "Build, arrange and share your setups"}
              </small>
            </span>
            <ArrowRightIcon />
          </button>
          <button onClick={() => onNavigate("local")}>
            <StackIcon />
            <span>
              <strong>My track groups</strong>
              <small>
                {groupCount
                  ? `${groupCount} racing collections`
                  : "Create, manage and export track groups"}
              </small>
            </span>
            <ArrowRightIcon />
          </button>
          <button onClick={() => onNavigate("browse")}>
            <StackIcon />
            <span>
              <strong>Discover track groups</strong>
              <small>Speedrun and community collections</small>
            </span>
            <ArrowRightIcon />
          </button>
          {!browser && (
            <button onClick={() => onNavigate("tracks")}>
              <StackIcon />
              <span>
                <strong>My tracks</strong>
                <small>Browse downloaded and official tracks</small>
              </span>
              <ArrowRightIcon />
            </button>
          )}
        </div>
        <button
          className="home-settings"
          onClick={() => onNavigate(browser ? "help" : "settings")}
        >
          <GearIcon />
          {browser ? "How to import into the game" : "Settings & updates"}
        </button>
      </div>
    </section>
  );
}
