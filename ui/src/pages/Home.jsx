import {
  ArrowRightIcon,
  PersonIcon,
  StackIcon,
  GearIcon,
  AvatarIcon,
} from "@radix-ui/react-icons";
import { assetUrl } from "../assets.js";
import "./navigation.css";

export default function Home({
  onNavigate,
  onQuickSetup,
  browser = false,
  presetCount = 0,
  groupCount = 0,
}) {
  return (
    <section className="garage-home garage-main-menu">
      <div className="home-art">
        <img
          src={assetUrl("/BobbyGarageArtwork.png")}
          alt="Bobby’s Garage, a workshop for your next race"
        />
      </div>
      <div className="home-menu">
        <header>
          <h1>Bobby’s Garage</h1>
          <p>Ready for your next race?</p>
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
              <strong>Presets</strong>
              <small>
                {presetCount
                  ? `${presetCount} saved setups`
                  : "Build, arrange and share your setups"}
              </small>
            </span>
            <ArrowRightIcon />
          </button>
          <button onClick={() => onNavigate("browse")}>
            <StackIcon />
            <span>
              <strong>Tracks</strong>
              <small>
                {groupCount
                  ? `${groupCount} groups · discover, collect and race`
                  : "Discover groups and arrange your race list"}
              </small>
            </span>
            <ArrowRightIcon />
          </button>
          {!browser && (
            <button onClick={() => onNavigate("lobby")}>
              <AvatarIcon />
              <span>
                <strong>Lobby</strong>
                <small>Find a setup you like and save a copy</small>
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
