import { drizzle } from "drizzle-orm/node-postgres";
import { ServerConfig } from "@/config/server-config";
import * as schema from "@/server/drizzle/schemas";
import { sslFor } from "./ssl";

export const db = drizzle({
    connection: {
        connectionString: ServerConfig.databaseURL,
        ssl: sslFor(ServerConfig.databaseURL),
    },
    schema,
    casing: "snake_case",
});
