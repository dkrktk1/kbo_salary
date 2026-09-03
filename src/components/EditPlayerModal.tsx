import React, { useState, useEffect } from "react";
import { mockTeams, Player, PlayerStat, AVAILABLE_AGENTS } from "../data";
import {
  X,
  Sparkles,
  Calendar,
  Clock,
  Sliders,
  ChevronDown,
  ChevronUp,
  UserCheck,
  Pencil
} from "lucide-react";

interface EditPlayerModalProps {
  player: Player | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedPlayer: Player) => void;
}

function formatDateToKorean(dateStr: string): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const yy = parts[0].slice(-2);
  const mm = parts[1];
  const dd = parts[2];
  return `${yy}년 ${mm}월 ${dd}일`;
}

function calculateOneYearLater(startDateStr: string): string {
  if (!startDateStr) return "";
  const parts = startDateStr.split("-");
  if (parts.length !== 3) return "";
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return "";

  const endDate = new Date(year + 1, month - 1, day - 1);
  const endYear = endDate.getFullYear();
  const endMonth = String(endDate.getMonth() + 1).padStart(2, "0");
  const endDay = String(endDate.getDate()).padStart(2, "0");
  return `${endYear}-${endMonth}-${endDay}`;
}

function parseDatesFromPeriod(period?: string): { start: string; end: string } {
  if (!period) return { start: "2026-01-01", end: "2026-12-31" };
  try {
    const matches = period.match(
      /(\d{2,4})[년.-]\s*(\d{1,2})[월.-]\s*(\d{1,2})[일]?\s*~\s*(\d{2,4})[년.-]\s*(\d{1,2})[월.-]\s*(\d{1,2})[일]?/
    );
    if (matches) {
      const y1 = matches[1].length === 2 ? `20${matches[1]}` : matches[1];
      const m1 = matches[2].padStart(2, "0");
      const d1 = matches[3].padStart(2, "0");
      const y2 = matches[4].length === 2 ? `20${matches[4]}` : matches[4];
      const m2 = matches[5].padStart(2, "0");
      const d2 = matches[6].padStart(2, "0");
      return {
        start: `${y1}-${m1}-${d1}`,
        end: `${y2}-${m2}-${d2}`,
      };
    }
  } catch {}
  return { start: "2026-01-01", end: "2026-12-31" };
}

export function EditPlayerModal({
  player,
  isOpen,
  onClose,
  onSave
}: EditPlayerModalProps) {
  if (!isOpen || !player) return null;

  const [name, setName] = useState(player.name);
  const [team, setTeam] = useState(player.team);
  const [position, setPosition] = useState(player.position);
  const [age, setAge] = useState<number>(player.age || 25);
  const [draftYear, setDraftYear] = useState<number>(player.draftYear || 2021);
  const [serviceTime, setServiceTime] = useState<string>(player.serviceTime || "3년 0일");
  const [salaryManwon, setSalaryManwon] = useState<number>(
    Math.round((player.salaryCurrent || 0) / 10000)
  );

  // 최신 성적 추출
  const s26 = player.stats?.find((s) => s.year === 2026) || player.stats?.[player.stats.length - 1];
  const s25 = player.stats?.find((s) => s.year === 2025);
  const s24 = player.stats?.find((s) => s.year === 2024);

  const [avg, setAvg] = useState<number>(s26?.avg ?? 0.285);
  const [ops, setOps] = useState<number>(s26?.ops ?? 0.820);
  const [hr, setHr] = useState<number>(s26?.hr ?? 12);
  const [war, setWar] = useState<number>(s26?.war ?? 2.8);

  const [showYearlyDetails, setShowYearlyDetails] = useState(false);
  const [stat2024, setStat2024] = useState({
    avg: s24?.avg ?? 0.265,
    ops: s24?.ops ?? 0.770,
    hr: s24?.hr ?? 8,
    war: s24?.war ?? 2.1,
    salaryManwon: Math.round((s24?.salary ?? 75000000) / 10000),
  });
  const [stat2025, setStat2025] = useState({
    avg: s25?.avg ?? 0.275,
    ops: s25?.ops ?? 0.800,
    hr: s25?.hr ?? 10,
    war: s25?.war ?? 2.5,
    salaryManwon: Math.round((s25?.salary ?? 85000000) / 10000),
  });

  const parsedDates = parseDatesFromPeriod(player.contractPeriod);
  const [agent, setAgent] = useState<string>(player.agent || "이세인");
  const [contractStartDate, setContractStartDate] = useState(parsedDates.start);
  const [contractEndDate, setContractEndDate] = useState(parsedDates.end);

  useEffect(() => {
    if (player) {
      setAgent(player.agent || "이세인");
    }
  }, [player]);

  const handleContractStartDateChange = (val: string) => {
    setContractStartDate(val);
    if (val && val.length === 10) {
      const autoEndDate = calculateOneYearLater(val);
      if (autoEndDate) {
        setContractEndDate(autoEndDate);
      }
    }
  };

  const handleSave = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      alert("선수명을 입력해주세요.");
      return;
    }

    const currentSalaryWon = Math.max(0, salaryManwon * 10000);
    const contractPeriodText =
      contractStartDate && contractEndDate
        ? `${formatDateToKorean(contractStartDate)} ~ ${formatDateToKorean(contractEndDate)}`
        : player.contractPeriod || "25년 01월 01일 ~ 27년 12월 31일";

    const finalStats: PlayerStat[] = [
      {
        year: 2024,
        avg: stat2024.avg,
        ops: stat2024.ops,
        hr: stat2024.hr,
        war: stat2024.war,
        salary: stat2024.salaryManwon * 10000,
      },
      {
        year: 2025,
        avg: stat2025.avg,
        ops: stat2025.ops,
        hr: stat2025.hr,
        war: stat2025.war,
        salary: stat2025.salaryManwon * 10000,
      },
      {
        year: 2026,
        avg: avg,
        ops: ops,
        hr: hr,
        war: war,
        salary: currentSalaryWon,
      },
    ];

    const updated: Player = {
      ...player,
      name: trimmedName,
      team,
      position,
      age,
      draftYear,
      serviceTime,
      salaryCurrent: currentSalaryWon,
      contractPeriod: contractPeriodText,
      agent,
      stats: finalStats,
    };

    onSave(updated);
  };

  const formatSalaryPreview = (manwon: number) => {
    if (manwon >= 10000) {
      const uk = manwon / 10000;
      return `${uk.toFixed(uk % 1 === 0 ? 0 : 2)}억원 (${manwon.toLocaleString()}만원)`;
    }
    return `${manwon.toLocaleString()}만원`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="glass-card bg-[#14171d] border border-white/15 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* 모달 헤더 */}
        <div className="flex items-center justify-between p-5 border-b border-white/10 bg-white/5 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-gold/15 border border-gold/30 text-gold shadow-sm flex-shrink-0">
              <Pencil className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-white flex items-center gap-2 flex-wrap">
                <span className="whitespace-nowrap">소속 선수 정보 및 성적 수정</span>
                <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-gold/15 border border-gold/30 text-gold font-semibold font-mono whitespace-nowrap">
                  {player.name}
                </span>
              </h3>
              <p className="text-xs text-gray-400 mt-1 break-keep-all leading-relaxed">
                타율, OPS, 홈런, WAR, 연봉 및 에이전트 계약 정보를 수정합니다.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-colors cursor-pointer flex-shrink-0 ml-2"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 본문 */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* 기본 프로필 */}
          <div className="bg-black/30 p-4 rounded-xl border border-white/10 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1.5 whitespace-nowrap">선수명</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-10 bg-black/50 border border-white/20 rounded-lg px-3 text-sm text-white focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1.5 whitespace-nowrap">소속 구단</label>
                <select
                  value={team}
                  onChange={(e) => setTeam(e.target.value)}
                  className="w-full h-10 bg-black/50 border border-white/20 rounded-lg px-3 text-sm text-white focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-colors"
                >
                  {mockTeams.map((t) => (
                    <option key={t.id} value={t.name} className="bg-[#1a1d24] text-white">
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1.5 whitespace-nowrap">포지션</label>
                <select
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  className="w-full h-10 bg-black/50 border border-white/20 rounded-lg px-3 text-sm text-white focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-colors"
                >
                  {["포수", "투수", "1루수", "2루수", "3루수", "유격수", "외야수", "지명타자"].map((pos) => (
                    <option key={pos} value={pos} className="bg-[#1a1d24] text-white">
                      {pos}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* 2026 핵심 지표 */}
          <div className="bg-[#181c24] p-4.5 rounded-xl border border-gold/40 shadow-lg space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5 flex-wrap gap-1">
              <span className="text-xs font-bold text-gold uppercase tracking-wider flex items-center gap-1.5 whitespace-nowrap">
                <Sparkles className="w-4 h-4 text-gold" />
                2026 성적 지표 (타율, OPS, 홈런, WAR)
              </span>
              <span className="text-[11px] text-gray-400 whitespace-nowrap">직접 입력하여 실시간 반영</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* 타율 */}
              <div className="bg-black/50 p-3 rounded-lg border border-white/10 hover:border-gold/50 transition-colors flex flex-col justify-between">
                <label className="block text-[11px] font-bold text-gray-400 mb-1.5 whitespace-nowrap">
                  타율 (AVG)
                </label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  max="1"
                  value={avg}
                  onChange={(e) => setAvg(parseFloat(e.target.value) || 0)}
                  className="w-full h-10 bg-black/60 border border-white/20 rounded-lg px-2 text-base font-extrabold text-white text-center focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold"
                />
              </div>

              {/* OPS */}
              <div className="bg-black/50 p-3 rounded-lg border border-white/10 hover:border-gold/50 transition-colors flex flex-col justify-between">
                <label className="block text-[11px] font-bold text-gray-400 mb-1.5 whitespace-nowrap">
                  OPS
                </label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  max="2"
                  value={ops}
                  onChange={(e) => setOps(parseFloat(e.target.value) || 0)}
                  className="w-full h-10 bg-black/60 border border-white/20 rounded-lg px-2 text-base font-extrabold text-white text-center focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold"
                />
              </div>

              {/* 홈런 */}
              <div className="bg-black/50 p-3 rounded-lg border border-white/10 hover:border-gold/50 transition-colors flex flex-col justify-between">
                <label className="block text-[11px] font-bold text-gray-400 mb-1.5 whitespace-nowrap">
                  홈런 (개)
                </label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={hr}
                  onChange={(e) => setHr(parseInt(e.target.value) || 0)}
                  className="w-full h-10 bg-black/60 border border-white/20 rounded-lg px-2 text-base font-extrabold text-white text-center focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold"
                />
              </div>

              {/* WAR */}
              <div className="bg-black/50 p-3 rounded-lg border border-white/10 hover:border-gold/50 transition-colors flex flex-col justify-between">
                <label className="block text-[11px] font-bold text-gold mb-1.5 whitespace-nowrap">
                  WAR (기여도)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="-3"
                  max="15"
                  value={war}
                  onChange={(e) => setWar(parseFloat(e.target.value) || 0)}
                  className="w-full h-10 bg-black/60 border border-gold/40 rounded-lg px-2 text-base font-extrabold text-gold text-center focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold"
                />
              </div>
            </div>

            {/* 연봉 및 부가 프로필 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1.5 whitespace-nowrap">
                  현재 연봉 (만원 단위)
                </label>
                <div className="relative flex items-center">
                  <input
                    type="number"
                    step="100"
                    min="0"
                    value={salaryManwon}
                    onChange={(e) => setSalaryManwon(parseInt(e.target.value) || 0)}
                    className="w-full h-10 bg-black/50 border border-white/20 rounded-lg px-3 pr-14 text-sm text-white focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold font-bold"
                  />
                  <span className="absolute right-3 text-xs text-gold font-semibold pointer-events-none whitespace-nowrap">
                    만원
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 mt-1.5 break-keep-all">
                  환산액: <span className="text-white font-bold whitespace-nowrap">{formatSalaryPreview(salaryManwon)}</span>
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1.5 whitespace-nowrap text-center">나이</label>
                  <input
                    type="number"
                    min="18"
                    max="45"
                    value={age}
                    onChange={(e) => setAge(parseInt(e.target.value) || 25)}
                    className="w-full h-10 bg-black/50 border border-white/20 rounded-lg px-2 text-sm text-white text-center focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1.5 whitespace-nowrap text-center">입단연도</label>
                  <input
                    type="number"
                    min="1990"
                    max="2030"
                    value={draftYear}
                    onChange={(e) => setDraftYear(parseInt(e.target.value) || 2021)}
                    className="w-full h-10 bg-black/50 border border-white/20 rounded-lg px-2 text-sm text-white text-center focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1.5 whitespace-nowrap text-center">등록일수</label>
                  <input
                    type="text"
                    value={serviceTime}
                    onChange={(e) => setServiceTime(e.target.value)}
                    className="w-full h-10 bg-black/50 border border-white/20 rounded-lg px-2 text-xs text-white text-center focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 3개년 성적 세부 조정 */}
          <div className="bg-black/20 rounded-xl border border-white/10 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowYearlyDetails(!showYearlyDetails)}
              className="w-full p-3.5 flex items-center justify-between text-left hover:bg-white/5 transition-colors cursor-pointer"
            >
              <span className="text-xs font-bold text-gray-300 flex items-center gap-2 whitespace-nowrap">
                <Sliders className="w-3.5 h-3.5 text-gold" />
                3개년 (2024, 2025, 2026) 성적 및 연봉 세부 설정
              </span>
              <span className="text-gray-400">
                {showYearlyDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </span>
            </button>

            {showYearlyDetails && (
              <div className="p-4 border-t border-white/10 space-y-4 bg-black/40 text-xs">
                {/* 2024 */}
                <div className="p-3 rounded-lg bg-white/5 border border-white/10 space-y-2">
                  <div className="font-bold text-gray-300 flex items-center justify-between whitespace-nowrap">
                    <span>2024 시즌 기록</span>
                    <span className="text-gray-400 font-mono">2년 전</span>
                  </div>
                  <div className="grid grid-cols-5 gap-2 text-center">
                    <div>
                      <span className="text-gray-400 block text-[10px] mb-1 whitespace-nowrap">타율</span>
                      <input
                        type="number"
                        step="0.001"
                        value={stat2024.avg}
                        onChange={(e) => setStat2024({ ...stat2024, avg: parseFloat(e.target.value) || 0 })}
                        className="w-full h-8 bg-black/60 border border-white/20 rounded px-1.5 text-center font-bold text-white text-xs"
                      />
                    </div>
                    <div>
                      <span className="text-gray-400 block text-[10px] mb-1 whitespace-nowrap">OPS</span>
                      <input
                        type="number"
                        step="0.001"
                        value={stat2024.ops}
                        onChange={(e) => setStat2024({ ...stat2024, ops: parseFloat(e.target.value) || 0 })}
                        className="w-full h-8 bg-black/60 border border-white/20 rounded px-1.5 text-center font-bold text-white text-xs"
                      />
                    </div>
                    <div>
                      <span className="text-gray-400 block text-[10px] mb-1 whitespace-nowrap">홈런</span>
                      <input
                        type="number"
                        value={stat2024.hr}
                        onChange={(e) => setStat2024({ ...stat2024, hr: parseInt(e.target.value) || 0 })}
                        className="w-full h-8 bg-black/60 border border-white/20 rounded px-1.5 text-center font-bold text-white text-xs"
                      />
                    </div>
                    <div>
                      <span className="text-gray-400 block text-[10px] mb-1 whitespace-nowrap">WAR</span>
                      <input
                        type="number"
                        step="0.1"
                        value={stat2024.war}
                        onChange={(e) => setStat2024({ ...stat2024, war: parseFloat(e.target.value) || 0 })}
                        className="w-full h-8 bg-black/60 border border-white/20 rounded px-1.5 text-center font-bold text-gold text-xs"
                      />
                    </div>
                    <div>
                      <span className="text-gray-400 block text-[10px] mb-1 whitespace-nowrap">연봉(만원)</span>
                      <input
                        type="number"
                        step="100"
                        value={stat2024.salaryManwon}
                        onChange={(e) => setStat2024({ ...stat2024, salaryManwon: parseInt(e.target.value) || 0 })}
                        className="w-full h-8 bg-black/60 border border-white/20 rounded px-1.5 text-center font-bold text-white text-xs"
                      />
                    </div>
                  </div>
                </div>

                {/* 2025 */}
                <div className="p-3 rounded-lg bg-white/5 border border-white/10 space-y-2">
                  <div className="font-bold text-gray-300 flex items-center justify-between whitespace-nowrap">
                    <span>2025 시즌 기록</span>
                    <span className="text-gray-400 font-mono">전년도</span>
                  </div>
                  <div className="grid grid-cols-5 gap-2 text-center">
                    <div>
                      <span className="text-gray-400 block text-[10px] mb-1 whitespace-nowrap">타율</span>
                      <input
                        type="number"
                        step="0.001"
                        value={stat2025.avg}
                        onChange={(e) => setStat2025({ ...stat2025, avg: parseFloat(e.target.value) || 0 })}
                        className="w-full h-8 bg-black/60 border border-white/20 rounded px-1.5 text-center font-bold text-white text-xs"
                      />
                    </div>
                    <div>
                      <span className="text-gray-400 block text-[10px] mb-1 whitespace-nowrap">OPS</span>
                      <input
                        type="number"
                        step="0.001"
                        value={stat2025.ops}
                        onChange={(e) => setStat2025({ ...stat2025, ops: parseFloat(e.target.value) || 0 })}
                        className="w-full h-8 bg-black/60 border border-white/20 rounded px-1.5 text-center font-bold text-white text-xs"
                      />
                    </div>
                    <div>
                      <span className="text-gray-400 block text-[10px] mb-1 whitespace-nowrap">홈런</span>
                      <input
                        type="number"
                        value={stat2025.hr}
                        onChange={(e) => setStat2025({ ...stat2025, hr: parseInt(e.target.value) || 0 })}
                        className="w-full h-8 bg-black/60 border border-white/20 rounded px-1.5 text-center font-bold text-white text-xs"
                      />
                    </div>
                    <div>
                      <span className="text-gray-400 block text-[10px] mb-1 whitespace-nowrap">WAR</span>
                      <input
                        type="number"
                        step="0.1"
                        value={stat2025.war}
                        onChange={(e) => setStat2025({ ...stat2025, war: parseFloat(e.target.value) || 0 })}
                        className="w-full h-8 bg-black/60 border border-white/20 rounded px-1.5 text-center font-bold text-gold text-xs"
                      />
                    </div>
                    <div>
                      <span className="text-gray-400 block text-[10px] mb-1 whitespace-nowrap">연봉(만원)</span>
                      <input
                        type="number"
                        step="100"
                        value={stat2025.salaryManwon}
                        onChange={(e) => setStat2025({ ...stat2025, salaryManwon: parseInt(e.target.value) || 0 })}
                        className="w-full h-8 bg-black/60 border border-white/20 rounded px-1.5 text-center font-bold text-white text-xs"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 에이전트 계약기간 및 담당 에이전트 */}
          <div className="bg-[#12151c] p-4 rounded-xl border border-white/10 space-y-3.5">
            <label className="text-xs font-bold text-gold uppercase tracking-wider flex items-center gap-1.5 whitespace-nowrap">
              <Calendar className="w-3.5 h-3.5 text-gold" />
              에이전트와의 계약기간 및 담당 에이전트 수정
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* 담당 에이전트 드롭다운 */}
              <div>
                <label className="block text-[11px] font-bold text-gold mb-1.5 whitespace-nowrap flex items-center gap-1">
                  <UserCheck className="w-3.5 h-3.5 text-gold" />
                  담당 에이전트 <span className="text-rose-400">*</span>
                </label>
                <select
                  value={agent}
                  onChange={(e) => setAgent(e.target.value)}
                  className="w-full h-10 bg-black/50 border border-gold/40 rounded-lg px-3 text-sm text-white font-bold focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-colors cursor-pointer"
                >
                  {AVAILABLE_AGENTS.map((a) => (
                    <option key={a} value={a} className="bg-[#1a1d24] text-white">
                      {a} 에이전트
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-400 mb-1.5 whitespace-nowrap">
                  계약 시작일
                </label>
                <input
                  type="date"
                  min="1990-01-01"
                  max="2099-12-31"
                  value={contractStartDate}
                  onChange={(e) => handleContractStartDateChange(e.target.value)}
                  className="w-full h-10 bg-black/50 border border-white/20 rounded-lg px-3 text-sm text-white focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-colors"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-400 mb-1.5 whitespace-nowrap">
                  계약 만료일
                </label>
                <input
                  type="date"
                  min="1990-01-01"
                  max="2099-12-31"
                  value={contractEndDate}
                  onChange={(e) => setContractEndDate(e.target.value)}
                  className="w-full h-10 bg-black/50 border border-white/20 rounded-lg px-3 text-sm text-white focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-colors"
                />
              </div>
            </div>

            <div className="bg-black/40 min-h-10 py-2 px-3.5 rounded-lg border border-white/5 flex items-center justify-between text-xs flex-wrap gap-2">
              <span className="text-gray-400 flex items-center gap-1.5 whitespace-nowrap">
                <Clock className="w-3.5 h-3.5 text-gold" />
                표시 형태:
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gold/15 border border-gold/30 text-gold font-bold text-xs whitespace-nowrap">
                  <UserCheck className="w-3 h-3 text-gold" />
                  담당: {agent}
                </span>
                <span className="font-mono font-bold text-white bg-white/5 border border-white/10 px-2.5 py-1 rounded text-xs whitespace-nowrap">
                  {contractStartDate && contractEndDate
                    ? `${formatDateToKorean(contractStartDate)} ~ ${formatDateToKorean(contractEndDate)}`
                    : player.contractPeriod}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 푸터 */}
        <div className="flex items-center justify-between p-5 border-t border-white/10 bg-white/5 flex-shrink-0 flex-wrap gap-3">
          <p className="text-xs text-gray-400 break-keep-all leading-relaxed max-w-sm">
            수정 후 아래 '수정 완료' 버튼을 클릭하세요.
          </p>

          <div className="flex items-center gap-3 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 text-sm font-semibold transition-all cursor-pointer whitespace-nowrap flex items-center justify-center"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="h-10 px-6 rounded-lg bg-gold hover:bg-yellow-400 text-black text-sm font-bold shadow-lg shadow-gold/20 transition-all cursor-pointer whitespace-nowrap flex items-center justify-center active:scale-[0.98]"
            >
              수정 완료
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
