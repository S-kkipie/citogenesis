"use client";

import { MeshGradient } from "@paper-design/shaders-react";
import { useEffect, useState } from "react";

/**
 * Atmospheric canvas: paper-shaders mesh gradient in the landing's deep
 * ink-blue band with one warm spot (the "infection" glow). Freezes under
 * prefers-reduced-motion.
 */
export function ShaderBg() {
    const [reduced, setReduced] = useState(false);

    useEffect(() => {
        const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
        setReduced(mq.matches);
        const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
        mq.addEventListener("change", onChange);
        return () => mq.removeEventListener("change", onChange);
    }, []);

    return (
        <div className="lp-shader" aria-hidden="true">
            {/* WebGL uniforms can't read CSS vars; these hexes mirror the
                landing tokens: #0b1020≈--lp-paper, #101830≈--lp-paper-2,
                #1a1436≈paper-2 shifted violet, #2b1c10≈--lp-origin-fill
                (the single warm bloom the atmospheric genre allows). */}
            <MeshGradient
                colors={["#0b1020", "#101830", "#1a1436", "#2b1c10"]}
                distortion={0.7}
                swirl={0.35}
                grainMixer={0.12}
                grainOverlay={0.05}
                speed={reduced ? 0 : 0.12}
                style={{ width: "100%", height: "100%" }}
            />
        </div>
    );
}
