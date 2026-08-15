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

    return (
        <div className="flex items-center gap-2 border-b border-[#D0D7DE] bg-white px-6 py-3">
            <select
                value={door}
                onChange={(e) => handleDoorChange(e.target.value as Door)}
                disabled={disabled}
                className="rounded border border-[#D0D7DE] px-2 py-1.5 text-sm text-[#1A1F26]"
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
                className="flex-1 rounded border border-[#D0D7DE] px-2 py-1.5 text-sm text-[#1A1F26]"
            />
            <button
                type="button"
                onClick={() => setText(EXAMPLE[door])}
                disabled={disabled}
                className="rounded border border-[#D0D7DE] px-2 py-1.5 text-xs text-[#57606A] hover:bg-[#F6F8FA] disabled:opacity-40"
            >
                example
            </button>
            <button
                type="button"
                onClick={handleRun}
                disabled={disabled || !input}
                className="rounded bg-[#1A1F26] px-3 py-1.5 text-sm text-white disabled:opacity-40"
            >
                Run
            </button>
        </div>
    );
}
