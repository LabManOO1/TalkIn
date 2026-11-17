import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./assets/styles/global.scss";
import App from "./shell/App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
