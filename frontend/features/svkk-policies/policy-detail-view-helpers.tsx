import { Fragment, type ReactNode } from "react";

/** Top-level view section (matches edit form Card sections). */
export function ViewSectionBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-border/80 mt-10 border-b pb-8 first:mt-0 last:border-b-0 last:pb-2">
      <h4 className="text-foreground mb-4 text-base font-semibold tracking-wide">{title}</h4>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

/** Nested subsection tile (matches edit form `rounded-lg border bg-muted/25` blocks). */
export function ViewSubsection({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="bg-muted/25 border-border rounded-lg border p-4 shadow-sm">
      {title ? <p className="text-foreground mb-3 text-sm font-semibold">{title}</p> : null}
      {children}
    </div>
  );
}

export const VIEW_TH_CLASS =
  "border border-border bg-muted px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-foreground";
export const VIEW_TD_CLASS = "border border-border px-2 py-2 align-top text-sm";

const EMPTY = "—";

export function displayVal(v: unknown): string {
  if (v == null || v === "") return EMPTY;
  if (typeof v === "string" || typeof v === "number") {
    const s = String(v).trim();
    return s || EMPTY;
  }
  if (typeof v === "object" && v !== null && "toString" in v) {
    const s = (v as { toString: () => string }).toString().trim();
    return s || EMPTY;
  }
  return String(v);
}

export function genderLabel(g: string | null | undefined): string {
  if (!g?.trim()) return EMPTY;
  const u = g.trim().toUpperCase();
  if (u === "M" || u === "MALE") return "Male";
  if (u === "F" || u === "FEMALE") return "Female";
  if (u === "O" || u === "OTHER") return "Other";
  return g.trim();
}

export function yesNoLabel(v: string | boolean | null | undefined): string {
  if (v === true) return "YES";
  if (v === false) return "NO";
  if (v == null || v === "") return EMPTY;
  return String(v);
}

type FieldCell = { label: string; value: ReactNode };

/** Bordered table: label header row + value row, chunked by `cols` columns per row. */
export function ViewFieldTable({
  fields,
  cols = 5,
  minWidth = "640px",
}: {
  fields: FieldCell[];
  cols?: number;
  minWidth?: string;
}) {
  const chunks: FieldCell[][] = [];
  for (let i = 0; i < fields.length; i += cols) {
    chunks.push(fields.slice(i, i + cols));
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm" style={{ minWidth }}>
        <tbody>
          {chunks.map((chunk, chunkIdx) => (
            <Fragment key={chunkIdx}>
              <tr>
                {chunk.map((f) => (
                  <th key={f.label} className={VIEW_TH_CLASS}>
                    {f.label}
                  </th>
                ))}
              </tr>
              <tr>
                {chunk.map((f) => (
                  <td key={f.label} className={VIEW_TD_CLASS}>
                    {f.value ?? EMPTY}
                  </td>
                ))}
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
