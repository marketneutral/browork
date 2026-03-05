import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AdminAuthGate } from "@/components/auth/AdminAuthGate";
import { App } from "@/App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename="/admin">
      <AdminAuthGate>
        <App />
      </AdminAuthGate>
    </BrowserRouter>
  </StrictMode>,
);
