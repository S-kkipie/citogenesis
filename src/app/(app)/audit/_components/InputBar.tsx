"use client";

import { useState } from "react";
import type { RunInput } from "@/core/run/domain";

type Door = "claim" | "paper" | "wikipedia";

const DOOR_LABEL: Record<Door, string> = {
    claim: "Claim",
    paper: "Paper (arXiv/DOI)",
    wikipedia: "Wikipedia URL",
};

const EXAMPLE: Record<Door, string> = {
    claim: "chocolate prevents cancer",
    paper: "10.1038/nature12373",
    wikipedia: "https://en.wikipedia.org/wiki/Spinach",
};

const CHIPS: { label: string; door: Door; text: string }[] = [
    {
        label: "Chocolate & cancer",
        door: "claim",
        text: "Chocolate consumption prevents cancer",
    },
    {
        label: "Power posing",
        door: "claim",
        text: "Power posing changes hormone levels and risk tolerance",
    },
    {
        label: "Nature paper (DOI)",
        door: "paper",
        text: "10.1038/nature12373",
    },
    {
        label: "Wikipedia: Spinach",
        door: "wikipedia",
        text: "https://en.wikipedia.org/wiki/Spinach",
    },
];

function buildInput(door: Door, text: string): RunInput | null {
    const trimmed = text.trim();
    if (door === "claim") {
        return trimmed.length >= 8 ? { kind: "claim", text: trimmed } : null;
    }
    if (door === "paper") {
        return trimmed.length >= 3 ? { kind: "paper", id: trimmed } : null;
    }
    return trimmed.startsWith("http")
        ? { kind: "wikipedia", url: trimmed }
        : null;
}

export function InputBar({
    onRun,
    disabled,
}: {
    onRun: (input: RunInput) => void;
    disabled?: boolean;
}) {
    const [door, setDoor] = useState<Door>("claim");
    const [text, setText] = useState("");

    const input = buildInput(door, text);

    const handleDoorChange = (next: Door) => {
        setDoor(next);
        setText("");
    };

    const handleRun = () => {
        if (input) onRun(input);
    };

    const handleChip = (chip: (typeof CHIPS)[number]) => {
        setDoor(chip.door);
        setText(chip.text);
        const built = buildInput(chip.door, chip.text);
        if (built) onRun(built);
    };

    return (
        <div className="audit-scope border-[var(--au-rule)] border-b bg-[var(--au-paper-2)] px-6 py-3">
            <div className="flex items-center gap-2">
                <select
                    value={door}
                    onChange={(e) => handleDoorChange(e.target.value as Door)}
                    disabled={disabled}
                    className="rounded border border-[var(--au-rule)] bg-[var(--au-paper)] px-2 py-1.5 text-[var(--au-ink)] text-sm"
                >
                    {(Object.keys(DOOR_LABEL) as Door[]).map((d) => (
                        <option key={d} value={d}>
                            {DOOR_LABEL[d]}
                        </option>
                    ))}
                </select>
                <input
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={EXAMPLE[door]}
                    disabled={disabled}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && input) handleRun();
                    }}
                    className="flex-1 rounded border border-[var(--au-rule)] bg-[var(--au-paper)] px-2 py-1.5 text-[var(--au-ink)] text-sm placeholder:text-[var(--au-neutral)]"
                />
                <button
                    type="button"
                    onClick={() => setText(EXAMPLE[door])}
                    disabled={disabled}
                    className="rounded border border-[var(--au-rule)] px-2 py-1.5 text-[var(--au-neutral)] text-xs hover:bg-[var(--au-paper)] disabled:opacity-40"
                >
                    example
                </button>
                <button
                    type="button"
                    onClick={handleRun}
                    disabled={disabled || !input}
                    className="rounded bg-[var(--au-accent)] px-3 py-1.5 font-medium text-[var(--au-paper)] text-sm disabled:opacity-40"
                >
                    Run
                </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="font-[family-name:var(--font-mono)] text-[10px] text-[var(--au-neutral)] uppercase tracking-wide">
                    Try
                </span>
                {CHIPS.map((chip) => (
                    <button
                        key={chip.label}
                        type="button"
                        onClick={() => handleChip(chip)}
                        disabled={disabled}
                        className="rounded-full border border-[var(--au-rule)] bg-[var(--au-paper)] px-2.5 py-1 text-[11px] text-[var(--au-muted)] transition-colors hover:border-[var(--au-accent)] hover:text-[var(--au-accent)] disabled:opacity-40"
                    >
                        {chip.label}
                    </button>
                ))}
            </div>
        </div>
    );
}
