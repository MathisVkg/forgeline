// @ts-check
import "@fontsource/barlow/400.css";
import "@fontsource/barlow/500.css";
import "@fontsource/barlow/600.css";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "@fontsource/jetbrains-mono/500.css";
import "./styles/tokens.css";
import { mount } from "svelte";
import App from "./App.svelte";

const target = document.getElementById("app");
if (!target) throw new Error("#app element missing");

export default mount(App, { target });

// Dev only: window.forgelineSeed() adds sample orders. Removed from production builds.
if (import.meta.env.DEV) import("./lib/dev/seed.js");
