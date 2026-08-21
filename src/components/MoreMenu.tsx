interface Props {
  open: boolean;
  analyzing: boolean;
  onClose: () => void;
  onAction: (id: string) => void;
}

const ITEMS: Array<{ id: string; label: string; danger?: boolean }> = [
  { id: "new", label: "New Game" },
  { id: "flip", label: "Flip Board" },
  { id: "takeback", label: "Takeback" },
  { id: "copy", label: "Copy PGN" },
  { id: "import", label: "Import PGN" },
  { id: "save", label: "Save Game" },
  { id: "games", label: "Game List" },
  { id: "options", label: "Options" },
  { id: "analyze", label: "Analyze" },
  { id: "blunder", label: "Blunder check" },
];

export function MoreMenu({ open, analyzing, onClose, onAction }: Props) {
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose} role="presentation">
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="menu">
        <div className="sheet-group">
          {ITEMS.map((it) => (
            <button
              key={it.id}
              type="button"
              className="sheet-item"
              onClick={() => {
                onAction(it.id);
                onClose();
              }}
            >
              {it.id === "analyze" ? (analyzing ? "Stop analysis" : "Analyze") : it.label}
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
