interface Props {
  open: boolean;
  analyzing: boolean;
  engineName: string;
  onClose: () => void;
  onAction: (id: string) => void;
}

export function MoreMenu({ open, analyzing, engineName, onClose, onAction }: Props) {
  if (!open) return null;
  const items: Array<{ id: string; label: string; keepOpen?: boolean }> = [
    { id: "new", label: "New Game" },
    { id: "flip", label: "Flip Board" },
    { id: "takeback", label: "Takeback" },
    { id: "copy", label: "Copy PGN" },
    { id: "import", label: "Import PGN" },
    { id: "save", label: "Save Game" },
    { id: "games", label: "Game List" },
    { id: "options", label: "Options" },
    { id: "engine", label: `Engine: ${engineName} ›`, keepOpen: true },
    { id: "analyze", label: analyzing ? "Stop analysis" : "Analyze" },
    { id: "blunder", label: "Blunder check" },
  ];
  return (
    <div className="sheet-backdrop" onClick={onClose} role="presentation">
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="menu">
        <div className="sheet-group">
          {items.map((it) => (
            <button
              key={it.id}
              type="button"
              className="sheet-item"
              onClick={() => {
                onAction(it.id);
                if (!it.keepOpen) onClose();
              }}
            >
              {it.label}
            </button>
          ))}
        </div>
        <button type="button" className="sheet-item cancel" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
