import React, { useState, useEffect } from "react";

export interface StatTick {
  text: string;
  highlight?: boolean;
}

export interface StatInputSliderProps {
  label: string;
  subLabel?: React.ReactNode;
  unit: string;
  value: number;
  onChange: (val: number) => void;
  min: number;
  max: number;
  step: number;
  digits?: number;
  allowNegative?: boolean;
  themeColor?: "gold" | "amber" | "emerald" | "sky";
  ticks?: StatTick[];
}

export default function StatInputSlider({
  label,
  subLabel,
  unit,
  value,
  onChange,
  min,
  max,
  step,
  digits = 1,
  allowNegative = false,
  themeColor = "gold",
  ticks,
}: StatInputSliderProps) {
  const [inputValue, setInputValue] = useState<string>(() =>
    Number.isInteger(step) && digits === 0 ? value.toString() : value.toFixed(digits)
  );
  const [isFocused, setIsFocused] = useState(false);
  const [isFreshFocus, setIsFreshFocus] = useState(false);

  // 외부 value 변경 시 포커스가 없을 때에만 input 텍스트 동기화
  useEffect(() => {
    if (!isFocused) {
      setInputValue(
        Number.isInteger(step) && digits === 0 ? value.toString() : value.toFixed(digits)
      );
    }
  }, [value, digits, step, isFocused]);

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    setIsFreshFocus(true);
    // 마우스 클릭 시 selection 해제를 방지하기 위해 비동기로 전체 선택
    const target = e.currentTarget;
    setTimeout(() => {
      target.select();
    }, 0);
  };

  const handleClick = (e: React.MouseEvent<HTMLInputElement>) => {
    // 클릭 시에도 확실히 전체 선택
    e.currentTarget.select();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // 네비게이션 키(화살표, 탭)는 기존 값 탐색으로 간주
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Tab"].includes(e.key)) {
      setIsFreshFocus(false);
      return;
    }

    // 백스페이스나 Delete를 누르면 기존 내용 즉시 전체 삭제
    if (e.key === "Backspace" || e.key === "Delete") {
      if (isFreshFocus) {
        setIsFreshFocus(false);
        setInputValue("");
        e.preventDefault();
        return;
      }
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value;

    // 포커스 직후 첫 입력인데 selection 미지원 등으로 기존 값 앞/뒤에 붙은 경우
    if (isFreshFocus) {
      setIsFreshFocus(false);
      const prevFormatted =
        Number.isInteger(step) && digits === 0 ? value.toString() : value.toFixed(digits);
      if (raw !== prevFormatted) {
        if (raw.startsWith(prevFormatted) && raw.length > prevFormatted.length) {
          raw = raw.slice(prevFormatted.length);
        } else if (raw.endsWith(prevFormatted) && raw.length > prevFormatted.length) {
          raw = raw.slice(0, raw.length - prevFormatted.length);
        }
      }
    }

    setInputValue(raw);

    // 음수 부호나 소수점 입력 중간 상태 허용
    if (raw === "" || raw === "-" || raw === "." || raw === "-.") {
      return;
    }

    const parsed = parseFloat(raw);
    if (!isNaN(parsed)) {
      if (!allowNegative && parsed < 0) return;
      onChange(parsed);
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    setIsFreshFocus(false);
    const parsed = parseFloat(inputValue);
    if (isNaN(parsed)) {
      setInputValue(
        Number.isInteger(step) && digits === 0 ? value.toString() : value.toFixed(digits)
      );
    } else {
      const clamped = !allowNegative && parsed < 0 ? 0 : parsed;
      onChange(clamped);
      setInputValue(
        Number.isInteger(step) && digits === 0 ? clamped.toString() : clamped.toFixed(digits)
      );
    }
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const parsed = parseFloat(e.target.value);
    if (!isNaN(parsed)) {
      onChange(parsed);
      setInputValue(
        Number.isInteger(step) && digits === 0 ? parsed.toString() : parsed.toFixed(digits)
      );
    }
  };

  // 테마별 색상 스타일 맵핑
  const colorStyles = {
    gold: {
      accent: "accent-gold",
      border: "border-gold/40 focus-within:border-gold",
      bg: "bg-gold/15",
      text: "text-gold",
      unit: "text-gold/80",
    },
    amber: {
      accent: "accent-amber-400",
      border: "border-amber-500/40 focus-within:border-amber-400",
      bg: "bg-amber-500/15",
      text: "text-amber-400",
      unit: "text-amber-400/80",
    },
    emerald: {
      accent: "accent-emerald-400",
      border: "border-emerald-500/40 focus-within:border-emerald-400",
      bg: "bg-emerald-500/15",
      text: "text-emerald-300",
      unit: "text-emerald-300/80",
    },
    sky: {
      accent: "accent-sky-400",
      border: "border-sky-500/40 focus-within:border-sky-400",
      bg: "bg-sky-500/15",
      text: "text-sky-400",
      unit: "text-sky-400/80",
    },
  }[themeColor];

  // 슬라이더 범위 내로 클램핑 (직접 입력값이 슬라이더 min/max를 벗어날 경우 슬라이더가 튀지 않도록 처리)
  const sliderValue = Math.min(max, Math.max(min, value));

  return (
    <div>
      <div className="flex justify-between items-center mb-1.5 gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <label className="text-xs font-bold text-gray-200">{label}</label>
          {subLabel}
        </div>

        {/* 직접 숫자 입력 필드 + 단위 결합 컨트롤 */}
        <div
          className={`flex items-center ${colorStyles.bg} border ${colorStyles.border} rounded-lg px-2 py-0.5 shadow-inner transition-all shrink-0`}
        >
          <input
            type="number"
            step={step}
            value={inputValue}
            onChange={handleTextChange}
            onFocus={handleFocus}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            aria-label={`${label} 직접 입력`}
            className={`w-14 sm:w-16 bg-transparent text-right text-xs font-mono font-bold ${colorStyles.text} focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
          />
          {unit && (
            <span className={`text-[11px] font-mono font-semibold pl-1 ${colorStyles.unit} select-none whitespace-nowrap`}>
              {unit}
            </span>
          )}
        </div>
      </div>

      {/* 부드러운 반응형 슬라이더 */}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={sliderValue}
        onChange={handleSliderChange}
        className={`w-full ${colorStyles.accent} h-2 bg-black/60 rounded-lg appearance-none cursor-pointer`}
      />

      {/* 하단 가이드 틱 눈금 */}
      {ticks && ticks.length > 0 && (
        <div className="flex justify-between text-[11px] text-gray-400 font-medium mt-1 px-0.5">
          {ticks.map((t, idx) => (
            <span
              key={idx}
              className={t.highlight ? `${colorStyles.text} font-bold` : ""}
            >
              {t.text}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
