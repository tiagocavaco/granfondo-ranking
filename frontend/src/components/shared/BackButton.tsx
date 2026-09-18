import { useNavigate } from "react-router-dom";

const CLASS =
  "text-sm text-slate-500 hover:text-slate-300 transition-colors mb-4 inline-flex items-center gap-1";

export function BackButton({ label = "Back" }: { label?: string }) {
  const navigate = useNavigate();
  return (
    <button onClick={() => navigate(-1)} className={CLASS}>
      ← {label}
    </button>
  );
}
