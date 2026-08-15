export function Legend() {
    return (
        <div className="absolute bottom-3 left-3 rounded border border-[var(--au-canvas-rule)] bg-[var(--au-canvas)]/90 p-2 text-[10px] text-[var(--au-canvas-ink)] leading-tight shadow-sm">
            <p>
                <span className="text-[#CF222E]">●</span> flagged &nbsp;
                <span className="text-[#9A6700]">●</span> caution &nbsp;
                <span className="text-[#1A7F37]">●</span> primary-clean
            </p>
            <p>
                ● solid = primary · ○ ring = secondary · ◌ dashed = unresolved
            </p>
            <p>
                <span className="text-[#CF222E]">━</span> red edge = citation
                cycle
            </p>
        </div>
    );
}
