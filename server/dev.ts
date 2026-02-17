import express from "express";
import cors from "cors";
import routes from "./routes";
import { initDB } from "./db";

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());
app.use(routes);

initDB().then(() => {
  app.listen(PORT, "127.0.0.1", () => {
    console.log(`API server running on port ${PORT}`);
  });
}).catch(err => {
  console.error("Failed to initialize database:", err);
  process.exit(1);
});
