import { useMemo, useCallback, useRef } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  type ColDef,
  type CellValueChangedEvent,
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
} from "ag-grid-community";

// Register AG Grid modules (idempotent)
ModuleRegistry.registerModules([AllCommunityModule]);

const darkTheme = themeQuartz.withParams({
  backgroundColor: "#1a1a19",
  foregroundColor: "#faf9f5",
  headerBackgroundColor: "#1c1b1a",
  borderColor: "#2a2926",
  rowHoverColor: "#ffffff10",
});

interface CsvEditorProps {
  content: string;
  onChange: (value: string) => void;
}

export function CsvEditor({ content, onChange }: CsvEditorProps) {
  const gridRef = useRef<AgGridReact>(null);

  const { columnDefs, rowData } = useMemo(() => {
    const lines = content.split("\n").filter((l) => l.trim());
    if (lines.length === 0) return { columnDefs: [], rowData: [] };

    const headers = parseCSVLine(lines[0]);
    const colDefs: ColDef[] = headers.map((h) => ({
      field: h,
      editable: true,
      sortable: true,
      filter: true,
      resizable: true,
    }));

    const rows = lines.slice(1).map((line, idx) => {
      const values = parseCSVLine(line);
      const row: Record<string, string> = { __rowIndex: String(idx) };
      headers.forEach((h, i) => (row[h] = values[i] || ""));
      return row;
    });

    return { columnDefs: colDefs, rowData: rows };
  }, [content]);

  const handleCellChange = useCallback(
    (event: CellValueChangedEvent) => {
      // Reconstruct CSV from grid data
      const allRows: Record<string, string>[] = [];
      event.api.forEachNode((node) => {
        if (node.data) allRows.push(node.data);
      });

      const headers = columnDefs.map((c) => c.field!);
      const lines = [
        headers.join(","),
        ...allRows.map((row) =>
          headers.map((h) => escapeCSV(row[h] || "")).join(","),
        ),
      ];
      onChange(lines.join("\n"));
    },
    [columnDefs, onChange],
  );

  return (
    <div style={{ height: "100%", width: "100%" }}>
      <AgGridReact
        ref={gridRef}
        theme={darkTheme}
        columnDefs={columnDefs}
        rowData={rowData}
        onCellValueChanged={handleCellChange}
        getRowId={(params) => params.data.__rowIndex}
        defaultColDef={{
          flex: 1,
          minWidth: 80,
        }}
      />
    </div>
  );
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
