import React from "react";
import { getPercentileStyle } from "../types";

export interface PercentileBarItemProps {
  idPrefix: string;
  name: string;
  subName?: string;
  value: number | null;
  rawDisplay?: string;
}

export function PercentileBarItem({
  idPrefix,
  name,
  subName,
  value,
  rawDisplay,
}: PercentileBarItemProps) {
  const style = getPercentileStyle(value);
  const isNoData = value === null || value === undefined;

  return (
    <div className="flex items-center gap-3">
      {/* Metric Label (Left 140px) */}
      <div className="w-[145px] flex-shrink-0 text-left">
        <span className="text-xs font-bold text-white block truncate">{name}</span>
        <div className="flex items-center gap-1.5 mt-0.5">
          {subName && (
            <span className="text-[11px] text-gray-400 font-medium">{subName}</span>
          )}
          {rawDisplay && rawDisplay !== "데이터 없음" && (
            <span className="text-[11px] text-gold font-bold font-mono">({rawDisplay})</span>
          )}
        </div>
      </div>

      {/* Savant Track */}
      <div className="flex-1 relative h-6 flex items-center">
        <div className="absolute inset-0 bg-white/[0.04] rounded-full border border-white/10 overflow-hidden">
          <div className="absolute inset-0 grid grid-cols-4 pointer-events-none">
            <div className="border-r border-white/15 h-full"></div>
            <div className="border-r border-white/25 h-full"></div>
            <div className="border-r border-white/15 h-full"></div>
            <div className="h-full"></div>
          </div>
        </div>

        {/* Filled Bar */}
        <div 
          id={`${idPrefix}-bar`}
          className={`relative h-3.5 rounded-full bg-gradient-to-r ${style.barGradient} transition-all duration-700`}
          style={{ width: isNoData ? "0%" : `${Math.min(100, Math.max(0, value))}%` }}
        />

        {/* 50% Benchmark */}
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/20 pointer-events-none" />
      </div>

      {/* Badge */}
      <div className="w-[45px] flex justify-end flex-shrink-0">
        <div 
          id={`${idPrefix}-badge`}
          className={`w-7 h-7 rounded-full border flex items-center justify-center text-[11.5px] font-bold ${style.badgeBg}`}
          title={isNoData ? "데이터 없음" : `백분위 ${value}%`}
        >
          {isNoData ? (
            <span className="text-gray-400 text-xs">-</span>
          ) : (
            value
          )}
        </div>
      </div>
    </div>
  );
}
export default PercentileBarItem;
