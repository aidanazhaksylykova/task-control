export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="progress-row">
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
      <span className="pct">{value}%</span>
    </div>
  );
}
