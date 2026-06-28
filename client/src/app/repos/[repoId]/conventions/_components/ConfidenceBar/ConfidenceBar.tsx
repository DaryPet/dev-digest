"use client";

import { s } from "../../styles";
import { CONFIDENCE_AMBER, CONFIDENCE_GREEN, CONFIDENCE_GREEN_THRESHOLD } from "../../constants";

/** Presentational confidence bar: green ≥ 0.8, amber otherwise (spec §4 / mock). */
export function ConfidenceBar({ value, label }: { value: number; label: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  const color = value >= CONFIDENCE_GREEN_THRESHOLD ? CONFIDENCE_GREEN : CONFIDENCE_AMBER;
  return (
    <div style={s.confWrap}>
      <span style={s.confLabel}>{label}</span>
      <div style={s.confTrack} role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div style={s.confFill(pct, color)} />
      </div>
      <span style={s.confPct}>{pct}%</span>
    </div>
  );
}
