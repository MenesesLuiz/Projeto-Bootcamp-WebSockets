import { existsSync } from "fs";
import { join } from "path";
import express from "express";
import { cors } from "./middleware/cors";
import { requestLogger } from "./middleware/request-logger";

export const app = express();

app.use(requestLogger);
app.use(cors);

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// Only present in the production Docker image (see ../Dockerfile), which
// copies the built `web/` app in here - local dev keeps using the Vite dev
// server on :5173, since this directory never exists outside the container.
const webDistPath = join(__dirname, "../public");
if (existsSync(join(webDistPath, "index.html"))) {
  app.use(express.static(webDistPath));
  // Express 5 dropped bare "*" routes (path-to-regexp requires named
  // wildcards) - a path-less middleware is the simplest SPA fallback.
  app.use((req, res) => {
    res.sendFile(join(webDistPath, "index.html"));
  });
}
