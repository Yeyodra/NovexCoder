import React from "react";
import ReactDOM from "react-dom/client";
import '@fontsource-variable/ibm-plex-sans';
import '@fontsource/ibm-plex-mono';
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
