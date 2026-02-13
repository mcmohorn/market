import express from "express";
import cors from "cors";
import { initDB } from "./db";
import routes from "./routes";

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());
app.use(routes);

async function start() {
  await initDB();
  app.listen(PORT, "127.0.0.1", () => {
    console.log(`API server running on port ${PORT}`);
  });
}

start().catch(console.error);
