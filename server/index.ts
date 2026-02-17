import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import routes from "./routes";
import { initDB } from "./db";

const app = express();
const PORT = parseInt(process.env.PORT || "5000");

app.use(cors());
app.use(express.json());
app.use(routes);

const __filename_ = typeof __filename !== "undefined" ? __filename : fileURLToPath(import.meta.url);
const __dirname_ = path.dirname(__filename_);
const distPath = path.resolve(__dirname_, "../public");
app.use(express.static(distPath));
app.get("*", (_req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

initDB().then(() => {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}).catch(err => {
  console.error("Failed to initialize database:", err);
  process.exit(1);
});
