"use client";
import { motion, stagger, useAnimate } from "motion/react";
import { useEffect } from "react";
import { cn } from "@/frontend/lib/utils";

/**
 * Aceternity UI · text-generate-effect (adapted: inherits color/size from
 * parent instead of hardcoding, so it composes with the landing tokens).
 */
export const TextGenerateEffect = ({
    words,
    className,
    filter = true,
    duration = 0.5,
}: {
    words: string;
    className?: string;
    filter?: boolean;
    duration?: number;
}) => {
    const [scope, animate] = useAnimate();
    const wordsArray = words.split(" ");
    useEffect(() => {
        animate(
            "span",
            {
                opacity: 1,
                filter: filter ? "blur(0px)" : "none",
            },
            {
                duration: duration ? duration : 1,
                delay: stagger(0.06),
            },
        );
    }, [animate, duration, filter]);

    return (
        <div className={cn(className)} ref={scope}>
            {wordsArray.map((word, idx) => (
                <motion.span
                    key={word + idx}
                    className="opacity-0"
                    style={{ filter: filter ? "blur(8px)" : "none" }}
                >
                    {word}{" "}
                </motion.span>
            ))}
        </div>
    );
};
