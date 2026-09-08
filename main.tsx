import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./style-tokens.css";
import "./style-app.css";
import "./style-layer-controls.css";
import "./style-download-queue.css";
import "./style-footer.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
