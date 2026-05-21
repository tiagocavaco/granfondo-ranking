import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "../api";
import type { DistancePredictions, FavoritePrediction } from "../api";
import { DISTANCES } from "@granfondo/utils/distance";
import { Spinner } from "./EventList";
import { distBadgeClass } from "../utils/distance";
import { countryFlag } from "@granfondo/database/normalize";
import { isFemaleCategory, categorySortKey } from "@granfondo/utils/category";

const COLLAPSED_COUNT = 3;

function rankBadge(rank: number) {
  if (rank === 1) {
    return "bg-amber-400 text-white";
  }

  if (rank === 2) {
    return "bg-slate-400 text-white";
  }

  if (rank === 3) {
    return "bg-amber-700/80 text-white";
  }

  return "bg-slate-100 text-slate-500";
}

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
      className="flex items-center gap-3 py-3 px-4 border-b border-slate-100 last:border-0 hover:bg-blue-50/40 transition-colors group"
    >
      <div
        className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${rankBadge(rank)}`}
      >
        {rank}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          {flag && (
            <span className="text-base leading-none shrink-0">{flag}</span>
          )}
          <span className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors truncate">
            {pred.name}
          </span>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap min-w-0">
          {pred.team && (
            <span className="text-xs text-slate-400 truncate max-w-[160px] sm:max-w-xs">
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
          <div className="text-xs font-semibold text-slate-600">
            {Math.round(pred.weightedScore)} pts
          </div>
        )}
        {pred.raceCount > 0 && (
          <div className="text-[10px] text-slate-400">
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
  icon,
}: {
  pred: FavoritePrediction;
  label: string;
  icon: string;
}) {
  const crossDistance =
    pred.mainDistance && pred.mainDistance !== pred.distance;
  const flag = countryFlag(pred.country);

  return (
    <Link
      to={`/athlete/${pred.athleteId}`}
      className="flex-1 bg-gradient-to-br from-white to-slate-50 rounded-2xl border border-slate-200 shadow-sm p-4 hover:shadow-md hover:border-blue-200 transition-all group"
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">{icon}</span>
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
          {label} Favorite
        </span>
      </div>
      <div className="flex items-center gap-2 mb-1">
        {flag && <span className="text-lg leading-none shrink-0">{flag}</span>}
        <span className="font-extrabold text-slate-900 group-hover:text-blue-600 transition-colors text-base leading-tight truncate">
          {pred.name}
        </span>
      </div>
      {pred.team && (
        <div className="text-xs text-slate-500 truncate mb-2">{pred.team}</div>
      )}
      <div className="flex items-center gap-1.5 flex-wrap">
        {crossDistance && (
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${distBadgeClass(pred.mainDistance!)}`}
          >
            Mainly {pred.mainDistance}
          </span>
        )}
        {pred.weightedScore > 0 && (
          <span className="text-[11px] text-slate-400 font-medium">
            {Math.round(pred.weightedScore)} pts
          </span>
        )}
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
    <div className="border-b border-slate-100 last:border-0">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-100">
        <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
          {category}
        </span>
        {preds.newcomers > 0 && preds.ranked.length > 0 && (
          <span className="shrink-0 text-[11px] text-slate-400">
            +{preds.newcomers} unranked
          </span>
        )}
      </div>
      {preds.ranked.length === 0 ? (
        <div className="px-4 py-3 text-xs text-slate-400 italic">
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
              className="w-full px-4 py-2.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 transition-colors text-center border-t border-slate-100"
            >
              {expanded ? "Show less ↑" : `Show ${hiddenCount} more ↓`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function GenderToggle({
  value,
  onChange,
}: {
  value: "M" | "F";
  onChange: (v: "M" | "F") => void;
}) {
  return (
    <div className="flex rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm shrink-0">
      {(
        [
          { v: "M", label: "Men" },
          { v: "F", label: "Women" },
        ] as const
      ).map(({ v, label }) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`px-3 py-1.5 text-sm font-semibold transition-all ${
            value === v
              ? v === "M"
                ? "bg-blue-600 text-white"
                : "bg-pink-500 text-white"
              : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          <span className="sm:hidden">{v}</span>
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
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
    return (
      <div className="text-center py-16 text-slate-400">
        <p className="text-4xl mb-3">🔗</p>
        <p className="font-semibold text-slate-600">
          No predictions available yet
        </p>
        <p className="text-sm mt-1">
          Predictions will appear once participant data is linked to athlete
          profiles.
        </p>
      </div>
    );
  }

  const sortedCats = Object.entries(data.categories)
    .filter(
      ([cat, c]) =>
        (c.ranked.length > 0 || c.newcomers > 0) &&
        isFemaleCategory(cat) === (gender === "F"),
    )
    .sort(([a], [b]) => {
      const [ai, aa] = categorySortKey(a);
      const [bi, ba] = categorySortKey(b);
      return ai !== bi ? ai - bi : aa - ba;
    });

  return (
    <div className="space-y-6">
      {/* Overall section */}
      {(data.overallMale || data.overallFemale) && (
        <div>
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <span>🏆</span> Overall Favorites
          </h3>
          <div className="flex flex-col sm:flex-row gap-3">
            {data.overallMale && (
              <OverallCard pred={data.overallMale} label="Male" icon="♂" />
            )}
            {data.overallFemale && (
              <OverallCard pred={data.overallFemale} label="Female" icon="♀" />
            )}
          </div>
        </div>
      )}

      {/* Per-category sections */}
      {Object.values(data.categories).some(
        (c) => c.ranked.length > 0 || c.newcomers > 0,
      ) && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <span>📋</span> By Category
            </h3>
            <GenderToggle value={gender} onChange={setGender} />
          </div>
          {sortedCats.length > 0 ? (
            <div className="rounded-2xl border border-slate-200 shadow-sm bg-white overflow-hidden">
              {sortedCats.map(([cat, preds]) => (
                <CategorySection key={cat} category={cat} preds={preds} />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-400 text-sm">
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
  const [eventName, setEventName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("");

  useEffect(() => {
    if (!id) {
      return;
    }

    setLoading(true);
    Promise.all([api.getEvents(), api.getPredictions(Number(id))])
      .then(([events, preds]) => {
        const event = events.find((e) => e.id === Number(id));
        if (!event) {
          throw new Error("Event not found");
        }

        if (event.hasResults) {
          navigate(`/event/${id}`, { replace: true });
          return;
        }

        setEventName(event.name);
        setPredictions(preds);
        const tabs = DISTANCES.filter((d) => d in preds).concat(
          Object.keys(preds).filter((d) => !DISTANCES.includes(d)),
        );
        setActiveTab(tabs[0] ?? "");
      })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [id, navigate]);

  if (loading) {
    return <Spinner />;
  }

  if (error) {
    return (
      <div className="text-center py-16 text-slate-400">
        <p className="text-5xl mb-3">🚴</p>
        <p className="font-semibold text-slate-600">Predictions unavailable</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
    );
  }

  if (!predictions) {
    return null;
  }

  const tabs = DISTANCES.filter((d) => d in predictions).concat(
    Object.keys(predictions).filter((d) => !DISTANCES.includes(d)),
  );

  if (tabs.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400">
        <p className="text-4xl mb-3">🔗</p>
        <p className="font-semibold text-slate-600">
          No predictions available yet
        </p>
        <p className="text-sm mt-1">
          Predictions will appear once participant data is linked to athlete
          profiles.
        </p>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => navigate(`/event/${id}`)}
        className="text-sm text-slate-400 hover:text-slate-600 transition-colors mb-4 inline-flex items-center gap-1"
      >
        ← Back to event
      </button>

      {/* Hero */}
      <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-900 rounded-2xl px-5 py-5 mb-6 text-white">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="text-xs font-semibold text-blue-300 uppercase tracking-widest">
            Predictions
          </div>
          <Link
            to="/predictions-info"
            className="text-xs text-blue-300/70 hover:text-blue-200 transition-colors"
          >
            How it works ↗
          </Link>
        </div>
        <h2 className="text-xl font-extrabold text-white leading-tight mb-1">
          {eventName}
        </h2>
        <p className="text-sm text-blue-200/80">
          Favorites based on distance-weighted career ranking points
        </p>
      </div>

      {/* Distance tabs */}
      {tabs.length > 1 && (
        <div className="flex gap-1 mb-6 border-b border-slate-200 overflow-x-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
          {tabs.map((dist) => (
            <button
              key={dist}
              onClick={() => setActiveTab(dist)}
              className={`shrink-0 px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors -mb-px whitespace-nowrap ${
                activeTab === dist
                  ? "bg-white border border-slate-200 border-b-white text-slate-900"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {dist}
            </button>
          ))}
        </div>
      )}

      {activeTab && predictions[activeTab] && (
        <DistancePanel data={predictions[activeTab]!} />
      )}
    </div>
  );
}
