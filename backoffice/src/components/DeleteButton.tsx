import { useState } from "react";

type Props = {
  onDelete: () => Promise<void>;
  label?: string;
};

export default function DeleteButton({ onDelete, label = "Delete" }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (error) {
    return (
      <span className="text-xs text-red-500" title={error}>
        Error
      </span>
    );
  }

  if (confirming) {
    return (
      <span className="flex items-center gap-1 text-xs">
        <button
          onClick={async () => {
            setDeleting(true);
            try {
              await onDelete();
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
              setConfirming(false);
            } finally {
              setDeleting(false);
            }
          }}
          disabled={deleting}
          className="text-red-600 font-medium hover:underline disabled:opacity-50"
        >
          {deleting ? "Deleting…" : "Confirm"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="text-gray-400 hover:underline"
        >
          Cancel
        </button>
      </span>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="text-xs text-gray-500 hover:text-red-600 transition-colors"
    >
      {label}
    </button>
  );
}
