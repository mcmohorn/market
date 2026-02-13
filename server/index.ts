import express from "express";
import cors from "cors";
import path from "path";
import { initDB } from "./db";
import routes from "./routes";

const app = express();
const PORT = parseInt(process.env.PORT || "5000");

app.use(cors());
app.use(express.json());
app.use(routes);

const distPath = path.resolve(__dirname, "../dist/public");
app.use(express.static(distPath));
app.get("*", (_req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

async function start() {
  await initDB();
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

start().catch(console.error);
