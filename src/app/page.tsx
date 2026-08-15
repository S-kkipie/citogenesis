import Link from "next/link";
import { CitationGraph } from "@/frontend/components/landing/citation-graph";
import { ShaderBg } from "@/frontend/components/landing/shader-bg";
import { TextGenerateEffect } from "@/frontend/components/ui/text-generate-effect";
import "./landing.css";

export default function LandingPage() {
    return (
        <div className="landing">
            <ShaderBg />

            <header className="lp-nav">
                <Link className="lp-wordmark" href="/">
                    citogenesis
                </Link>
                <nav>
                    <a href="#agents">method</a>
                    <Link href="/audit">run audit</Link>
                </nav>
            </header>

            <section className="lp-hero">
                <div>
                    <h1>Follow every citation to the floor.</h1>
                    <TextGenerateEffect
                        className="lp-sub"
                        words="Four agents walk a claim's reference chain backwards through the open scholarly graph — and report whether anything real is holding it up. Every hop logged. Every verdict auditable."
                    />
                    <div className="lp-actions">
                        <Link className="lp-btn" href="/audit">
                            Trace a claim
                        </Link>
                        <a className="lp-ghost" href="#agents">
                            How it works ↓
                        </a>
                    </div>
                </div>
                <CitationGraph />
            </section>

            <section className="lp-agents" id="agents">
                <div className="lp-agent">
                    <h3>
                        CHAIN-TRACER<span className="lp-arrow">→</span>
                    </h3>
                    <p>
                        Walks the references backwards through OpenAlex. Builds
                        the graph. Finds the cycles.
                    </p>
                </div>
                <div className="lp-agent">
                    <h3>
                        PRIMACY-JUDGE<span className="lp-arrow">→</span>
                    </h3>
                    <p>
                        Primary data or secondary echo — every node in the chain
                        gets a label.
                    </p>
                </div>
                <div className="lp-agent">
                    <h3>
                        DRIFT-AUDITOR<span className="lp-arrow">→</span>
                    </h3>
                    <p>
                        Reads the origin's full text against the claim. Measures
                        how the support deformed.
                    </p>
                </div>
                <div className="lp-agent">
                    <h3>VERDICT</h3>
                    <p>
                        Pathogen, confidence, coverage — with the full trace to
                        prove it.
                    </p>
                </div>
            </section>

            <footer className="lp-foot">
                <p className="lp-statement">
                    A citation is a promise. We check it.
                </p>
                <Link className="lp-btn" href="/audit">
                    Audit your claim
                </Link>
                <small>
                    Citogenesis · built on{" "}
                    <a href="https://openalex.org">OpenAlex</a> · Research
                    Agents Hack 2026 · named after{" "}
                    <a href="https://xkcd.com/978">xkcd № 978</a>
                </small>
            </footer>
        </div>
    );
}
