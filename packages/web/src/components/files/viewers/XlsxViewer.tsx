import { useMemo, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  type ColDef,
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
} from "ag-grid-community";

ModuleRegistry.registerModules([AllCommunityModule]);

const darkTheme = themeQuartz.withParams({
  backgroundColor: "#1a1a19",
  foregroundColor: "#faf9f5",
  headerBackgroundColor: "#1c1b1a",
  borderColor: "#2a2926",
  rowHoverColor: "#ffffff10",
  fontSize: "12px",
  headerFontSize: "12px",
});

interface Sheet {
  name: string;
  headers: string[];
  rows: Record<string, string>[];
  totalRows: number;
}

interface XlsxViewerProps {
  content: string;
}

export function XlsxViewer({ content }: XlsxViewerProps) {
  const sheets = useMemo<Sheet[]>(() => {
    try {
      return JSON.parse(content).sheets ?? [];
    } catch {
      return [];
    }
  }, [content]);

  const [activeSheet, setActiveSheet] = useState(0);

  const sheet = sheets[activeSheet];
  if (!sheet) {
    return <div className="p-4 text-sm text-foreground-secondary">No data</div>;
  }

  const columnDefs: ColDef[] = sheet.headers.map((h) => ({
    field: h,
    sortable: true,
    filter: true,
    resizable: true,
  }));

  const rowData = sheet.rows.map((row, idx) => ({ ...row, __rowIndex: String(idx) }));

  return (
    <div className="flex flex-col h-full">
      {sheets.length > 1 && (
        <div className="flex gap-0 border-b border-border overflow-x-auto shrink-0">
          {sheets.map((s, i) => (
            <button
              key={s.name}
              onClick={() => setActiveSheet(i)}
              className={`px-3 py-1.5 text-xs whitespace-nowrap border-b-2 transition-colors ${
                i === activeSheet
                  ? "border-primary text-foreground font-medium"
                  : "border-transparent text-foreground-secondary hover:text-foreground"
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      {sheet.totalRows > sheet.rows.length && (
        <div className="px-3 py-1 text-[10px] text-foreground-tertiary border-b border-border shrink-0">
          Showing {sheet.rows.length} of {sheet.totalRows} rows
        </div>
      )}
      <div className="flex-1">
        <AgGridReact
          key={activeSheet}
          theme={darkTheme}
          columnDefs={columnDefs}
          rowData={rowData}
          getRowId={(params) => params.data.__rowIndex}
          autoSizeStrategy={{ type: "fitCellContents" }}
          defaultColDef={{ minWidth: 60 }}
        />
      </div>
    </div>
  );
}
