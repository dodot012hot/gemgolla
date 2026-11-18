import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { inject } from "@vercel/analytics";
import App from "./App";
import "./index.css";

// Vercel 방문자 통계 (쿠키 없음, 개인 식별 안 함). Vercel 대시보드에서 Analytics를 켜야 기록됨
inject();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
