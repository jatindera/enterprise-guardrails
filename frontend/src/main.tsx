import React from "react";
import ReactDOM from "react-dom/client";
import {
  FluentProvider,
  webLightTheme,
} from "@fluentui/react-components";

import App from "./App";
import "./index.css";

const enterpriseTheme = {
  ...webLightTheme,
  colorBrandBackground: "#196db0",
  colorBrandBackgroundHover: "#145a92",
  colorBrandBackgroundPressed: "#104b7b",
  colorBrandForeground1: "#196db0",
  colorBrandForeground2: "#185f9e",
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <FluentProvider theme={enterpriseTheme}>
      <App />
    </FluentProvider>
  </React.StrictMode>,
);