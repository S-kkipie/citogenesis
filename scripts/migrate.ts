import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { sslFor } from "../src/server/drizzle/ssl";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

const pool = new Pool({
    connectionString,
    ssl: sslFor(connectionString),
});

await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
await pool.end();

console.log("migrations applied");
