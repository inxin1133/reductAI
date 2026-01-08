import { cn } from "@/lib/utils"

export type BlockTableProps = {
  headers: string[]
  rows: string[][]
  className?: string
}

export function BlockTable({ headers, rows, className }: BlockTableProps) {
  return (
    <div className={cn("w-full overflow-x-auto rounded-md border", className)}>
      <table className="w-full text-sm">
        <thead className="bg-muted/40">
          <tr>
            {(headers || []).map((h, idx) => (
              <th key={idx} className="px-3 py-2 text-left font-medium border-b">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(rows || []).map((r, rIdx) => (
            <tr key={rIdx} className="odd:bg-background even:bg-muted/10">
              {r.map((cell, cIdx) => (
                <td key={cIdx} className="px-3 py-2 border-b align-top whitespace-pre-wrap">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}


