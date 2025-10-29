import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import mongoSanitize from "express-mongo-sanitize";
import hpp from "hpp";
import rateLimit from "express-rate-limit";
import path from 'path';

// DB + Middlewares
import connectDB from "./config/db.js";
import { authMiddleware } from "./middlewares/authMiddleware.js";

// Routes
import authRoute from "./routes/auth/authRoute.js";
import companyRoute from "./routes/company/companyRoute.js";
import branchRoute from "./routes/branch/branchRoute.js";
import userRoute from "./routes/user/userRoute.js";
import pricelevelRoute from "./routes/pricelevel/pricelevelRoute.js";
import acccountmasterRoute from "./routes/accountmaster/accountMasterRoute.js";
import itemRoute from "./routes/itemmaster/itemRoute.js";
import PaymentRoutes from "./routes/FundTransactionRoutes/PaymentRoutes.js";
import saleRoutes from "./routes/transactions/saleRoutes.js";

// ----------------- App Init -----------------
dotenv.config();
const app = express();
const PORT = process.env.PORT || 4000;

// ----------------- Global Middlewares -----------------
const corsOptions = {
  origin: true,
  credentials: true,
};
app.use(cors(corsOptions));

app.use((req, res, next) => {
  Object.defineProperty(req, "query", {
    ...Object.getOwnPropertyDescriptor(req, "query"),
    value: req.query,
    writable: true,
  });
  next();
});

// Cookie parser (must be before routes if using cookies for auth)
app.use(cookieParser());

// Security
app.use(helmet()); // Secure headers
app.use(
  mongoSanitize({
    replaceWith: "_",
    onSanitize: ({ req, key }) => {
      console.warn(`Sanitized request[${key}]`);
    },
  })
);
app.use(hpp()); // Prevent HTTP Parameter Pollution

// Body parser
app.use(express.json({ limit: "10mb" })); // Parse JSON requests

// Rate limiting (apply only to /api/*)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api", limiter);

// ----------------- DB Connection -----------------
connectDB().catch((err) => console.error("DB connection failed", err));

// ----------------- Routes -----------------

app.use("/api/auth", authRoute);
app.use("/api/company", authMiddleware, companyRoute);
app.use("/api/branch", authMiddleware, branchRoute);
app.use("/api/user", authMiddleware, userRoute);
app.use("/api/pricelevel", authMiddleware, pricelevelRoute);
app.use("/api/accountmaster", authMiddleware, acccountmasterRoute);
app.use("/api/transaction/sale", authMiddleware, saleRoutes);
app.use("/api/transaction/purchase", authMiddleware, saleRoutes);
app.use("/api/item", authMiddleware, itemRoute);
app.use("/api/transaction", authMiddleware, PaymentRoutes);

// ----------------- Production Build Serving -----------------
if (process.env.NODE_ENV === "production") {
  console.log("Environment:", process.env.NODE_ENV);

  const __dirname = path.resolve();
  const frontendPath = path.join(__dirname,"..","frontend", "dist");

  console.log("Serving static files from:", frontendPath);

  // Serve static files
  app.use(express.static(frontendPath));

  console.log("front end path", frontendPath);
  

  // Handle SPA routing - serve index.html for all non-API routes using named splat wildcard
  app.get("/*splat", (req, res) => {
    res.sendFile(path.resolve(frontendPath, "index.html"));
  });
} else {
  // Development route
  app.get("/", (req, res) => {
    res.send("✅ Server is alive (Development Mode)");
  });
}

// ----------------- Error Handling -----------------
app.use((err, req, res, next) => {
  console.error("❌ Error:", err.stack);
  res.status(500).json({ error: "Something went wrong!" });
});

// ----------------- Server -----------------
app.listen(PORT, () => {
  console.log(`🚀 Server started at http://localhost:${PORT}`);
});
