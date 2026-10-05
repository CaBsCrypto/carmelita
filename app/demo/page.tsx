import Link from "next/link";
import BrandLockup from "../brand-lockup";
import ActionConsole from "./action-console";

export const metadata = {
  title: "Service catalog | Carmelita",
  description: "Explore public service offers and their current availability.",
};

export default function DemoPage() {
  return (
    <main className="demo-page">
      <nav className="demo-nav shell">
        <Link className="brand" href="/"><BrandLockup /></Link>
        <div><span>PUBLIC CATALOG</span><Link href="/developers">API docs</Link></div>
      </nav>

      <header className="demo-intro shell">
        <div>
          <p className="eyebrow">EXPLORE SERVICES</p>
          <h1>Discover services. <em>Check their availability.</em></h1>
          <p>Explore the public catalog before connecting your account. Listing an offer does not confirm that its provider is ready to deliver it.</p>
        </div>
        <aside>
          <strong>Available here</strong>
          <span>Public offers and service descriptions</span>
          <span>Listed network and amount</span>
          <span>Demo and provider availability labels</span>
          <small>Public demo operations and receipt lookup are disabled.</small>
        </aside>
      </header>

      <div id="safety-proof"><ActionConsole /></div>

      <section className="demo-next shell">
        <div><p className="eyebrow">YOUR ACCOUNT</p><h2>Open Carmelita to connect your account and discover your available capabilities.</h2></div>
        <Link href="/agent">Open the agent</Link>
      </section>
    </main>
  );
}
