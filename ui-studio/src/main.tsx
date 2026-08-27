import React from "react";
import ReactDOM from "react-dom/client";
import "./ui/styles/tokens.css";
import "./ui/styles/base.css";
import "./ui/styles/components.css";
import "./app/studio.css";
import "./features/screens.css";
import { App } from "./app/App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
