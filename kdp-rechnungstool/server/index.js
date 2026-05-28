import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase } from "./db.js";
import { createRouter } from "./routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp(db) {
  const app = express();
  const distDir = path.resolve(__dirname, "..", "dist");
  const assetDir = path.resolve(__dirname, "assets");
  app.use(express.json({ limit: "20mb" }));
  app.use(express.static(assetDir));
  app.use("/api", createRouter(db));
  if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
  }
  return app;
}

if (process.argv[1] === __filename) {
  const dataDir = path.join(__dirname, "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const db = createDatabase(path.join(dataDir, "kdp-rechnungstool.sqlite"));
  const app = createApp(db);
  const port = process.env.PORT || 5174;

  app.listen(port, "127.0.0.1", () => {
    console.log(`KDP Rechnungstool API: http://127.0.0.1:${port}`);
  });
}
