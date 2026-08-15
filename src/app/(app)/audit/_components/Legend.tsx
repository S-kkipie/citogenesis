export function Legend() {
    return (
        <div className="absolute bottom-3 left-3 rounded border bg-white/90 p-2 text-[10px] leading-tight text-[#1A1F26] shadow-sm">
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
