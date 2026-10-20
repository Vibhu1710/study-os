"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import {
  formatTime12,
  joinTime12,
  splitTime12,
  type Time12Parts,
} from "@/lib/rhythm/effective-minutes";

type FocusField = "hour" | "minute" | null;

function clampParts(p: Time12Parts): Time12Parts {
  const hour12 = Math.min(12, Math.max(1, Math.round(p.hour12) || 12));
  const minute = Math.min(59, Math.max(0, Math.round(p.minute) || 0));
  return { hour12, minute, pm: p.pm };
}

export function nowHhmm(): string {
  const d = new Date();
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

function svgCoord(n: number) {
  return Math.round(n * 100) / 100;
}

function AnalogFace({
  parts,
  focus,
  size = 168,
  onPickHour,
  onPickMinute,
}: {
  parts: Time12Parts;
  focus: FocusField;
  size?: number;
  onPickHour: (h12: number) => void;
  onPickMinute: (m: number) => void;
}) {
  const m = parts.minute;
  const h12mod = parts.hour12 % 12;
  /** When picking, snap the active hand to the tick — not blended with the other unit. */
  const hourAngle =
    focus === "hour" ? h12mod * 30 : (h12mod + m / 60) * 30;
  const minuteAngle = m * 6;
  const r = size / 2 - 8;
  const cx = size / 2;
  const cy = size / 2;

  function pointerToClockDegrees(svg: SVGSVGElement, clientX: number, clientY: number) {
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    const local = ctm ? pt.matrixTransform(ctm.inverse()) : pt;
    const dx = local.x - cx;
    const dy = local.y - cy;
    let deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
    deg = ((deg % 360) + 360) % 360;
    return deg;
  }

  function handlePointer(e: React.PointerEvent<SVGSVGElement>) {
    const svg = e.currentTarget;
    const deg = pointerToClockDegrees(svg, e.clientX, e.clientY);
    if (focus === "minute") {
      const minute = Math.round(deg / 6) % 60;
      onPickMinute(minute);
    } else {
      const slot = Math.round(deg / 30) % 12;
      onPickHour(slot === 0 ? 12 : slot);
    }
  }

  return (
    <svg
      width={size}
      height={size}
      className="touch-none select-none cursor-pointer"
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        handlePointer(e);
      }}
      onPointerMove={(e) => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
        handlePointer(e);
      }}
    >
      <circle cx={cx} cy={cy} r={r} fill="var(--bg-muted)" stroke="var(--border)" strokeWidth={1.5} />
      {Array.from({ length: 12 }).map((_, i) => {
        const a = ((i * 30 - 90) * Math.PI) / 180;
        const major = i % 3 === 0;
        const x1 = svgCoord(cx + Math.cos(a) * (r - (major ? 10 : 6)));
        const y1 = svgCoord(cy + Math.sin(a) * (r - (major ? 10 : 6)));
        const x2 = svgCoord(cx + Math.cos(a) * (r - 2));
        const y2 = svgCoord(cy + Math.sin(a) * (r - 2));
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="var(--text-muted)"
            strokeWidth={major ? 1.75 : 1}
            opacity={major ? 0.95 : 0.55}
          />
        );
      })}
      {focus === "hour" &&
        [12, 3, 6, 9].map((label, idx) => {
          const i = idx === 0 ? 0 : idx * 3;
          const a = ((i * 30 - 90) * Math.PI) / 180;
          const tx = svgCoord(cx + Math.cos(a) * (r - 18));
          const ty = svgCoord(cy + Math.sin(a) * (r - 18));
          return (
            <text
              key={label}
              x={tx}
              y={ty + 3}
              textAnchor="middle"
              fill="var(--text)"
              fontSize={11}
              fontFamily="ui-monospace, monospace"
              fontWeight={600}
            >
              {label}
            </text>
          );
        })}
      {focus === "minute" &&
        [0, 15, 30, 45].map((label, idx) => {
          const i = idx * 3;
          const a = ((i * 30 - 90) * Math.PI) / 180;
          const tx = svgCoord(cx + Math.cos(a) * (r - 18));
          const ty = svgCoord(cy + Math.sin(a) * (r - 18));
          return (
            <text
              key={label}
              x={tx}
              y={ty + 3}
              textAnchor="middle"
              fill="var(--text-muted)"
              fontSize={10}
              fontFamily="ui-monospace, monospace"
            >
              {label.toString().padStart(2, "0")}
            </text>
          );
        })}
      {focus === "minute" && (
        <circle
          cx={cx}
          cy={cy}
          r={r * 0.72}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={2.5}
          opacity={0.55}
        />
      )}
      {focus === "hour" && (
        <circle
          cx={cx}
          cy={cy}
          r={r * 0.48}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={2.5}
          opacity={0.55}
        />
      )}
      <line
        x1={cx}
        y1={cy}
        x2={svgCoord(cx + Math.cos(((hourAngle - 90) * Math.PI) / 180) * (r * 0.48))}
        y2={svgCoord(cy + Math.sin(((hourAngle - 90) * Math.PI) / 180) * (r * 0.48))}
        stroke="var(--text)"
        strokeWidth={focus === "hour" ? 3 : 2}
        strokeLinecap="round"
        opacity={focus === "minute" ? 0.4 : 1}
      />
      <line
        x1={cx}
        y1={cy}
        x2={svgCoord(cx + Math.cos(((minuteAngle - 90) * Math.PI) / 180) * (r * 0.72))}
        y2={svgCoord(cy + Math.sin(((minuteAngle - 90) * Math.PI) / 180) * (r * 0.72))}
        stroke="var(--accent)"
        strokeWidth={focus === "minute" ? 2.5 : 1.5}
        strokeLinecap="round"
        opacity={focus === "hour" ? 0.4 : 1}
      />
      <circle cx={cx} cy={cy} r={3.5} fill="var(--accent)" />
    </svg>
  );
}

const integerInputClass =
  "input w-11 py-1 text-center font-mono text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

export function RhythmMasterTimePanel({
  label,
  value,
  confirmed,
  placeholder,
  disabled,
  confirmDisabled,
  confirmHint,
  onChange,
  onConfirm,
}: {
  label: string;
  value: string;
  confirmed: boolean;
  placeholder?: boolean;
  disabled?: boolean;
  confirmDisabled?: boolean;
  confirmHint?: string;
  onChange: (hhmm: string) => void;
  onConfirm: () => void;
}) {
  const [parts, setParts] = useState(() => splitTime12(value));
  const [focus, setFocus] = useState<FocusField>(null);
  const [fieldText, setFieldText] = useState("");
  const [mounted, setMounted] = useState(false);
  const popoverId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const hourInputRef = useRef<HTMLInputElement>(null);
  const minuteInputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    setParts(splitTime12(value));
  }, [value]);

  useLayoutEffect(() => {
    if (!focus) {
      setPopoverPos(null);
      return;
    }
    const anchor = focus === "hour" ? hourInputRef.current : minuteInputRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const popW = 200;
    let left = rect.left + rect.width / 2 - popW / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - popW - 8));
    const top = rect.bottom + 8;
    setPopoverPos({ top, left });
  }, [focus, parts]);

  useEffect(() => {
    if (focus == null) return;
    const activeField = focus;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (popoverRef.current?.contains(t)) return;
      if (hourInputRef.current?.contains(t) || minuteInputRef.current?.contains(t)) return;
      commitFieldText(activeField);
      setFocus(null);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [focus, parts, fieldText]);

  function apply(next: Time12Parts) {
    const c = clampParts(next);
    setParts(c);
    onChange(joinTime12(c));
    if (focus === "hour") setFieldText(String(c.hour12));
    if (focus === "minute") setFieldText(String(c.minute));
  }

  function commitFieldText(field: FocusField) {
    if (field === "hour") {
      const raw = fieldText.replace(/\D/g, "");
      const n = raw === "" ? parts.hour12 : parseInt(raw, 10);
      apply({ ...parts, hour12: Number.isNaN(n) ? parts.hour12 : n });
    } else if (field === "minute") {
      const raw = fieldText.replace(/\D/g, "");
      const n = raw === "" ? parts.minute : parseInt(raw, 10);
      apply({ ...parts, minute: Number.isNaN(n) ? parts.minute : n });
    }
  }

  function openField(field: "hour" | "minute") {
    if (disabled) return;
    setFocus(field);
    const nextText =
      field === "hour" ? String(parts.hour12) : String(parts.minute);
    setFieldText(nextText);
    requestAnimationFrame(() => {
      const el = field === "hour" ? hourInputRef.current : minuteInputRef.current;
      el?.focus();
      el?.select();
    });
  }

  function onIntegerChange(field: "hour" | "minute", rawInput: string) {
    const raw = rawInput.replace(/\D/g, "").slice(0, 2);
    setFieldText(raw);
    if (raw === "") return;
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) return;
    if (field === "hour") {
      apply({ ...parts, hour12: n });
    } else {
      apply({ ...parts, minute: n });
    }
  }

  const popover =
    focus && !disabled && popoverPos && mounted ? (
      createPortal(
        <div
          ref={popoverRef}
          id={popoverId}
          role="dialog"
          aria-label={focus === "hour" ? "Set hour" : "Set minutes"}
          className="fixed z-[260] w-[12.5rem] rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3 shadow-xl shadow-black/50"
          style={{ top: popoverPos.top, left: popoverPos.left }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <p className="mb-2 text-center font-mono text-[9px] uppercase tracking-wide text-[var(--text-muted)]">
            {focus === "hour" ? "Set hour" : "Set minutes"}
          </p>
          <p className="mb-2 text-center text-[9px] leading-snug text-[var(--text-muted)]">
            Click the dial or type a number · click outside when done
          </p>
          <div className="flex justify-center">
            <AnalogFace
              parts={parts}
              focus={focus}
              onPickHour={(h12) => apply({ ...parts, hour12: h12 })}
              onPickMinute={(minute) => apply({ ...parts, minute })}
            />
          </div>
        </div>,
        document.body,
      )
    ) : null;

  const hourShown =
    focus === "hour" ? fieldText : String(parts.hour12);
  const minuteShown =
    focus === "minute" ? fieldText : parts.minute.toString().padStart(2, "0");

  return (
    <div
      ref={rootRef}
      className={cn(
        "card flex flex-1 flex-col items-center p-3",
        placeholder && !confirmed && "border-dashed opacity-90",
        disabled && "opacity-50",
      )}
    >
      <p className="font-mono text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </p>
      {!confirmed && (
        <span className="mt-1 rounded bg-[var(--accent-amber)]/15 px-1.5 py-0.5 font-mono text-[9px] text-[var(--accent-amber)]">
          {placeholder ? "Suggested · tap Set to confirm" : "Not confirmed"}
        </span>
      )}
      {confirmed && (
        <span className="mt-1 rounded bg-[var(--accent-green)]/15 px-1.5 py-0.5 font-mono text-[9px] text-[var(--accent-green)]">
          Set
        </span>
      )}

      <p className="mt-2 font-mono text-lg font-semibold">{formatTime12(value)}</p>

      <div className="mt-2 flex items-center gap-1">
        <input
          ref={hourInputRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          disabled={disabled}
          aria-label={`${label} hour`}
          aria-expanded={focus === "hour"}
          aria-controls={focus === "hour" ? popoverId : undefined}
          className={cn(
            integerInputClass,
            focus === "hour" && "ring-1 ring-[var(--accent)]",
          )}
          value={hourShown}
          onFocus={() => openField("hour")}
          onChange={(e) => onIntegerChange("hour", e.target.value)}
          onBlur={() => {
            if (focus === "hour") commitFieldText("hour");
          }}
        />
        <span>:</span>
        <input
          ref={minuteInputRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          disabled={disabled}
          aria-label={`${label} minute`}
          aria-expanded={focus === "minute"}
          aria-controls={focus === "minute" ? popoverId : undefined}
          className={cn(
            integerInputClass,
            focus === "minute" && "ring-1 ring-[var(--accent)]",
          )}
          value={minuteShown}
          onFocus={() => openField("minute")}
          onChange={(e) => onIntegerChange("minute", e.target.value)}
          onBlur={() => {
            if (focus === "minute") commitFieldText("minute");
          }}
        />
        <div className="ml-1 inline-flex rounded-md border border-[var(--border)] p-0.5">
          {(
            [
              { pm: false, label: "AM" },
              { pm: true, label: "PM" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.label}
              type="button"
              disabled={disabled}
              className={cn(
                "rounded px-1.5 py-0.5 font-mono text-[9px]",
                parts.pm === opt.pm
                  ? "bg-[var(--accent)] font-semibold text-[#0d1117]"
                  : "text-[var(--text-muted)]",
              )}
              onClick={() => apply({ ...parts, pm: opt.pm })}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {popover}

      {confirmHint && !disabled && (
        <p className="mt-2 text-center font-mono text-[9px] leading-snug text-[var(--accent-amber)]">
          {confirmHint}
        </p>
      )}

      {!disabled && (
        <button
          type="button"
          className="btn btn-primary mt-3 w-full text-xs"
          disabled={confirmDisabled}
          onClick={onConfirm}
        >
          Set {label.toLowerCase()}
        </button>
      )}
    </div>
  );
}
