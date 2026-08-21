export function GameOverBanner({ text }: { text: string | null }) {
  if (!text) return null;
  return <div className="game-over">{text}</div>;
}

export function ImportPgn({
  open,
  value,
  onChange,
  onClose,
  onImport,
}: {
  open: boolean;
  value: string;
  onChange: (v: string) => void;
  onClose: () => void;
  onImport: () => void;
}) {
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose} role="presentation">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Import PGN</div>
        <textarea
          className="pgn-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Paste PGN here…"
          rows={8}
        />
        <div className="modal-actions">
          <label className="file-link">
            Choose file
            <input
              type="file"
              accept=".pgn,text/plain"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                void f.text().then(onChange);
              }}
            />
          </label>
          <div className="spacer" />
          <button type="button" className="text-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="text-btn primary" onClick={onImport}>
            Import
          </button>
        </div>
      </div>
    </div>
  );
}

export function Toast({ text }: { text: string | null }) {
  if (!text) return null;
  return <div className="toast">{text}</div>;
}
