"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

/** Visible on card (`--bg-elevated`) and selected tile (`--bg-muted`). */
const DONUT_TRACK = "var(--border)";

export function DonutChart({
  percent,
  color,
  label,
  size = 88,
}: {
  percent: number;
  color: string;
  label: string;
  size?: number;
}) {
  const data = [
    { name: "done", value: percent },
    { name: "rest", value: Math.max(0, 100 - percent) },
  ];

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="outline-none [&_*]:outline-none"
        style={{ width: size, height: size }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              innerRadius={size * 0.32}
              outerRadius={size * 0.42}
              dataKey="value"
              startAngle={90}
              endAngle={-270}
              stroke="none"
            >
              <Cell fill={color} />
              <Cell fill={DONUT_TRACK} />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <span className="font-mono text-lg font-semibold">{percent}%</span>
      <span className="max-w-[100px] truncate text-center text-[10px] text-[var(--text-muted)]">
        {label}
      </span>
    </div>
  );
}
