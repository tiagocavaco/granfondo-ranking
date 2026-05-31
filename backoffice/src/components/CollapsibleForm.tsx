import { useState } from "react";

type Props = {
  buttonLabel: string;
  title: string;
  submitLabel: string;
  onSubmit: () => Promise<void>;
  children: React.ReactNode;
};

export default function CollapsibleForm({
  buttonLabel,
  title,
  submitLabel,
  onSubmit,
  children,
}: Props) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 rounded-md bg-gray-900 text-white text-sm font-medium hover:bg-gray-700"
      >
        {buttonLabel}
      </button>
    );
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-3 text-sm"
    >
      <p className="font-medium text-gray-700">{title}</p>
      {children}
      {error && (
        <p className="text-xs text-red-600 font-mono whitespace-pre-wrap">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="px-3 py-1.5 rounded bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 disabled:opacity-50"
        >
          {submitting ? "Saving…" : submitLabel}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="px-3 py-1.5 rounded border border-gray-300 text-sm text-gray-600 hover:bg-gray-100"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
