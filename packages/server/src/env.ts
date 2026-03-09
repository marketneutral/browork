import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Load packages/server/.env (main config), then repo root .env for VITE_APP_NAME.
// dotenv won't overwrite existing vars, so order matters — local first.
dotenv.config({ path: resolve(__dirname, "../.env") });
dotenv.config({ path: resolve(__dirname, "../../../.env") });
