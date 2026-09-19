import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "@granfondo/api";
import type { DistancePredictions, FavoritePrediction } from "@granfondo/api";
import type { StoredEvent } from "@granfondo/database/types";
import { DISTANCES } from "@granfondo/utils/distance";
import { Spinner } from "../shared/Spinner";
import { GenderToggle } from "../shared/GenderToggle";
import { distBadgeClass } from "../../utils/distance";
import {
  rankBorderAccent,
  rankRowBg,
  rankBadgeStyle,
} from "../../utils/posStyle";
import { countryFlag } from "@granfondo/database/normalize";
import { isFemaleCategory, categorySortKey } from "@granfondo/utils/category";
import { ShieldCheckIcon } from "../shared/ShieldCheckIcon";

const COLLAPSED_COUNT = 3;

function FavoriteCard({
  pred,
  rank,
}: {
  pred: FavoritePrediction;
  rank: number;
}) {
  const crossDistance =
    pred.mainDistance && pred.mainDistance !== pred.distance;
  const flag = countryFlag(pred.country);

  return (
    <Link
      to={`/athlete/${pred.athleteId}`}
      className={`flex items-center gap-3 py-3 px-4 border-b border-white/[0.05] last:border-0 hover:bg-white/[0.03] transition-colors group ${rankBorderAccent(rank)} ${rankRowBg(rank)}`}
    >
      <div
        className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${rankBadgeStyle(rank)}`}
      >
        {rank}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          {flag && (
            <span className="text-base leading-none shrink-0">{flag}</span>
          )}
          <span className="font-semibold text-slate-100 group-hover:text-blue-300 transition-colors truncate">
            {pred.name}
          </span>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap min-w-0">
          {pred.team && (
            <span className="text-xs text-slate-600 truncate max-w-[160px] sm:max-w-xs">
              {pred.team}
            </span>
          )}
          {crossDistance && (
            <span
              className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${distBadgeClass(pred.mainDistance!)}`}
            >
              Mainly {pred.mainDistance}
            </span>
          )}
        </div>
      </div>
      <div className="shrink-0 text-right">
        {pred.weightedScore > 0 && (
          <div className="text-xs font-semibold text-slate-400">
            {Math.round(pred.weightedScore)} pts
          </div>
        )}
        {pred.raceCount > 0 && (
          <div className="text-[10px] text-slate-600">
            {pred.raceCount} event{pred.raceCount !== 1 ? "s" : ""}
          </div>
        )}
      </div>
    </Link>
  );
}

function OverallCard({
  pred,
  label,
}: {
  pred: FavoritePrediction;
  label: string;
}) {
  const crossDistance =
    pred.mainDistance && pred.mainDistance !== pred.distance;
  const flag = countryFlag(pred.country);
  const isFemale = label === "Female";

  return (
    <Link
      to={`/athlete/${pred.athleteId}`}
      className="flex-1 relative bg-[#0c1628] rounded-2xl border border-white/[0.07] p-5 hover:border-white/[0.14] transition-all group overflow-hidden"
    >
      {/* Gender-coded top accent */}
      <div
        className={`absolute inset-x-0 top-0 h-[2px] ${
          isFemale
            ? "bg-gradient-to-r from-pink-400/0 via-pink-400/70 to-pink-400/0"
            : "bg-gradient-to-r from-blue-400/0 via-blue-400/50 to-blue-400/0"
        }`}
      />
      {/* Ghost initial watermark */}
      <div className="absolute right-0 top-0 bottom-0 flex items-center pr-3 select-none pointer-events-none opacity-[0.04]">
        <div className="text-[100px] font-black text-white leading-none">
          {pred.name.charAt(0)}
        </div>
      </div>

      <div className="relative">
        <div className="mb-2.5">
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest ${
              isFemale
                ? "bg-pink-500/15 text-pink-300 border border-pink-500/20"
                : "bg-blue-500/15 text-blue-300 border border-blue-500/20"
            }`}
          >
            {label} Favorite
          </span>
        </div>
        <div className="flex items-center gap-2 mb-1">
          {flag && (
            <span className="text-lg leading-none shrink-0">{flag}</span>
          )}
          <span className="font-display font-black text-white group-hover:text-blue-300 transition-colors text-base sm:text-lg leading-tight truncate uppercase">
            {pred.name}
          </span>
        </div>
        {pred.team && (
          <div className="text-xs text-slate-600 truncate mb-2">
            {pred.team}
          </div>
        )}
        <div className="flex items-center gap-2 flex-wrap mt-2 pt-2 border-t border-white/[0.06]">
          {crossDistance && (
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${distBadgeClass(pred.mainDistance!)}`}
            >
              Mainly {pred.mainDistance}
            </span>
          )}
          {pred.weightedScore > 0 && (
            <span className="text-[11px] text-amber-500 font-bold">
              {Math.round(pred.weightedScore)} pts
            </span>
          )}
          {pred.raceCount > 0 && (
            <span className="text-[10px] text-slate-600">
              {pred.raceCount} events
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function CategorySection({
  category,
  preds,
}: {
  category: string;
  preds: { ranked: FavoritePrediction[]; newcomers: number };
}) {
  const [expanded, setExpanded] = useState(false);
  if (preds.ranked.length === 0 && preds.newcomers === 0) {
    return null;
  }

  const visible = expanded
    ? preds.ranked
    : preds.ranked.slice(0, COLLAPSED_COUNT);
  const hiddenCount = preds.ranked.length - COLLAPSED_COUNT;

  return (
    <div className="border-b border-white/[0.05] last:border-0">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-[#060d1a] border-b border-white/[0.05]">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
          {category}
        </span>
        {preds.newcomers > 0 && preds.ranked.length > 0 && (
          <span className="shrink-0 text-[10px] text-slate-600 font-medium">
            +{preds.newcomers} unranked
          </span>
        )}
      </div>
      {preds.ranked.length === 0 ? (
        <div className="px-4 py-3 text-xs text-slate-600 italic">
          {preds.newcomers} unranked
        </div>
      ) : (
        <>
          {visible.map((pred, i) => (
            <FavoriteCard key={pred.athleteId} pred={pred} rank={i + 1} />
          ))}
          {hiddenCount > 0 && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="w-full px-4 py-2.5 text-xs font-semibold text-blue-400 hover:bg-white/[0.03] transition-colors text-center border-t border-white/[0.05]"
            >
              {expanded ? "Show less ↑" : `Show ${hiddenCount} more ↓`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function NoPredictionsState() {
  return (
    <div className="text-center py-16 text-slate-500">
      <svg
        className="w-10 h-10 mx-auto mb-3 text-slate-700"
        viewBox="0 0 24 24"
        fill="currentColor"
      >
        <path d="M17 7h-4v2h4c1.65 0 3 1.35 3 3s-1.35 3-3 3h-4v2h4c2.76 0 5-2.24 5-5s-2.24-5-5-5zm-6 8H7c-1.65 0-3-1.35-3-3s1.35-3 3-3h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-2zm-3-4h8v2H8z" />
      </svg>
      <p className="font-semibold text-slate-600">
        No predictions available yet
      </p>
      <p className="text-sm mt-1 text-slate-700">
        Predictions appear once participant data is linked to athlete profiles.
      </p>
    </div>
  );
}

function DistancePanel({ data }: { data: DistancePredictions }) {
  const [gender, setGender] = useState<"M" | "F">("M");

  const hasAnyLinked =
    data.overallMale ||
    data.overallFemale ||
    Object.values(data.categories).some((c) => c.ranked.length > 0);

  if (!hasAnyLinked) {
    return <NoPredictionsState />;
  }

  const sortedCats = Object.entries(data.categories)
    .filter(
      ([cat, c]) =>
        (c.ranked.length > 0 || c.newcomers > 0) &&
        isFemaleCategory(cat) === (gender === "F"),
    )
    .sort(([catA], [catB]) => {
      const [groupA, subA] = categorySortKey(catA);
      const [groupB, subB] = categorySortKey(catB);
      return groupA !== groupB ? groupA - groupB : subA - subB;
    });

  return (
    <div className="space-y-6">
      {/* Overall section */}
      {(data.overallMale || data.overallFemale) && (
        <div>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest shrink-0">
              Overall Favorites
            </span>
            <div className="flex-1 h-[1px] bg-white/[0.06]" />
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            {data.overallMale && (
              <OverallCard pred={data.overallMale} label="Male" />
            )}
            {data.overallFemale && (
              <OverallCard pred={data.overallFemale} label="Female" />
            )}
          </div>
        </div>
      )}

      {/* Per-category sections */}
      {Object.values(data.categories).some(
        (c) => c.ranked.length > 0 || c.newcomers > 0,
      ) && (
        <div>
          <div className="flex items-center justify-between mb-3 gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest shrink-0">
                By Category
              </span>
              <div className="flex-1 h-[1px] bg-white/[0.06]" />
            </div>
            <GenderToggle
              value={gender}
              onChange={(v) => setGender(v as "M" | "F")}
            />
          </div>
          {sortedCats.length > 0 ? (
            <div className="rounded-2xl border border-white/[0.07] bg-[#0c1628] overflow-hidden">
              {sortedCats.map(([cat, catPreds]) => (
                <CategorySection key={cat} category={cat} preds={catPreds} />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-600 text-sm">
              No {gender === "F" ? "female" : "male"} categories for this
              distance.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function PredictionsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [predictions, setPredictions] = useState<Record<
    string,
    DistancePredictions
  > | null>(null);
  const [event, setEvent] = useState<StoredEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("");
  const [hasTabOverflow, setHasTabOverflow] = useState(false);
  const tabListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) {
      return;
    }

    setLoading(true);
    Promise.all([api.getEvents(), api.getPredictions(Number(id))])
      .then(([events, preds]) => {
        const found = events.find((e) => e.id === Number(id));
        if (!found) {
          throw new Error("Event not found");
        }

        setEvent(found);
        setPredictions(preds);
        const tabs = DISTANCES.filter((d) => d in preds).concat(
          Object.keys(preds).filter((d) => !DISTANCES.includes(d)),
        );
        setActiveTab(tabs[0] ?? "");
      })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [id, navigate]);

  useEffect(() => {
    const el = tabListRef.current;
    if (!el) {
      return;
    }

    const check = () => setHasTabOverflow(el.scrollWidth > el.clientWidth);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [predictions]);

  if (loading) {
    return <Spinner />;
  }

  if (error) {
    return (
      <div className="text-center py-16 text-slate-500">
        <svg
          className="w-10 h-10 mx-auto mb-3 text-slate-700"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M13.49 5.48c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm-3.6 13.9 1-4.4 2.1 2v6h2v-7.5l-2.1-2 .6-3c1.3 1.5 3.3 2.5 5.5 2.5v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1l-5.2 2.2v4.7h2v-3.4l1.8-.7-1.6 8.1-4.9-1-.4 2 7 1.4z" />
        </svg>
        <p className="font-semibold text-slate-600">Predictions unavailable</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
    );
  }

  if (!predictions || !event) {
    return null;
  }

  const tabs = DISTANCES.filter((d) => d in predictions).concat(
    Object.keys(predictions).filter((d) => !DISTANCES.includes(d)),
  );

  if (tabs.length === 0) {
    return <NoPredictionsState />;
  }

  const isPast = new Date(event.date + "T12:00:00") < new Date();

  return (
    <div>
      <Link
        to={`/event/${id}`}
        className="text-sm text-slate-500 hover:text-slate-300 transition-colors mb-4 inline-flex items-center gap-1"
      >
        ← Back to event
      </Link>

      {/* Hero */}
      <div className="relative bg-[#0c1628] rounded-2xl px-6 py-6 mb-6 text-white overflow-hidden border border-white/[0.07]">
        <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-amber-400/0 via-amber-400/60 to-amber-400/0" />
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="text-[10px] font-bold text-amber-400/80 uppercase tracking-widest">
            Pre-Race Predictions
          </div>
          <Link
            to={`/event/${id}/predictions/info`}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors shrink-0"
          >
            How it works ↗
          </Link>
        </div>
        <h2 className="font-display font-bold text-2xl sm:text-4xl text-white leading-tight tracking-wide uppercase">
          {event.name}
        </h2>
        <p className="text-sm text-slate-500 mt-2">
          Favorites based on distance-weighted career ranking points
        </p>

        {(event.officialUrl || (isPast && event.resultsUrl)) && (
          <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-white/[0.06]">
            {event.officialUrl && (
              <a
                href={event.officialUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 border border-white/[0.1] hover:text-white hover:border-white/25 transition-colors"
              >
                <ShieldCheckIcon />
                <span className="sm:hidden">Page ↗</span>
                <span className="hidden sm:inline">Official Page ↗</span>
              </a>
            )}
            {isPast && event.resultsUrl && (
              <a
                href={event.resultsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 border border-white/[0.1] hover:text-white hover:border-white/25 transition-colors"
              >
                <ShieldCheckIcon />
                <span className="sm:hidden">Results ↗</span>
                <span className="hidden sm:inline">Official Results ↗</span>
              </a>
            )}
          </div>
        )}
      </div>

      {/* Distance tabs */}
      {tabs.length > 1 && (
        <div className="relative mb-6">
          <div
            ref={tabListRef}
            role="tablist"
            aria-label="Distance"
            className="flex gap-1 border-b border-white/[0.06] overflow-x-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none]"
          >
            {tabs.map((dist) => (
              <button
                key={dist}
                role="tab"
                aria-selected={activeTab === dist}
                onClick={() => setActiveTab(dist)}
                className={`flex-1 min-w-max px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors -mb-px whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60 ${
                  activeTab === dist
                    ? "bg-[#0c1628] border border-white/[0.1] border-b-[#060d1a] text-white"
                    : "text-slate-600 hover:text-slate-300"
                }`}
              >
                {dist}
              </button>
            ))}
          </div>
          {hasTabOverflow && (
            <div className="absolute right-0 top-0 bottom-[1px] w-10 bg-gradient-to-l from-[#060d1a] to-transparent pointer-events-none" />
          )}
        </div>
      )}

      {activeTab && predictions[activeTab] && (
        <DistancePanel data={predictions[activeTab]!} />
      )}
    </div>
  );
}
