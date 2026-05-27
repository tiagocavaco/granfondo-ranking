import { useEffect, useRef, useState } from "react";

type Props<T> = {
  value: string;
  onChange: (value: string) => void;
  onSelect: (item: T) => void;
  search: (query: string) => Promise<T[]>;
  itemKey: (item: T) => string;
  renderItem: (item: T) => React.ReactNode;
  placeholder?: string;
  className?: string;
};

const DEBOUNCE_MS = 200;

export default function Combobox<T>({
  value,
  onChange,
  onSelect,
  search,
  itemKey,
  renderItem,
  placeholder,
  className,
}: Props<T>) {
  const [results, setResults] = useState<T[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (value.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    timerRef.current = setTimeout(() => {
      search(value)
        .then((items) => {
          setResults(items);
          setOpen(items.length > 0);
          setActiveIndex(-1);
        })
        .catch(() => {
          setResults([]);
          setOpen(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, search]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleKeyDown(event: React.KeyboardEvent) {
    if (!open) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, -1));
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      const item = results[activeIndex];
      if (item) {
        onSelect(item);
        setOpen(false);
      }
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder={placeholder}
        className={
          className ??
          "w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        }
        autoComplete="off"
      />
      {open && (
        <ul className="absolute z-50 left-0 right-0 top-full mt-0.5 bg-white border border-gray-200 rounded shadow-lg max-h-52 overflow-y-auto text-sm">
          {results.map((item, idx) => (
            <li
              key={itemKey(item)}
              onMouseDown={(event) => {
                event.preventDefault();
                onSelect(item);
                setOpen(false);
              }}
              className={`px-3 py-1.5 cursor-pointer ${
                idx === activeIndex
                  ? "bg-blue-50 text-blue-900"
                  : "hover:bg-gray-50"
              }`}
            >
              {renderItem(item)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
