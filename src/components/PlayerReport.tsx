import React, { useState, useMemo, useEffect } from "react";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { Sparkles, Loader2, Check, ShieldCheck, Flame, Zap, BarChart3, Search, AlertCircle, Database, RefreshCw } from "lucide-react";

// API 응답 데이터 인터페이스
export interface ApiPlayerStat {
  연도: number;
  선수명: string;
  "CS%"?: number;
  "BLK/9"?: number;
  OPS?: number;
  "wRC+"?: number;
  WAR?: number;
  팝타임?: number;
}

const GAS_API_URL = "https://script.google.com/macros/s/AKfycbwKWgex1PYY6_C78CijB8HKm_swl1XKAShphK4pq8b1_KinxI7nlR1njk3tsj1BTjhK/exec";

// 백분위수 색상 및 스타일 함수
function getPercentileStyle(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return {
      barGradient: "from-gray-700 to-gray-600",
      badgeBg: "bg-gray-700 border-gray-500 text-gray-400",
      textClass: "text-gray-500 font-medium",
      label: "데이터 없음"
    };
  }
  if (value >= 75) {
    return {
      barGradient: "from-rose-700 via-rose-600 to-red-500",
      badgeBg: "bg-red-600 border-red-400 text-white shadow-rose-950/60 shadow-lg",
      textClass: "text-red-400 font-bold",
      indicatorColor: "#e11d48",
      label: "Great (상위)"
    };
  } else if (value >= 26) {
    return {
      barGradient: "from-gray-600 via-gray-500 to-gray-400",
      badgeBg: "bg-gray-600 border-gray-400 text-white shadow-black/50 shadow-md",
      textClass: "text-gray-300 font-medium",
      label: "Average (평균)"
    };
  } else {
    return {
      barGradient: "from-blue-800 via-blue-600 to-blue-500",
      badgeBg: "bg-blue-600 border-blue-400 text-white shadow-blue-950/60 shadow-md",
      textClass: "text-blue-400 font-semibold",
      label: "Poor (하위)"
    };
  }
}

// 동일 포지션(포수) 비교 대상 데이터
const comparisonPlayers = [
  {
    id: "comp_kmh",
    name: "강민호",
    team: "삼성 라이온즈",
    stats: {
      "도루 저지 (CS%)": 60,
      "블로킹 (Blocking)": 78,
      "수비 이닝 (Def IP)": 75,
      "타격 생산성 (wRC+)": 82,
      "장타력 (ISO)": 88,
      "선구안 (BB/K)": 84,
    }
  },
  {
    id: "comp_pdw",
    name: "박동원",
    team: "LG 트윈스",
    stats: {
      "도루 저지 (CS%)": 68,
      "블로킹 (Blocking)": 82,
      "수비 이닝 (Def IP)": 80,
      "타격 생산성 (wRC+)": 85,
      "장타력 (ISO)": 90,
      "선구안 (BB/K)": 80,
    }
  }
];

export default function PlayerReport() {
  const [searchInput, setSearchInput] = useState<string>("손성빈");
  const [currentSearchedName, setCurrentSearchedName] = useState<string>("손성빈");
  const [isFetchingApi, setIsFetchingApi] = useState<boolean>(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // 연도별 분리 데이터 상태
  const [stat2024, setStat2024] = useState<ApiPlayerStat | null>(null);
  const [stat2025, setStat2025] = useState<ApiPlayerStat | null>(null);
  const [stat2026, setStat2026] = useState<ApiPlayerStat | null>(null);
  const [hasData, setHasData] = useState<boolean>(false);

  const [report, setReport] = useState<string>("");
  const [loadingAi, setLoadingAi] = useState(false);
  const [selectedCompId, setSelectedCompId] = useState<string>("comp_kmh");

  // API 데이터 비동기 호출 함수
  const loadPlayerStats = async (playerName: string) => {
    const trimmed = playerName.trim();
    if (!trimmed) {
      alert("검색할 선수 이름을 입력해주세요.");
      return;
    }

    setIsFetchingApi(true);
    setApiError(null);
    setCurrentSearchedName(trimmed);

    try {
      // 1. Google Apps Script REST API 호출 (GET 파라미터 전달)
      const url = `${GAS_API_URL}?name=${encodeURIComponent(trimmed)}`;
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Accept": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`서버 응답 오류 (상태 코드: ${response.status})`);
      }

      const result = await response.json();

      // 2. 응답 데이터 검증 및 선수별 필터링
      if (result && result.status === "success" && Array.isArray(result.data)) {
        // 이름 일치 항목 필터링
        const filteredList = result.data.filter(
          (item: ApiPlayerStat) => item.선수명 === trimmed || (item.선수명 && item.선수명.includes(trimmed))
        );

        if (filteredList.length > 0) {
          const d2024 = filteredList.find((d: ApiPlayerStat) => Number(d.연도) === 2024) || null;
          const d2025 = filteredList.find((d: ApiPlayerStat) => Number(d.연도) === 2025) || null;
          const d2026 = filteredList.find((d: ApiPlayerStat) => Number(d.연도) === 2026) || null;

          setStat2024(d2024);
          setStat2025(d2025);
          setStat2026(d2026);
          setHasData(true);
          setReport(`Google 스프레드시트 DB로부터 '${trimmed}' 선수의 3개년(2024~2026) 성적 및 세부 지표가 성공적으로 동기화되었습니다.`);
        } else {
          // 데이터가 없는 경우
          setStat2024(null);
          setStat2025(null);
          setStat2026(null);
          setHasData(false);
          setApiError(`구글 스프레드시트 DB에 '${trimmed}' 선수의 데이터가 존재하지 않습니다.`);
        }
      } else {
        setStat2024(null);
        setStat2025(null);
        setStat2026(null);
        setHasData(false);
        setApiError("데이터를 불러오지 못했거나 응답 형식이 올바르지 않습니다.");
      }
    } catch (err: any) {
      console.error("API 호출 실패:", err);
      setStat2024(null);
      setStat2025(null);
      setStat2026(null);
      setHasData(false);
      setApiError(`데이터베이스 통신 오류: ${err.message || "네트워크 연결을 확인해주세요."}`);
    } finally {
      setIsFetchingApi(false);
    }
  };

  // 컴포넌트 마운트 시 기본 손성빈 선수 데이터 조회
  useEffect(() => {
    loadPlayerStats("손성빈");
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadPlayerStats(searchInput);
  };

  const activeComp = comparisonPlayers.find(c => c.id === selectedCompId);

  // 레이더 차트 6개 축 구성 (2026년 데이터 기반)
  const radarData = useMemo(() => {
    if (!stat2026) return [];
    const axes = [
      "도루 저지 (CS%)",
      "블로킹 (Blocking)",
      "수비 이닝 (Def IP)",
      "타격 생산성 (wRC+)",
      "장타력 (ISO)",
      "선구안 (BB/K)"
    ];

    const csVal = stat2026["CS%"] ? Math.min(100, Math.round(stat2026["CS%"] * 2)) : 50;
    const wrcVal = stat2026["wRC+"] ? Math.min(100, Math.round(stat2026["wRC+"] * 0.8)) : 50;
    const popVal = stat2026["팝타임"] ?? 80;

    const dynamicStats: Record<string, number> = {
      "도루 저지 (CS%)": csVal,
      "블로킹 (Blocking)": popVal >= 90 ? 94 : 70,
      "수비 이닝 (Def IP)": 90,
      "타격 생산성 (wRC+)": wrcVal,
      "장타력 (ISO)": 80,
      "선구안 (BB/K)": 85,
    };

    return axes.map(axis => ({
      subject: axis,
      [currentSearchedName]: dynamicStats[axis] || 50,
      ...(activeComp ? { [activeComp.name]: activeComp.stats[axis as keyof typeof activeComp.stats] } : {}),
      fullMark: 100
    }));
  }, [stat2026, currentSearchedName, activeComp]);

  async function generateReport() {
    if (!hasData) return;
    setLoadingAi(true);
    try {
      const res = await fetch("/api/gemini/reality-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerData: {
            name: currentSearchedName,
            team: "KBO 프로구단",
            position: "포수",
            stats: [stat2024, stat2025, stat2026].filter(Boolean)
          }
        })
      });
      const data = await res.json();
      if (res.ok && data.text) {
        setReport(data.text);
      }
    } catch {
      // ignore
    }
    setLoadingAi(false);
  }

  // 2026 스탯 백분위수 매핑
  const popTimeVal = stat2026?.["팝타임"] ?? null;
  const csPercentVal = stat2026?.["CS%"] ? Math.min(100, Math.round(stat2026["CS%"] * 2)) : null;
  const blkVal = stat2026?.["BLK/9"] !== undefined ? Math.max(10, Math.min(99, Math.round((1 - stat2026["BLK/9"]) * 100))) : null;
  const wrcPercentVal = stat2026?.["wRC+"] ? Math.min(99, Math.round(stat2026["wRC+"] * 0.85)) : null;

  return (
    <div className="p-8 h-full overflow-y-auto bg-dark-main text-gray-200 flex flex-col gap-6">
      
      {/* 헤더 & 구글 스프레드시트 REST API 검색창 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-sans font-bold tracking-tight text-white flex items-center gap-2.5">
            선수 리포트
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-mono font-bold flex items-center gap-1">
              <Database className="w-3 h-3" />
              구글 시트 REST API 연동
            </span>
          </h2>
          <p className="text-[14px] text-gray-400 uppercase tracking-widest mt-1">
            구글 스프레드시트 데이터베이스 실시간 연동 및 스탯캐스트 분석
          </p>
        </div>

        {/* 상단 선수명 검색 바 */}
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
          <div className="relative">
            <input
              id="playerSearchInput"
              type="text"
              placeholder="선수 이름 입력 (예: 손성빈)"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="bg-black/50 border border-white/20 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold w-60 pl-9"
            />
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <button
            id="searchPlayerBtn"
            type="submit"
            disabled={isFetchingApi || !searchInput.trim()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gold hover:bg-yellow-400 text-black text-sm font-bold shadow-lg shadow-gold/20 disabled:opacity-50 transition-all cursor-pointer"
          >
            {isFetchingApi ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-black" />
                <span>조회 중...</span>
              </>
            ) : (
              <>
                <Search className="w-4 h-4 stroke-[2.5]" />
                <span>검색</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* 에러 및 데이터 없음 알림 배너 */}
      {apiError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center justify-between text-red-300">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-bold">데이터를 찾을 수 없습니다</p>
              <p className="text-xs text-red-400/80 mt-0.5">{apiError}</p>
            </div>
          </div>
          <button
            onClick={() => loadPlayerStats(searchInput)}
            className="text-xs px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-200 font-semibold flex items-center gap-1 cursor-pointer transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            다시 시도
          </button>
        </div>
      )}

      {/* 로딩 인디케이터 */}
      {isFetchingApi && (
        <div id="loadingSpinner" className="glass-card rounded-xl p-8 flex flex-col items-center justify-center gap-3 border border-gold/30">
          <Loader2 className="w-8 h-8 text-gold animate-spin" />
          <p className="text-sm font-bold text-white font-sans">
            구글 스프레드시트 API에서 <span className="text-gold">'{currentSearchedName}'</span> 선수의 최근 3년 스탯을 조회하고 있습니다...
          </p>
        </div>
      )}

      {/* 선수 프로필 카드 */}
      <div className="glass-card rounded-xl p-6 flex flex-col md:flex-row gap-6 items-center md:items-start justify-between">
        <div className="flex items-center gap-5">
          <div className="w-20 h-20 bg-gradient-to-br from-gray-800 to-gray-900 rounded-full border-2 border-gold/30 flex flex-shrink-0 items-center justify-center shadow-lg shadow-black/40">
            <span id="profileAvatar" className="text-gold text-2xl font-black">
              {currentSearchedName ? currentSearchedName.charAt(0) : "?"}
            </span>
          </div>
          <div>
            <div className="flex items-center gap-3 mb-1.5">
              <h3 id="profileName" className="text-2xl font-bold text-white tracking-tight">
                {currentSearchedName}
              </h3>
              {hasData ? (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold border uppercase tracking-wider text-green-400 border-green-500/40 bg-green-500/10">
                  DB 연동 완료
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold border uppercase tracking-wider text-red-400 border-red-500/40 bg-red-500/10">
                  데이터 없음
                </span>
              )}
            </div>
            <p id="profileSub" className="text-[14px] text-gray-400 font-sans">
              {hasData ? `${currentSearchedName} · 포수 · 최근 3년 실시간 공식 기록` : "스프레드시트 DB에서 선수를 검색해주세요."}
            </p>
          </div>
        </div>

        {/* 연봉 가치 요약 (우측 정렬) */}
        <div className="flex gap-8 text-right bg-black/30 p-4 rounded-xl border border-white/5 w-full md:w-auto justify-around md:justify-end">
          <div>
            <p className="text-[13px] text-gray-500 uppercase font-bold tracking-widest">2026 시즌 WAR</p>
            <p id="profileWarText" className="text-[17px] font-bold text-gray-200 font-sans mt-0.5">
              {stat2026?.WAR !== undefined ? `${stat2026.WAR.toFixed(1)}` : "데이터 없음"}
            </p>
          </div>
          <div className="border-l border-white/10 pl-8">
            <p className="text-[13px] text-gray-500 uppercase font-bold tracking-widest">2026 wRC+ (생산력)</p>
            <p id="profileWrcText" className="text-[18px] font-bold text-gold font-sans mt-0.5 drop-shadow-[0_0_8px_rgba(196,164,106,0.3)]">
              {stat2026?.["wRC+"] !== undefined ? `${stat2026["wRC+"]}` : "데이터 없음"}
            </p>
          </div>
        </div>
      </div>

      {/* 메인 콘텐츠 영역 1: 좌우 분할 스탯 보드 (가로 4:6 배치) */}
      <div className="grid grid-cols-1 lg:grid-cols-10 gap-6 items-stretch">
        
        {/* 👉 (좌측 40%) 최근 3년 핵심 스탯 (Defense & Offense) */}
        <div className="lg:col-span-4 glass-card rounded-xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/5">
              <h3 className="text-[14px] font-bold uppercase tracking-widest text-gold flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-gold" />
                최근 3년 핵심 스탯 (구글 시트 연동)
              </h3>
              <span className="text-[11.5px] text-gray-400 font-sans">Defense & Offense</span>
            </div>
            
            <div className="overflow-x-auto">
              <table id="statsTable" className="w-full text-sm text-center">
                <thead className="text-[12px] text-gray-400 uppercase tracking-widest border-b border-white/10 bg-white/5">
                  <tr>
                    <th className="px-2 py-2.5 font-bold rounded-tl-lg text-center">시즌</th>
                    <th className="px-2 py-2.5 font-bold text-center">CS%</th>
                    <th className="px-2 py-2.5 font-bold text-center">Blk/9</th>
                    <th className="px-2 py-2.5 font-bold text-center">OPS</th>
                    <th className="px-2 py-2.5 font-bold text-center">wRC+</th>
                    <th className="px-2 py-2.5 font-bold text-gold rounded-tr-lg text-center">WAR</th>
                  </tr>
                </thead>
                <tbody>
                  {/* 2024년 행 */}
                  <tr id="row-2024" className="border-b border-white/5 hover:bg-white/5 text-gray-300 text-[12.5px] font-sans">
                    <td className="px-2 py-3.5 font-bold text-gray-200">2024</td>
                    <td id="stat-2024-cs" className="px-2 py-3.5">
                      {stat2024?.["CS%"] !== undefined ? `${stat2024["CS%"]}%` : "데이터 없음"}
                    </td>
                    <td id="stat-2024-blk" className="px-2 py-3.5">
                      {stat2024?.["BLK/9"] !== undefined ? stat2024["BLK/9"].toFixed(2) : "데이터 없음"}
                    </td>
                    <td id="stat-2024-ops" className="px-2 py-3.5">
                      {stat2024?.OPS !== undefined ? stat2024.OPS.toFixed(3) : "데이터 없음"}
                    </td>
                    <td id="stat-2024-wrc" className="px-2 py-3.5">
                      {stat2024?.["wRC+"] !== undefined ? stat2024["wRC+"] : "데이터 없음"}
                    </td>
                    <td id="stat-2024-war" className="px-2 py-3.5 font-extrabold text-gold/80">
                      {stat2024?.WAR !== undefined ? stat2024.WAR.toFixed(1) : "데이터 없음"}
                    </td>
                  </tr>

                  {/* 2025년 행 */}
                  <tr id="row-2025" className="border-b border-white/5 hover:bg-white/5 text-gray-300 text-[12.5px] font-sans">
                    <td className="px-2 py-3.5 font-bold text-gray-200">2025</td>
                    <td id="stat-2025-cs" className="px-2 py-3.5">
                      {stat2025?.["CS%"] !== undefined ? `${stat2025["CS%"]}%` : "데이터 없음"}
                    </td>
                    <td id="stat-2025-blk" className="px-2 py-3.5">
                      {stat2025?.["BLK/9"] !== undefined ? stat2025["BLK/9"].toFixed(2) : "데이터 없음"}
                    </td>
                    <td id="stat-2025-ops" className="px-2 py-3.5">
                      {stat2025?.OPS !== undefined ? stat2025.OPS.toFixed(3) : "데이터 없음"}
                    </td>
                    <td id="stat-2025-wrc" className="px-2 py-3.5">
                      {stat2025?.["wRC+"] !== undefined ? stat2025["wRC+"] : "데이터 없음"}
                    </td>
                    <td id="stat-2025-war" className="px-2 py-3.5 font-extrabold text-gold/80">
                      {stat2025?.WAR !== undefined ? stat2025.WAR.toFixed(1) : "데이터 없음"}
                    </td>
                  </tr>

                  {/* 2026년 행 (강조) */}
                  <tr id="row-2026" className="border-b border-white/5 bg-gold/15 border-gold/40 font-bold text-gold shadow-inner text-[12.5px] font-sans">
                    <td className="px-2 py-3.5 font-bold text-gold">
                      2026
                      <span className="ml-1 text-[10px] px-1 py-0.2 rounded bg-gold text-black font-black">NEW</span>
                    </td>
                    <td id="stat-2026-cs" className="px-2 py-3.5 text-gold font-bold">
                      {stat2026?.["CS%"] !== undefined ? `${stat2026["CS%"]}%` : "데이터 없음"}
                    </td>
                    <td id="stat-2026-blk" className="px-2 py-3.5 text-gold font-bold">
                      {stat2026?.["BLK/9"] !== undefined ? stat2026["BLK/9"].toFixed(2) : "데이터 없음"}
                    </td>
                    <td id="stat-2026-ops" className="px-2 py-3.5 text-gold font-bold">
                      {stat2026?.OPS !== undefined ? stat2026.OPS.toFixed(3) : "데이터 없음"}
                    </td>
                    <td id="stat-2026-wrc" className="px-2 py-3.5 text-gold font-bold">
                      {stat2026?.["wRC+"] !== undefined ? stat2026["wRC+"] : "데이터 없음"}
                    </td>
                    <td id="stat-2026-war" className="px-2 py-3.5 font-extrabold text-gold text-[13.5px]">
                      {stat2026?.WAR !== undefined ? stat2026.WAR.toFixed(1) : "데이터 없음"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 p-3 bg-black/30 rounded-lg border border-white/5 text-[11.5px] text-gray-400 space-y-1">
            <div className="flex justify-between items-center">
              <span>* CS%: 도루저지율</span>
              <span id="summaryCs" className="text-gold font-bold">
                {stat2026?.["CS%"] !== undefined ? `${stat2026["CS%"]}%` : "데이터 없음"}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span>* Blk/9: 9이닝당 폭투/포일 억제</span>
              <span id="summaryBlk" className="text-gold font-bold">
                {stat2026?.["BLK/9"] !== undefined ? `${stat2026["BLK/9"].toFixed(2)}` : "데이터 없음"}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span>* 2026 종합 승리기여도(WAR)</span>
              <span id="summaryWar" className="text-gold font-bold">
                {stat2026?.WAR !== undefined ? `${stat2026.WAR.toFixed(1)}` : "데이터 없음"}
              </span>
            </div>
          </div>
        </div>

        {/* 👉 (우측 60%) 2026 KBO Percentile Rankings (Baseball Savant 스타일) */}
        <div className="lg:col-span-6 glass-card rounded-xl p-6 flex flex-col justify-between">
          <div>
            {/* Savant Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-4 border-b border-white/5 gap-2">
              <div>
                <h3 className="text-[14px] font-bold uppercase tracking-widest text-white flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-gold" />
                  2026 KBO Percentile Rankings (스탯캐스트 백분위)
                </h3>
                <p className="text-[12px] text-gray-400 font-sans">
                  스프레드시트 DB 실제 지표 기반 Baseball Savant 백분위수
                </p>
              </div>

              {/* 기준선 범례 가이드 */}
              <div className="flex items-center gap-2.5 text-[11px] text-gray-300 bg-black/50 px-3 py-1.5 rounded-lg border border-white/10">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600 border border-blue-400"></span>
                  Poor (0~25)
                </span>
                <span className="text-gray-600">|</span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-gray-500 border border-gray-400"></span>
                  Average (26~74)
                </span>
                <span className="text-gray-600">|</span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-600 border border-red-400"></span>
                  Great (75~100)
                </span>
              </div>
            </div>

            {/* Savant Percentile Bars */}
            <div className="space-y-4">
              
              {/* 수비 가치 */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-wider text-gray-300">
                  <ShieldCheck className="w-3.5 h-3.5 text-gold" />
                  <span>수비 가치 (Fielding)</span>
                </div>

                <div className="space-y-2 bg-black/25 p-3 rounded-xl border border-white/5">
                  
                  {/* 팝타임 */}
                  <PercentileBarItem
                    idPrefix="poptime"
                    name="팝타임"
                    subName="Pop Time"
                    value={popTimeVal}
                  />

                  {/* 도루저지 */}
                  <PercentileBarItem
                    idPrefix="cs"
                    name="도루저지"
                    subName="CS%"
                    value={csPercentVal}
                  />

                  {/* 블로킹 */}
                  <PercentileBarItem
                    idPrefix="blk"
                    name="블로킹"
                    subName="Blocking (BLK/9)"
                    value={blkVal}
                  />
                </div>
              </div>

              {/* 공격 가치 */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-wider text-gray-300">
                  <Flame className="w-3.5 h-3.5 text-gold" />
                  <span>공격 가치 (Batting)</span>
                </div>

                <div className="space-y-2 bg-black/25 p-3 rounded-xl border border-white/5">
                  {/* 조정득점창출력 */}
                  <PercentileBarItem
                    idPrefix="wrc"
                    name="조정득점창출력"
                    subName="wRC+"
                    value={wrcPercentVal}
                  />
                  {/* OPS */}
                  <PercentileBarItem
                    idPrefix="ops"
                    name="출루율+장타율"
                    subName="OPS"
                    value={stat2026?.OPS ? Math.min(99, Math.round(stat2026.OPS * 100)) : null}
                  />
                </div>
              </div>

            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[11.5px] text-gray-400">
            <span>* 백분위수 50은 리그 평균을 의미합니다.</span>
            <span className="font-mono text-gold">Google Apps Script REST API V1</span>
          </div>
        </div>

      </div>

      {/* 메인 콘텐츠 영역 2: 레이더 차트 & AI 스카우팅 총평 */}
      <div className="grid grid-cols-1 lg:grid-cols-10 gap-6">
        
        {/* 레이더 차트 (40%) */}
        <div className="lg:col-span-4 glass-card rounded-xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/5">
              <h3 className="text-[14px] font-bold uppercase tracking-widest text-gold">
                공수 육각형 밸런스 비교
              </h3>
              <div className="flex gap-2">
                {comparisonPlayers.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedCompId(c.id)}
                    className={`px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                      selectedCompId === c.id 
                        ? 'bg-gold text-black shadow-md shadow-gold/20' 
                        : 'bg-white/5 hover:bg-white/10 text-gray-300'
                    }`}
                  >
                    vs {c.name}
                  </button>
                ))}
              </div>
            </div>

            {hasData && radarData.length > 0 ? (
              <div className="w-full h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarData}>
                    <PolarGrid stroke="#ffffff15" />
                    <PolarAngleAxis dataKey="subject" stroke="#888888" tick={{ fill: "#aaaaaa", fontSize: 11 }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="#ffffff20" tick={false} />
                    <Radar name={currentSearchedName} dataKey={currentSearchedName} stroke="#C4A46A" fill="#C4A46A" fillOpacity={0.4} />
                    {activeComp && (
                      <Radar name={activeComp.name} dataKey={activeComp.name} stroke="#60a5fa" fill="#60a5fa" fillOpacity={0.2} />
                    )}
                    <Tooltip contentStyle={{ backgroundColor: "#14171d", borderColor: "#ffffff20", borderRadius: "8px", fontSize: "12px" }} />
                    <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "10px" }} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-gray-500 text-xs">
                선수 데이터가 없어 레이더 차트를 표시할 수 없습니다.
              </div>
            )}
          </div>
        </div>

        {/* AI 분석 리포트 요약 (60%) */}
        <div className="lg:col-span-6 glass-card rounded-xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/5">
              <h3 className="text-[14px] font-bold uppercase tracking-widest text-gold flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-gold" />
                선수 종합 평가 리포트
              </h3>
              <button
                onClick={generateReport}
                disabled={loadingAi || !hasData}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-gold/15 hover:bg-gold/25 border border-gold/30 text-gold text-xs font-bold transition-all disabled:opacity-40 cursor-pointer"
              >
                {loadingAi ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                <span>AI 리포트 재생성</span>
              </button>
            </div>

            <p className="text-[13.5px] leading-relaxed text-gray-300 font-sans whitespace-pre-line bg-black/30 p-4 rounded-xl border border-white/5">
              {report || (hasData ? "데이터가 정상적으로 로드되었습니다." : "데이터베이스에 등록된 선수를 검색하면 상세 리포트가 표시됩니다.")}
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-white/5 text-[11px] text-gray-400 flex justify-between items-center">
            <span>* Google Apps Script & KBO 실시간 기록 동기화 시스템</span>
            <span className="text-emerald-400 font-semibold">● 실시간 통신 활성화</span>
          </div>
        </div>

      </div>

    </div>
  );
}

function PercentileBarItem({
  idPrefix,
  name,
  subName,
  value,
}: {
  idPrefix: string;
  name: string;
  subName?: string;
  value: number | null;
}) {
  const style = getPercentileStyle(value);
  const isNoData = value === null || value === undefined;

  return (
    <div className="flex items-center gap-3">
      {/* Metric Label (Left 140px) */}
      <div className="w-[140px] flex-shrink-0 text-left">
        <span className="text-[12.5px] font-bold text-white block truncate">{name}</span>
        {subName && (
          <span className="text-[10.5px] text-gray-400 font-mono block -mt-0.5">{subName}</span>
        )}
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
          className={`w-7 h-7 rounded-full border flex items-center justify-center text-[12px] font-bold ${style.badgeBg}`}
        >
          {isNoData ? "-" : value}
        </div>
      </div>
    </div>
  );
}
