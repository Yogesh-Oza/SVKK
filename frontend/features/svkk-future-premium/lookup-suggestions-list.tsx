import type { LookupSuggestion } from "./policy-lookup-suggestions";

type LookupSuggestionsListProps = {
  suggestions: LookupSuggestion[];
  busy: boolean;
  activeIndex: number;
  onSelect: (suggestion: LookupSuggestion) => void;
  /** Show panel while user has typed a searchable query (even when empty). */
  open: boolean;
};

export function LookupSuggestionsList({
  suggestions,
  busy,
  activeIndex,
  onSelect,
  open,
}: LookupSuggestionsListProps) {
  if (!open) return null;

  return (
    <div className="rounded-md border">
      <div className="bg-muted/50 px-3 py-2 text-xs font-medium">
        {busy ? "Searching..." : "Suggestions"}
      </div>
      {suggestions.length ? (
        <div className="scrollbar-none max-h-56 overflow-auto p-2">
          <div className="grid gap-2">
            {suggestions.map((s, index) => (
              <button
                key={s.key}
                type="button"
                className={`hover:bg-muted flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-2 text-left text-sm ${
                  activeIndex === index ? "bg-muted border-primary" : ""
                }`}
                onClick={() => onSelect(s)}
              >
                <span>
                  <span className="font-medium">{s.holderName}</span>
                  <span className="text-muted-foreground ml-2">{s.svkkId}</span>
                  {s.policyNo !== "—" ? (
                    <span className="text-muted-foreground ml-2">{s.policyNo}</span>
                  ) : null}
                </span>
                <span className="text-muted-foreground text-xs">
                  {s.customerId !== "—" ? s.customerId : ""}
                  {s.yearLabel !== "—" ? ` · ${s.yearLabel}` : ""}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : busy ? (
        <p className="text-muted-foreground px-3 py-2 text-sm">Searching...</p>
      ) : (
        <p className="text-muted-foreground px-3 py-2 text-sm">No matching policies.</p>
      )}
    </div>
  );
}
