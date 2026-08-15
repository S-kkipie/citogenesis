import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import type { RunState, RunStatus } from "@/core/run/domain";

export const runs = pgTable("runs", {
    id: text().primaryKey(),
    createdAt: timestamp({ withTimezone: true, mode: "string" })
        .notNull()
        .defaultNow(),
    status: text().$type<RunStatus>().notNull(),
    /** Full serialized RunState (may be partial while status = running). */
    state: jsonb().$type<RunState>().notNull(),
    /** Canonical key of state.input; null on rows from before dedupe. */
    inputKey: text(),
});
