import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import { prisma } from "./prisma";
import authRouter from "./routes/auth";
import communitiesRouter from "./routes/communities";
import proposalsRouter from "./routes/proposals";
import votesRouter from "./routes/votes";
import meRouter from "./routes/me";
import { startIndexer } from "./services/indexer";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: "*" }));
app.use(express.json());
app.use(morgan("dev"));

// ── Routes ──────────────────────────────────────────────────────────────────
app.use("/auth", authRouter);
app.use("/me", meRouter);
app.use("/communities", communitiesRouter);
app.use("/proposals", proposalsRouter);
app.use("/proposals", votesRouter);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", ts: new Date().toISOString() });
});

// ── Start ────────────────────────────────────────────────────────────────────
async function main() {
  await prisma.$connect();
  console.log("📦 Database connected");

  // Start blockchain event indexer (non-blocking)
  startIndexer().catch(console.error);

  app.listen(PORT, () => {
    console.log(`🚀 API server running on http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
