type Props = {
  error?: string | null;
};

export default function LoadingState({ error }: Props) {
  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-md bg-red-50 border border-red-200 p-4">
          <p className="text-sm text-red-800 font-medium">Error</p>
          <p className="text-sm text-red-700 mt-1">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 flex items-center gap-2 text-gray-500 text-sm">
      <svg
        className="animate-spin h-4 w-4"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
      Loading…
    </div>
  );
}
