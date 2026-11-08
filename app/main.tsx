import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import MemoQuestApp from "./MemoQuestApp";
import ServiceWorkerRegister from "./ServiceWorkerRegister";
import "./globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MemoQuestApp />
    <footer className="publication-footer">
      <a href="https://papaye-labs.fr/">Papaye Labs</a>
      <span>Tes cartes restent sur cet appareil.</span>
      <a href="/aide.html">Sauvegarde, hors ligne et crédits</a>
    </footer>
    <ServiceWorkerRegister />
  </StrictMode>,
);
