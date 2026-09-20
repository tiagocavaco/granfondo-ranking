import { Link } from "react-router-dom";
import { BackButton } from "../shared/BackButton";
import { usePageTitle } from "../../hooks/usePageTitle";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <h2 className="font-display font-bold text-lg text-white uppercase tracking-wide mb-3">
        {title}
      </h2>
      <div className="text-sm text-slate-400 leading-relaxed space-y-3">
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPage() {
  usePageTitle("Privacy Policy");

  return (
    <div className="max-w-2xl mx-auto">
      <BackButton />

      <div className="text-[10px] font-black tracking-[0.3em] text-blue-500/70 uppercase mb-2">
        Legal
      </div>
      <h1 className="font-display font-bold text-4xl sm:text-5xl text-white tracking-wide uppercase mb-2">
        Privacy Policy
      </h1>
      <p className="text-slate-500 text-sm mb-10">
        Last updated: September 2026
      </p>

      <Section title="What this site is">
        <p>
          Granfondo Portugal is an independent fan project that aggregates and
          displays publicly available race results from the Portuguese granfondo
          cycling series. It is not affiliated with any race organiser or timing
          provider.
        </p>
      </Section>

      <Section title="Data we display">
        <p>
          This site shows athlete information sourced from publicly available
          race results published by event organisers. This includes:
        </p>
        <ul className="list-disc list-inside space-y-1 text-slate-400 ml-2">
          <li>Name as registered with the race organiser</li>
          <li>Nationality / country flag</li>
          <li>Finishing position, time, and category</li>
          <li>Team affiliation</li>
          <li>Aggregate ranking points derived from the above</li>
        </ul>
        <p>
          All data originates from public results pages published by race
          organisers. We do not collect, store, or process any data you submit —
          there are no accounts, no forms, and no user-generated content on this
          site.
        </p>
      </Section>

      <Section title="Cookies and tracking">
        <p>
          This site sets no cookies and uses no analytics, advertising, or
          tracking scripts of any kind. No personal data about visitors is
          collected.
        </p>
        <p>
          The site is hosted on GitHub Pages. GitHub may log standard HTTP
          request metadata (IP address, user agent, referrer) for security and
          abuse prevention purposes, governed by{" "}
          <a
            href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors"
          >
            GitHub's Privacy Statement
          </a>
          .
        </p>
      </Section>

      <Section title="Legal basis (GDPR)">
        <p>
          The legal basis for displaying athlete race results is{" "}
          <strong className="text-slate-300">legitimate interests</strong>{" "}
          (Article 6(1)(f) GDPR) — specifically, providing a public record of
          sporting achievements that were voluntarily entered into public
          competitions and published by the race organisers. The data is limited
          to what is already publicly available and is used solely for
          informational purposes.
        </p>
      </Section>

      <Section title="Your rights (GDPR)">
        <p>
          If you are an athlete whose data appears on this site and you wish to
          have it removed or corrected, please contact us. We will process
          removal requests within a reasonable time. Note that the underlying
          data comes from public race results — we can remove it from this site
          but cannot alter the source records held by race organisers.
        </p>
        <p>
          Under GDPR you also have the right to access, rectify, or restrict
          processing of your personal data. As we do not collect any visitor
          data, these rights apply only to athletes whose race results are
          displayed.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          For any privacy-related requests, including data removal, open an
          issue on{" "}
          <a
            href="https://github.com/tiagocavaco/granfondo-ranking/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors"
          >
            GitHub
          </a>
          .
        </p>
      </Section>

      <div className="border-t border-white/[0.06] pt-6 mt-4 flex gap-4 text-xs text-slate-600">
        <Link to="/terms" className="hover:text-slate-400 transition-colors">
          Terms of Use
        </Link>
      </div>
    </div>
  );
}
