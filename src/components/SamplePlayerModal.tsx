import React, { useState, useEffect } from "react";
import { mockTeams, Player } from "../data";
import { parseServiceTimeFaStatus } from "../services/dbService";
import {
  FlaskConical,
  X,
  Sparkles,
  Shield,
  Activity,
  Award,
  CheckCircle2,
  RotateCcw,
  Pencil
} from "lucide-react";

export interface SamplePlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (player: Player, savedToRemoteDb?: boolean) => void;
  initialPlayer?: Player | null;
}

// 빠른 테스트용 시나리오 프리셋 정의
interface PresetScenario {
  label: string;
  badge: string;
  badgeColor: string;
  name: string;
  team: string;
  position: string;
  age: number;
  draftYear: number;
  seasons: number;
  remainDays: number;
  salaryManwon: number;
  recentWar: number;
  csRate?: number;
  pb9?: number;
  desc: string;
}

const PRESET_SCENARIOS: PresetScenario[] = [
  {
    label: "비FA 저연봉 신예",
    badge: "비FA 신인",
    badgeColor: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    name: "샘플_신예내야수",
    team: "롯데",
    position: "내야수",
    age: 23,
    draftYear: 2024,
    seasons: 2,
    remainDays: 50,
    salaryManwon: 4500, // 4,500만원
    recentWar: 2.2,
    desc: "1군 2년차 저연봉 선수로, 고과 친화적 앵커링 인상률 검증에 적합합니다."
  },
  {
    label: "비FA 주전급 도약 타자",
    badge: "비FA 5년차",
    badgeColor: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    name: "샘플_주전외야수",
    team: "두산",
    position: "외야수",
    age: 26,
    draftYear: 2021,
    seasons: 5,
    remainDays: 30,
    salaryManwon: 25000, // 2억 5,000만원
    recentWar: 3.8,
    desc: "1군 5년차 주전 선수로, FA 직전 중견 연봉 구간의 현실적 협상액 산출 검증에 적합합니다."
  },
  {
    label: "비FA 슈퍼스타 (노시환형)",
    badge: "비FA 대형",
    badgeColor: "bg-purple-500/15 text-purple-300 border-purple-500/30",
    name: "샘플_고액비FA",
    team: "한화",
    position: "내야수",
    age: 26,
    draftYear: 2019,
    seasons: 6,
    remainDays: 110,
    salaryManwon: 100000, // 10억원
    recentWar: 4.8,
    desc: "FA 1년 전 고액 연봉자로서 고과 인상과 FA 시장가치의 갭을 검증합니다."
  },
  {
    label: "첫 FA 충족 주전 포수",
    badge: "FA 충족",
    badgeColor: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    name: "샘플_FA포수",
    team: "KIA",
    position: "포수",
    age: 30,
    draftYear: 2017,
    seasons: 8,
    remainDays: 20,
    salaryManwon: 75000, // 7억 5,000만원
    recentWar: 4.2,
    csRate: 36.5,
    pb9: 0.28,
    desc: "7시즌 이상 충족한 안방마님으로, 포수 프리미엄 지표(도루저지율 등) 가산 효과를 검증합니다."
  },
  {
    label: "선발 에이스 투수",
    badge: "투수 모델",
    badgeColor: "bg-sky-500/15 text-sky-300 border-sky-500/30",
    name: "샘플_에이스투수",
    team: "두산",
    position: "투수",
    age: 27,
    draftYear: 2020,
    seasons: 6,
    remainDays: 50,
    salaryManwon: 32000, // 3억 2,000만원
    recentWar: 4.5,
    desc: "투수 전용 지표(이닝, ERA, WHIP) 가감산 로직 및 현실적 협상액을 검증합니다."
  },
  {
    label: "초고액 베테랑 스타 (양의지형)",
    badge: "고액 베테랑",
    badgeColor: "bg-red-500/15 text-red-300 border-red-500/30",
    name: "샘플_베테랑스타",
    team: "두산",
    position: "포수",
    age: 38,
    draftYear: 2006,
    seasons: 19,
    remainDays: 120,
    salaryManwon: 350000, // 35억원
    recentWar: 4.5,
    csRate: 37.8,
    pb9: 0.32,
    desc: "기존 연봉이 매우 높은 스타 선수의 목표 성적 변동 동적 연동 로직을 검증합니다."
  }
];

function formatManwonToKorean(manwon: number): string {
  if (!manwon || isNaN(manwon) || manwon <= 0) return "0원";
  const eok = Math.floor(manwon / 10000);
  const rem = manwon % 10000;
  if (eok > 0 && rem > 0) {
    return `${eok}억 ${rem.toLocaleString()}만원`;
  } else if (eok > 0) {
    return `${eok}억원`;
  }
  return `${rem.toLocaleString()}만원`;
}

export default function SamplePlayerModal({
  isOpen,
  onClose,
  onApply,
  initialPlayer
}: SamplePlayerModalProps) {
  const isEditMode = Boolean(initialPlayer);

  // 폼 입력 State
  const [name, setName] = useState(initialPlayer?.name || "가상_테스트선수");
  const [team, setTeam] = useState(initialPlayer?.team || "롯데 자이언츠");
  const [position, setPosition] = useState(initialPlayer?.position || "내야수");
  const [age, setAge] = useState(initialPlayer?.age || 26);
  const [draftYear, setDraftYear] = useState(initialPlayer?.draftYear || 2021);

  // 등록일수: 시즌수(년) + 잔여일수(일)
  const [seasons, setSeasons] = useState(5);
  const [remainDays, setRemainDays] = useState(40);
  const [useCustomServiceTimeText, setUseCustomServiceTimeText] = useState(false);
  const [customServiceTimeText, setCustomServiceTimeText] = useState("");

  // 현재 연봉 (만원 단위)
  const [salaryManwon, setSalaryManwon] = useState(25000); // 기본 2억 5,000만원

  // 최근 성적 WAR (음수 허용)
  const [recentWar, setRecentWar] = useState<number | string>(
    initialPlayer?.stats?.[initialPlayer.stats.length - 1]?.war ?? 3.8
  );

  // 포수 전용 지표 (도루저지율 CS%, 블로킹 PB/9)
  const [catcherCsRate, setCatcherCsRate] = useState<number>(32.0);
  const [catcherPb9, setCatcherPb9] = useState<number>(0.35);

  const [showPresets, setShowPresets] = useState(!isEditMode);

  // 모달이 열리거나 initialPlayer가 변경될 때 필드 상태 완벽 동기화 (기존 정보 수정 시 유지)
  useEffect(() => {
    if (!isOpen) return;

    if (initialPlayer) {
      setName(initialPlayer.name || "");
      
      // 구단 매칭 (단축명/정식명 호환)
      const rawTeam = initialPlayer.team || "롯데 자이언츠";
      const matchedTeam = mockTeams.find(
        (t) => t.name === rawTeam || t.name.startsWith(rawTeam) || rawTeam.startsWith(t.name.slice(0, 2))
      );
      setTeam(matchedTeam ? matchedTeam.name : rawTeam);

      setPosition(initialPlayer.position || "내야수");
      setAge(initialPlayer.age || 25);
      setDraftYear(initialPlayer.draftYear || 2021);

      // 포수 전용 지표 초기화 (포수일 때만 기본값 세팅)
      const isInitCatcher = (initialPlayer.position || "").includes("포수");
      const initBase = (initialPlayer as any).sampleBaseline;
      const initStat = initialPlayer.stats?.[0];
      const initCs = isInitCatcher 
        ? (typeof initBase?.csRate === 'number'
            ? initBase.csRate
            : (typeof (initStat as any)?.['CS%'] === 'number'
                ? (initStat as any)['CS%']
                : (typeof (initialPlayer as any).csRate === 'number'
                    ? (initialPlayer as any).csRate
                    : 30.0)))
        : 30.0;
      const initPb = isInitCatcher
        ? (typeof initBase?.pb9 === 'number'
            ? initBase.pb9
            : (typeof (initStat as any)?.['PB/9'] === 'number'
                ? (initStat as any)['PB/9']
                : (typeof (initStat as any)?.['BLK/9'] === 'number'
                    ? (initStat as any)['BLK/9']
                    : (typeof (initialPlayer as any).pb9 === 'number'
                        ? (initialPlayer as any).pb9
                        : 0.38))))
        : 0.38;
      setCatcherCsRate(initCs);
      setCatcherPb9(initPb);

      // 등록일수 파싱 (예: "0년 104일", "104일", "3년 53일")
      if (initialPlayer.serviceTime) {
        const parsedService = parseServiceTimeFaStatus(initialPlayer.serviceTime);
        setSeasons(parsedService.seasons || 0);
        setRemainDays(parsedService.remainDays || 0);
        setUseCustomServiceTimeText(false);
        setCustomServiceTimeText("");
      } else {
        setSeasons(0);
        setRemainDays(0);
      }

      // 연봉 파싱 (원 단위 -> 만원 단위 변환)
      let salManwon = 3000;
      if (initialPlayer.salaryCurrent) {
        let sal = initialPlayer.salaryCurrent;
        while (sal > 50000000000) sal = Math.round(sal / 10000);
        salManwon = sal >= 5000000 ? Math.round(sal / 10000) : sal;
      }
      setSalaryManwon(salManwon);

      // 최근 WAR 파싱
      const latestStat = initialPlayer.stats?.[initialPlayer.stats.length - 1];
      setRecentWar(latestStat?.war ?? 0);
      setShowPresets(false);
    } else {
      // 신규 등록 기본값
      setName("가상_테스트선수");
      setTeam("롯데 자이언츠");
      setPosition("내야수");
      setAge(26);
      setDraftYear(2021);
      setSeasons(5);
      setRemainDays(40);
      setUseCustomServiceTimeText(false);
      setCustomServiceTimeText("");
      setSalaryManwon(25000);
      setRecentWar(3.8);
      setCatcherCsRate(32.0);
      setCatcherPb9(0.35);
      setShowPresets(true);
    }
  }, [isOpen, initialPlayer]);

  // 프리셋 적용 핸들러
  const handleApplyPreset = (preset: PresetScenario) => {
    setName(preset.name);
    // 팀명 정규화
    const matched = mockTeams.find(t => t.name.includes(preset.team) || preset.team.includes(t.name.slice(0, 2)));
    setTeam(matched ? matched.name : preset.team);
    setPosition(preset.position);
    setAge(preset.age);
    setDraftYear(preset.draftYear);
    setSeasons(preset.seasons);
    setRemainDays(preset.remainDays);
    setSalaryManwon(preset.salaryManwon);
    setRecentWar(preset.recentWar);
    if (preset.csRate !== undefined) setCatcherCsRate(preset.csRate);
    else if (preset.position === "포수") setCatcherCsRate(32.0);

    if (preset.pb9 !== undefined) setCatcherPb9(preset.pb9);
    else if (preset.position === "포수") setCatcherPb9(0.35);

    setUseCustomServiceTimeText(false);
  };

  // 등록일수 문자열 및 FA 여부 계산
  const totalDays = seasons * 145 + remainDays;
  const computedServiceTimeString = useCustomServiceTimeText && customServiceTimeText.trim()
    ? customServiceTimeText.trim()
    : `${seasons}년 ${remainDays}일 (${totalDays.toLocaleString()}일)`;

  const faStatus = parseServiceTimeFaStatus(computedServiceTimeString);
  const currentSeason = 2026;
  const careerYears = draftYear > 0 ? Math.max(1, currentSeason - draftYear + 1) : 1;

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedName = name.trim() || (isEditMode ? initialPlayer?.name || "샘플선수" : "가상_테스트선수");
    const salaryWon = Math.max(0, salaryManwon) * 10000;
    const parsedWar = typeof recentWar === "string" ? parseFloat(recentWar) : recentWar;
    const finalWar = isNaN(parsedWar) ? 0 : parsedWar;

    const posUpper = position.trim().toUpperCase();
    const isCatcher = position.includes("포수") || posUpper === "C" || posUpper === "CATCHER" || posUpper.startsWith("C/") || posUpper.endsWith("/C");
    const isPitcher = position.includes("투수") || posUpper === "P" || posUpper === "PITCHER" || posUpper.startsWith("P/") || posUpper.endsWith("/P");
    const isFielder = !isCatcher && !isPitcher;

    const samplePlayer: Player = {
      id: initialPlayer?.id || `sample-${Date.now()}`,
      name: trimmedName,
      team,
      position,
      age: Number(age) || 25,
      salaryCurrent: salaryWon,
      draftYear: Number(draftYear) || 2021,
      serviceTime: computedServiceTimeString,
      contractPeriod: "2026년 01월 01일 ~ 2026년 12월 31일",
      agent: "가상 시뮬레이터",
      stats: [
        {
          year: 2025,
          war: finalWar,
          salary: salaryWon,
          avg: isPitcher ? undefined : 0.285,
          ops: isPitcher ? undefined : 0.810,
          hr: isPitcher ? undefined : 12,
          era: isPitcher ? 3.45 : undefined,
          whip: isPitcher ? 1.22 : undefined,
          wls: isPitcher ? "10승 6패" : undefined,
          "CS%": isCatcher ? catcherCsRate : undefined,
          "PB/9": isCatcher ? catcherPb9 : undefined,
          "BLK/9": isCatcher ? catcherPb9 : undefined,
          "도루저지율": isCatcher ? catcherCsRate : undefined,
          "블로킹": isCatcher ? catcherPb9 : undefined,
          "RF9": isFielder ? 3.90 : undefined,
          "ISO": isFielder ? 0.160 : undefined,
        }
      ]
    };

    // 샘플 선수 플래그 설정 및 기준/비교 지표 영구 보존 (해당 포지션 전용 지표만 보존)
    (samplePlayer as any).isSample = true;
    (samplePlayer as any).csRate = isCatcher ? catcherCsRate : undefined;
    (samplePlayer as any).pb9 = isCatcher ? catcherPb9 : undefined;
    (samplePlayer as any).sampleBaseline = {
      war: finalWar,
      wrcPlus: isPitcher ? undefined : Math.round((0.810 - 0.720) * 250 + 100),
      ops: isPitcher ? undefined : 0.810,
      csRate: isCatcher ? catcherCsRate : undefined,
      pb9: isCatcher ? catcherPb9 : undefined,
      rf9: isFielder ? 3.90 : undefined,
      iso: isFielder ? 0.160 : undefined,
    };
    (samplePlayer as any).sampleComparison = {
      war: finalWar,
      wrcPlus: isPitcher ? undefined : Math.round((0.810 - 0.720) * 250 + 100),
      ops: isPitcher ? undefined : 0.810,
      csRate: isCatcher ? catcherCsRate : undefined,
      pb9: isCatcher ? catcherPb9 : undefined,
      rf9: isFielder ? 3.90 : undefined,
      iso: isFielder ? 0.160 : undefined,
    };

    // 샘플 선수는 등록 시점에는 로컬 시뮬레이터에만 적용되며,
    // 원격 구글 시트 DB(Sample_Player_DB) 저장은 사용자가 시뮬레이터 상단의 [데이터 저장] 버튼을 누를 때만 수행됩니다.
    onApply(samplePlayer, false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-[#131722] border border-gold/40 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl my-8 relative flex flex-col max-h-[90vh]">
        {/* 모달 상단 헤더 */}
        <div className="flex items-center justify-between p-5 border-b border-white/10 bg-black/40">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shadow-md ${
              isEditMode 
                ? "bg-amber-500/20 border-amber-400/40 text-amber-300"
                : "bg-gold/15 border-gold/30 text-gold"
            }`}>
              {isEditMode ? <Pencil className="w-5 h-5" /> : <FlaskConical className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-white tracking-tight">
                  {isEditMode ? `샘플 선수 정보 수정 ('${initialPlayer?.name}')` : "샘플 / 가상 선수 수기 등록"}
                </h3>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  isEditMode
                    ? "bg-amber-500/20 text-amber-300 border-amber-400/40"
                    : "bg-gold/20 text-gold border-gold/40"
                }`}>
                  {isEditMode ? "기존 정보 수정 모드" : "시뮬레이터 로직 검증 전용"}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                {isEditMode
                  ? `'${initialPlayer?.name}' 선수의 등록일수, 연봉, 스탯 정보를 수정하여 시뮬레이터에 적용합니다.`
                  : "선수 정보(등록일수, 입단연도, 현재 연봉 등)를 직접 입력하여 연봉 시뮬레이터가 현실적으로 작동하는지 검증합니다."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white flex items-center justify-center transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 모달 본문 (스크롤) */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1 text-xs text-gray-200">
          {/* 1. 빠른 시나리오 프리셋 (수정 모드일 때는 접을 수 있도록 제공) */}
          <div className="bg-black/30 border border-white/10 rounded-xl p-3.5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-gold">
                <Sparkles className="w-3.5 h-3.5" />
                <span>💡 빠른 시나리오 프리셋 선택 {isEditMode && "(필요 시 덮어쓰기)"}</span>
              </div>
              <button
                type="button"
                onClick={() => setShowPresets(!showPresets)}
                className="text-[10px] text-gray-400 hover:text-gold cursor-pointer underline"
              >
                {showPresets ? "프리셋 숨기기" : "프리셋 보기"}
              </button>
            </div>
            {showPresets && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                {PRESET_SCENARIOS.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleApplyPreset(preset)}
                    className="p-2.5 rounded-lg border border-white/10 bg-white/5 hover:bg-gold/10 hover:border-gold/40 text-left transition-all cursor-pointer flex flex-col justify-between group"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-white group-hover:text-gold transition-colors text-xs">
                        {preset.label}
                      </span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded border font-mono ${preset.badgeColor}`}>
                        {preset.badge}
                      </span>
                    </div>
                    <div className="text-[10px] text-gray-400">
                      {preset.position} • {preset.seasons}시즌 • {formatManwonToKorean(preset.salaryManwon)}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 2. 상세 수기 입력 폼 */}
          <form id="sample-player-form" onSubmit={handleSubmit} className="space-y-4">
            {/* 기본 인적 정보: 이름, 구단, 나이, 입단연도 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1">
                  선수명 <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="예: 가상_테스트선수"
                  className="w-full bg-black/50 border border-white/15 rounded-lg px-3 py-2 text-white text-xs outline-none focus:border-gold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1">
                  소속 구단
                </label>
                <select
                  value={team}
                  onChange={(e) => setTeam(e.target.value)}
                  className="w-full bg-black/50 border border-white/15 rounded-lg px-3 py-2 text-white text-xs outline-none focus:border-gold cursor-pointer"
                >
                  {mockTeams.map((t) => (
                    <option key={t.id} value={t.name} className="bg-[#131722] text-white">
                      {t.name}
                    </option>
                  ))}
                  {!mockTeams.some((t) => t.name === team) && team !== "가상구단" && (
                    <option value={team} className="bg-[#131722] text-white">
                      {team}
                    </option>
                  )}
                  <option value="가상구단" className="bg-[#131722] text-white">
                    가상 구단
                  </option>
                </select>
              </div>

              {/* 포지션 선택 */}
              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1">
                  포지션 <span className="text-red-400">*</span>
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {(["내야수", "외야수", "포수", "투수"] as const).map((pos) => {
                    const isSelected = position === pos;
                    return (
                      <button
                        key={pos}
                        type="button"
                        onClick={() => setPosition(pos)}
                        className={`py-2 px-1 rounded-lg text-xs font-bold border transition-all flex items-center justify-center gap-1 cursor-pointer ${
                          isSelected
                            ? "bg-gold/20 text-gold border-gold font-bold shadow-sm"
                            : "bg-black/40 text-gray-400 border-white/10 hover:border-white/20 hover:text-gray-200"
                        }`}
                      >
                        {pos === "포수" && <Shield className="w-3 h-3 text-amber-400" />}
                        {pos === "투수" && <Activity className="w-3 h-3 text-sky-400" />}
                        {pos === "내야수" && <Award className="w-3 h-3 text-emerald-400" />}
                        {pos === "외야수" && <Award className="w-3 h-3 text-teal-400" />}
                        <span>{pos}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 나이 & 입단 연도 */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1">
                    나이
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min={18}
                      max={48}
                      value={age}
                      onChange={(e) => setAge(Number(e.target.value) || 25)}
                      onFocus={(e) => {
                        const target = e.currentTarget;
                        setTimeout(() => target.select(), 0);
                      }}
                      onClick={(e) => e.currentTarget.select()}
                      className="w-full bg-black/50 border border-white/15 rounded-lg px-3 py-2 text-white text-xs outline-none focus:border-gold"
                    />
                    <span className="absolute right-2.5 top-2 text-gray-400 text-xs pointer-events-none">세</span>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-gray-300">
                      입단 연도
                    </label>
                    <span className="text-[10px] text-gray-400 font-mono">
                      {careerYears}년차
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      min={1990}
                      max={2026}
                      value={draftYear}
                      onChange={(e) => setDraftYear(Number(e.target.value) || 2021)}
                      onFocus={(e) => {
                        const target = e.currentTarget;
                        setTimeout(() => target.select(), 0);
                      }}
                      onClick={(e) => e.currentTarget.select()}
                      className="w-full bg-black/50 border border-white/15 rounded-lg px-3 py-2 text-white text-xs outline-none focus:border-gold"
                    />
                    <span className="absolute right-2.5 top-2 text-gray-400 text-xs pointer-events-none">년</span>
                  </div>
                </div>
              </div>

              {/* 포수 특화 핵심 수비 지표 입력 (도루저지율 CS%, 블로킹 PB/9) */}
              {position === "포수" && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 space-y-2 mt-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-amber-300">
                      <Shield className="w-3.5 h-3.5" />
                      <span className="text-xs font-bold">포수 핵심 수비 지표</span>
                      <span className="text-[10px] text-amber-200/70">(도루저지율 & 블로킹)</span>
                    </div>
                    <span className="text-[10px] text-amber-300/80 font-mono">가산점 요소</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] text-gray-300 mb-1 font-medium">기준 도루저지율 (CS%)</label>
                      <div className="relative">
                        <input
                          type="number"
                          step={0.1}
                          min={5}
                          max={70}
                          value={catcherCsRate}
                          onChange={(e) => setCatcherCsRate(parseFloat(e.target.value) || 0)}
                          className="w-full bg-black/50 border border-white/15 rounded-lg px-3 py-2 text-white text-xs outline-none focus:border-gold font-mono font-bold"
                        />
                        <span className="absolute right-2.5 top-2 text-gray-400 text-xs pointer-events-none">%</span>
                      </div>
                      <span className="text-[10px] text-gray-400 mt-0.5 block">KBO 리그 평균 ~30.0%</span>
                    </div>
                    <div>
                      <label className="block text-[11px] text-gray-300 mb-1 font-medium">기준 블로킹 지표 (PB/9)</label>
                      <div className="relative">
                        <input
                          type="number"
                          step={0.01}
                          min={0.05}
                          max={1.5}
                          value={catcherPb9}
                          onChange={(e) => setCatcherPb9(parseFloat(e.target.value) || 0)}
                          className="w-full bg-black/50 border border-white/15 rounded-lg px-3 py-2 text-white text-xs outline-none focus:border-gold font-mono font-bold"
                        />
                        <span className="absolute right-2.5 top-2 text-gray-400 text-xs pointer-events-none">PB/9</span>
                      </div>
                      <span className="text-[10px] text-gray-400 mt-0.5 block">9이닝당 폭투/포일 (낮을수록 우수)</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 3. 1군 등록일수 (Service Time) - 매우 중요! FA / 비FA 판정 기준 */}
            <div className="bg-black/40 border border-white/10 rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <label className="text-xs font-bold text-white">
                    1군 등록일수 (Service Time) <span className="text-gold">* 핵심 판정</span>
                  </label>
                  <span className="text-[10px] text-gray-400">
                    (KBO 규약: 1시즌 = 145일 / 7시즌 이상 시 FA)
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setUseCustomServiceTimeText(!useCustomServiceTimeText)}
                  className="text-[11px] text-gold hover:underline cursor-pointer"
                >
                  {useCustomServiceTimeText ? "간편 계산기로 입력" : "직접 텍스트로 입력"}
                </button>
              </div>

              {!useCustomServiceTimeText ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-center">
                  <div>
                    <label className="block text-[11px] text-gray-400 mb-1">충족 시즌수</label>
                    <div className="relative">
                      <input
                        type="number"
                        min={0}
                        max={25}
                        value={seasons}
                        onChange={(e) => setSeasons(Math.max(0, Number(e.target.value) || 0))}
                        onFocus={(e) => {
                          const target = e.currentTarget;
                          setTimeout(() => target.select(), 0);
                        }}
                        onClick={(e) => e.currentTarget.select()}
                        className="w-full bg-black/60 border border-white/15 rounded-lg px-3 py-2 text-white text-xs outline-none focus:border-gold"
                      />
                      <span className="absolute right-2.5 top-2 text-gray-400 text-xs pointer-events-none">년</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] text-gray-400 mb-1">잔여 일수</label>
                    <div className="relative">
                      <input
                        type="number"
                        min={0}
                        max={144}
                        value={remainDays}
                        onChange={(e) => setRemainDays(Math.max(0, Math.min(144, Number(e.target.value) || 0)))}
                        onFocus={(e) => {
                          const target = e.currentTarget;
                          setTimeout(() => target.select(), 0);
                        }}
                        onClick={(e) => e.currentTarget.select()}
                        className="w-full bg-black/60 border border-white/15 rounded-lg px-3 py-2 text-white text-xs outline-none focus:border-gold"
                      />
                      <span className="absolute right-2.5 top-2 text-gray-400 text-xs pointer-events-none">일</span>
                    </div>
                  </div>

                  <div className="col-span-2 bg-black/30 p-2.5 rounded-lg border border-white/5 flex flex-col justify-center">
                    <span className="text-[10px] text-gray-400">환산 등록일수 표기:</span>
                    <span className="text-xs font-mono font-bold text-white">
                      {computedServiceTimeString}
                    </span>
                  </div>
                </div>
              ) : (
                <div>
                  <input
                    type="text"
                    value={customServiceTimeText}
                    onChange={(e) => setCustomServiceTimeText(e.target.value)}
                    placeholder="예: 4년 85일 (620일) 또는 1100일"
                    className="w-full bg-black/60 border border-white/15 rounded-lg px-3 py-2 text-white text-xs outline-none focus:border-gold"
                  />
                  <span className="text-[10px] text-gray-400 mt-1 block">
                    'X년 Y일', '숫자일', '시즌' 등의 자유 양식을 KBO 규약에 맞게 자동 해석합니다.
                  </span>
                </div>
              )}

              {/* 실시간 FA 자격 판정 상태 뱃지 */}
              <div
                className={`p-2.5 rounded-lg border flex items-center justify-between ${
                  faStatus.isNonFA
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                    : "bg-gold/10 border-gold/40 text-gold"
                }`}
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <div>
                    <span className="font-bold text-xs">
                      {faStatus.isNonFA ? "비FA 지위 (등록일수 미달)" : "FA 자격 충족 지위"}
                    </span>
                    <span className="text-[11px] ml-2 opacity-80">
                      {faStatus.isNonFA
                        ? `(1군 ${faStatus.seasons}시즌 인정, FA까지 ${faStatus.remainingSeasonsToFA}시즌 필요)`
                        : `(1군 ${faStatus.seasons}시즌 충족, KBO 7시즌 요건 충족)`}
                    </span>
                  </div>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-black/30">
                  {faStatus.isNonFA ? "고과 앵커링 모델" : "순수 FA 시장가치 모델"}
                </span>
              </div>
            </div>

            {/* 4. 현재 연봉 설정 */}
            <div className="bg-black/40 border border-white/10 rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-white">
                  현재 연봉 (기준 연봉) <span className="text-gold">*</span>
                </label>
                <span className="text-sm font-bold text-gold font-mono">
                  {formatManwonToKorean(salaryManwon)} ({ (salaryManwon * 10000).toLocaleString() }원)
                </span>
              </div>

              <div className="relative">
                <input
                  type="number"
                  min={0}
                  step={100}
                  required
                  value={salaryManwon}
                  onChange={(e) => setSalaryManwon(Math.max(0, Number(e.target.value) || 0))}
                  onFocus={(e) => {
                    const target = e.currentTarget;
                    setTimeout(() => target.select(), 0);
                  }}
                  onClick={(e) => e.currentTarget.select()}
                  placeholder="만원 단위 입력 (예: 25000 = 2억 5,000만원)"
                  className="w-full bg-black/60 border border-white/15 rounded-lg px-3 py-2.5 text-white text-xs outline-none focus:border-gold"
                />
                <span className="absolute right-3 top-2.5 text-gray-400 text-xs pointer-events-none">만원</span>
              </div>

              {/* 연봉 빠른 가감 버튼 */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {[
                  { label: "3천만", val: 3000 },
                  { label: "5천만", val: 5000 },
                  { label: "1억", val: 10000 },
                  { label: "3억", val: 30000 },
                  { label: "5억", val: 50000 },
                  { label: "10억", val: 100000 },
                  { label: "20억", val: 200000 },
                  { label: "30억", val: 300000 }
                ].map((btn) => (
                  <button
                    key={btn.val}
                    type="button"
                    onClick={() => setSalaryManwon(btn.val)}
                    className={`text-[10px] px-2 py-1 rounded border transition-all cursor-pointer ${
                      salaryManwon === btn.val
                        ? "bg-gold/20 text-gold border-gold/50 font-bold"
                        : "bg-white/5 hover:bg-white/10 text-gray-300 border-white/10"
                    }`}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 5. 참고용 최근 성적 (기본 목표 WAR 설정값) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-black/20 p-3 rounded-xl border border-white/5">
              <div>
                <label className="block text-[11px] text-gray-300 font-bold mb-1">
                  직전 시즌 WAR (승리기여도)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    min="-10.0"
                    max="15.0"
                    value={recentWar}
                    onChange={(e) => setRecentWar(e.target.value)}
                    onFocus={(e) => {
                      const target = e.currentTarget;
                      setTimeout(() => target.select(), 0);
                    }}
                    onClick={(e) => e.currentTarget.select()}
                    placeholder="예: 3.8 또는 -0.4"
                    className="w-full bg-black/50 border border-white/15 rounded-lg px-3 py-1.5 text-white text-xs outline-none focus:border-gold"
                  />
                  <span className="absolute right-2.5 top-1.5 text-gray-400 text-xs pointer-events-none">WAR</span>
                </div>
                <span className="text-[10px] text-gray-500 mt-0.5 block">
                  시뮬레이터 로드 시 초기 슬라이더 값에 참고 반영됩니다.
                </span>
              </div>

              <div className="flex flex-col justify-center text-[11px] text-gray-400 leading-relaxed">
                <span className="text-gray-300 font-medium">💡 검증 포인트 안내:</span>
                <span>• 비FA 선수: 등록일수 부족 시 고과 앵커링 협상안 산출</span>
                <span>• FA 충족 선수: 순수 세이버메트릭스 시장 가치와 직접 연동</span>
                <span>• 초고액 선수: 기존 고액 연봉을 유지하며 성적 변동 동적 반영</span>
              </div>
            </div>
          </form>
        </div>

        {/* 모달 하단 푸터 */}
        <div className="p-4 border-t border-white/10 bg-black/40 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => handleApplyPreset(PRESET_SCENARIOS[0])}
            className="px-3 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>기본값 초기화</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-all cursor-pointer"
            >
              취소
            </button>
            <button
              type="submit"
              form="sample-player-form"
              className={`px-5 py-2.5 rounded-xl text-xs font-bold shadow-lg flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 ${
                isEditMode
                  ? "bg-gradient-to-r from-amber-400 via-gold to-amber-500 text-black shadow-gold/25"
                  : "bg-gradient-to-r from-gold to-amber-500 text-black shadow-gold/20"
              }`}
            >
              {isEditMode ? (
                <>
                  <FlaskConical className="w-4 h-4 stroke-[2.5]" />
                  <span>샘플 선수 수정</span>
                </>
              ) : (
                <>
                  <FlaskConical className="w-4 h-4 stroke-[2.5]" />
                  <span>샘플 선수 등록</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
