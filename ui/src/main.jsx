import React from "react";
import { createRoot } from "react-dom/client";
import App from "@entry-app";
import "./styles.css";
import "./presets/editor.css";

createRoot(document.getElementById("root")).render(<App />);
