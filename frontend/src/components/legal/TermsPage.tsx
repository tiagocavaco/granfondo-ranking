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

export default function TermsPage() {
  usePageTitle("Terms of Use");

  return (
    <div className="max-w-2xl mx-auto">
      <BackButton />

      <div className="text-[10px] font-black tracking-[0.3em] text-blue-500/70 uppercase mb-2">
        Legal
      </div>
      <h1 className="font-display font-bold text-4xl sm:text-5xl text-white tracking-wide uppercase mb-2">
        Terms of Use
      </h1>
      <p className="text-slate-500 text-sm mb-10">
        Last updated: September 2026
      </p>

      <Section title="About this site">
        <p>
          Granfondo Portugal is an independent, non-commercial fan project. It
          is not an official platform of any race organiser, federation, or
          timing provider. Use of this site is free and requires no
          registration.
        </p>
      </Section>

      <Section title="Data accuracy">
        <p>
          Results and rankings are derived from publicly available timing data
          and may contain errors inherited from the source systems — including
          incorrect names, categories, team affiliations, or times. We make
          reasonable efforts to identify and correct such errors, but we make no
          warranty as to the accuracy, completeness, or timeliness of any data
          displayed.
        </p>
        <p>
          The ranking system and points calculations on this site are
          independent interpretations and are not endorsed by any official body.
          They are intended for interest and reference only and should not be
          relied upon for any official purpose.
        </p>
      </Section>

      <Section title="Intellectual property">
        <p>
          Race results are factual records and are not copyrightable. The
          software, design, and original content of this site are the work of
          the project author. You may not reproduce the site's design or
          codebase for commercial purposes without permission.
        </p>
        <p>
          The source code is available on GitHub under the project's licence
          terms.
        </p>
      </Section>

      <Section title="Limitation of liability">
        <p>
          This site is provided "as is" without warranty of any kind. The author
          accepts no liability for any loss or damage arising from reliance on
          information displayed here, including but not limited to incorrect
          results, missing data, or service unavailability.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          We may update these terms at any time. Continued use of the site after
          changes are posted constitutes acceptance of the revised terms. The
          date at the top of this page reflects the most recent update.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions about these terms can be sent to{" "}
          <a
            href="mailto:tiago.cavaco@gmail.com"
            className="text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors"
          >
            tiago.cavaco@gmail.com
          </a>
          .
        </p>
      </Section>

      <div className="border-t border-white/[0.06] pt-6 mt-4 flex gap-4 text-xs text-slate-600">
        <Link to="/privacy" className="hover:text-slate-400 transition-colors">
          Privacy Policy
        </Link>
      </div>
    </div>
  );
}
