import React, { useState, useEffect, useMemo, useRef } from "react";
import { 
  Search, 
  RefreshCw, 
  Sparkles, 
  ExternalLink, 
  Loader2, 
  Database,
  ArrowRight,
  Shield,
  Zap,
  TrendingUp,
  Activity,
  Flame,
  Award,
  Layers,
  ChevronDown,
  Key,
  Copy,
  Check,
  AlertCircle,
  ShieldAlert,
  FastForward
} from "lucide-react";
import { 
  Radar, 
  RadarChart, 
  PolarGrid, 
  PolarAngleAxis, 
  PolarRadiusAxis, 
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  Legend
} from "recharts";
import { fetchPlayerFromDatabase, GAS_DB_URL } from "../services/dbService";
import { 
  ApiPlayerStat, 
  KBO_TEAMS, 
  QUICK_SEARCH_PRESETS,
  PositionGroup, 
  detectPositionGroup, 
  getPositionGroupLabel,
  formatStatValue,
  POSITION_AXES,
  POSITION_COMP_PLAYERS,
  ALL_COMP_PLAYERS,
  CompPlayerDef,
  extractRawPlayerStatForAxis,
  normalizeRawToApiStat,
  extractHistoryFromRawItems
} from "../types";
import { PercentileBarItem } from "./PercentileBarItem";
import { SearchableCompSelect } from "./SearchableCompSelect";
import { ApiKeyModal } from "./ApiKeyModal";
import { generateAIReport, getStoredApiKey, hasApiKey } from "../services/geminiService";

interface PlayerReportProps {
  initialPlayerName?: string;
  initialTeam?: string;
}

/**
 * 레이더 차트 커스텀 툴팁
 */
const CustomRadarTooltip = ({ active, payload, currentSearchedName }: any) => {
  if (!active || !payload || !payload.length) return null;

  const currentItem = payload[0]?.payload;
  if (!currentItem) return null;

  return (
    <div className="bg-dark-card/95 backdrop-blur-md border border-white/20 p-3.5 rounded-xl shadow-2xl text-xs z-50 min-w-[200px]">
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10 font-bold">
        <span className="text-gold flex items-center gap-1.5 text-sm">
          <Activity className="w-3.5 h-3.5" />
          {currentItem.subject}
        </span>
        <span className="text-[10px] text-gray-400">포지션 최적화 지표</span>
      </div>

      <div className="space-y-2.5">
        {payload.map((entry: any, index: number) => {
          const playerName = entry.name;
          const isMain = entry.dataKey === currentSearchedName || index === 0;
          const rawFormatted = isMain ? currentItem._mainRawFormatted : currentItem._compRawFormatted;
          const score = typeof entry.value === "number" ? entry.value : 0;
          const color = isMain ? "#ffb700" : "#4dabf7";

          return (
            <div key={`radar-tt-${index}`} className="flex flex-col gap-0.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-bold" style={{ color }}>
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                  {playerName}
                </span>
                <span className={`font-extrabold text-[13.5px] ${rawFormatted === "데이터 없음" ? "text-gray-500 font-normal text-xs" : "text-white"}`}>
                  {rawFormatted || `${score}점`}
                </span>
              </div>
              <div className="flex justify-between text-[11px] text-gray-400 pl-4">
                <span>정규화 지수:</span>
                <span className="font-mono text-gray-200">{score} / 100</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default function PlayerReport({ initialPlayerName = "", initialTeam = "" }: PlayerReportProps) {
  // 검색창 입력 상태
  const [nameInput, setNameInput] = useState(initialPlayerName);
  const [teamInput, setTeamInput] = useState(initialTeam);

  // 현재 성공적으로 조회된 대상 메타 정보
  const [currentSearchedName, setCurrentSearchedName] = useState(initialPlayerName);
  const [currentSearchedTeam, setCurrentSearchedTeam] = useState(initialTeam);
  const [currentPosition, setCurrentPosition] = useState<string>("");

  // 실제 조회된 연도별 데이터
  const [stat2024, setStat2024] = useState<ApiPlayerStat | null>(null);
  const [stat2025, setStat2025] = useState<ApiPlayerStat | null>(null);
  const [stat2026, setStat2026] = useState<ApiPlayerStat | null>(null);

  // 검색 결과 여부 (초기화면 / 결과화면 조건부 렌더링용)
  const [hasData, setHasData] = useState<boolean>(false);

  // 상태 플래그
  const [isFetchingApi, setIsFetchingApi] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [selectedCompId, setSelectedCompId] = useState<string>("comp_kmh");

  // AI 리포트 및 Gemini API Key 연동 상태
  const [report, setReport] = useState<string>("");
  const [typedReport, setTypedReport] = useState<string>("");
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const [loadingAi, setLoadingAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // API Key 모달 상태
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [apiKeyWarning, setApiKeyWarning] = useState<string | null>(null);
  const [hasConfiguredKey, setHasConfiguredKey] = useState<boolean>(() => hasApiKey());

  const typingTimerRef = useRef<any>(null);

  // 컴포넌트 마운트 시 API Key 존재 여부 확인
  useEffect(() => {
    setHasConfiguredKey(hasApiKey());
  }, []);

  // 타이핑 애니메이션 실행 함수
  const startTypewriter = (fullText: string) => {
    if (typingTimerRef.current) {
      clearInterval(typingTimerRef.current);
    }
    setTypedReport("");
    setIsTyping(true);

    let index = 0;
    const step = 2; // 한 틱당 2자씩 출력
    const intervalMs = 25; // 25ms 간격

    typingTimerRef.current = setInterval(() => {
      index += step;
      if (index >= fullText.length) {
        setTypedReport(fullText);
        setIsTyping(false);
        clearInterval(typingTimerRef.current);
      } else {
        setTypedReport(fullText.slice(0, index));
      }
    }, intervalMs);
  };

  // 타이핑 즉시 완료
  const handleSkipTyping = () => {
    if (typingTimerRef.current) {
      clearInterval(typingTimerRef.current);
    }
    setTypedReport(report);
    setIsTyping(false);
  };

  // 리포트 텍스트 복사
  const handleCopyReport = async () => {
    const textToCopy = typedReport || report;
    if (!textToCopy) return;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error("클립보드 복사 실패:", e);
    }
  };

  // 선수 데이터 로드 함수
  const loadPlayerStats = async (targetName: string, targetTeam?: string) => {
    const trimmedName = targetName.trim();
    if (!trimmedName) {
      setApiError("선수명을 입력해주세요.");
      return;
    }

    setIsFetchingApi(true);
    setApiError(null);
    setCurrentSearchedName(trimmedName);
    if (targetTeam) setCurrentSearchedTeam(targetTeam);

    try {
      // 1. 공통 DB 서비스 호출 (history 배열 및 다양한 키 자동 정규화)
      const dbResult = await fetchPlayerFromDatabase(trimmedName, targetTeam);

      if (dbResult.success && dbResult.records && dbResult.records.length > 0) {
        const historyData = extractHistoryFromRawItems(dbResult.records, trimmedName);

        const d2024 = historyData.stat2024 || normalizeRawToApiStat(dbResult.stat2024, trimmedName);
        const d2025 = historyData.stat2025 || normalizeRawToApiStat(dbResult.stat2025, trimmedName);
        const d2026 = historyData.stat2026 || normalizeRawToApiStat(dbResult.stat2026, trimmedName);

        const activeRec = dbResult.stat2026 || dbResult.stat2025 || dbResult.stat2024 || dbResult.records[0];
        const resolvedTeam = activeRec.팀 || activeRec.구단 || activeRec.소속 || activeRec.team || historyData.resolvedTeam || dbResult.teamName || targetTeam || "KBO";
        const resolvedPos = activeRec.포지션 || activeRec.position || historyData.resolvedPosition || "포수";

        setStat2024(d2024);
        setStat2025(d2025);
        setStat2026(d2026);
        setCurrentSearchedTeam(resolvedTeam);
        setCurrentPosition(resolvedPos);
        setHasData(true);
        setReport(`Google 스프레드시트 DB로부터 '${resolvedTeam ? `${resolvedTeam} ` : ""}${trimmedName}' 선수의 포지션(${resolvedPos}) 및 3개년(2024~2026) 핵심 지표가 성공적으로 동기화되었습니다.`);
      } else {
        // 2. 직접 GAS URL로 2차 시도 (history 배열 파싱)
        const fallbackUrl = `${GAS_DB_URL}?name=${encodeURIComponent(trimmedName)}${targetTeam ? `&team=${encodeURIComponent(targetTeam)}` : ""}&t=${Date.now()}`;
        const res = await fetch(fallbackUrl);
        if (res.ok) {
          const json = await res.json();
          const items: any[] = Array.isArray(json?.data) 
            ? json.data 
            : (Array.isArray(json?.history) ? [json] : (Array.isArray(json) ? json : (json ? [json] : [])));
          
          const historyData = extractHistoryFromRawItems(items, trimmedName);

          if (historyData.stat2024 || historyData.stat2025 || historyData.stat2026) {
            const resolvedTeam = historyData.resolvedTeam || targetTeam || "KBO";
            const resolvedPos = historyData.resolvedPosition || "포수";

            setStat2024(historyData.stat2024);
            setStat2025(historyData.stat2025);
            setStat2026(historyData.stat2026);
            setCurrentSearchedTeam(resolvedTeam);
            setCurrentPosition(resolvedPos);
            setHasData(true);
            setReport(`Google 스프레드시트 DB로부터 '${resolvedTeam ? `${resolvedTeam} ` : ""}${trimmedName}' 선수의 포지션(${resolvedPos}) 및 3개년(2024~2026) 성적이 성공적으로 동기화되었습니다.`);
            return;
          }
        }

        // 최종 데이터 없음
        setStat2024(null);
        setStat2025(null);
        setStat2026(null);
        setHasData(false);
        setApiError(`구글 스프레드시트 DB에 '${targetTeam ? `${targetTeam} ` : ""}${trimmedName}' 선수의 데이터가 존재하지 않습니다.`);
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

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadPlayerStats(nameInput, teamInput);
  };

  const handleResetSearch = () => {
    setNameInput("");
    setTeamInput("");
    setHasData(false);
    setApiError(null);
    setStat2024(null);
    setStat2025(null);
    setStat2026(null);
    setCurrentSearchedName("");
    setCurrentSearchedTeam("");
    setCurrentPosition("");
    setReport("");
  };

  // 포지션 그룹 판별 (포수, 내야수, 외야수, 투수)
  const positionGroup = useMemo<PositionGroup>(() => {
    return detectPositionGroup(currentPosition);
  }, [currentPosition]);

  // 포지션별 비교 대상 선수 목록 (메인 선수 제외 필터링)
  const currentCompPlayers = useMemo(() => {
    const list = POSITION_COMP_PLAYERS[positionGroup] || POSITION_COMP_PLAYERS.catcher;
    const trimmedMain = (currentSearchedName || "").trim().toLowerCase();
    return list.filter(p => p.name.trim().toLowerCase() !== trimmedMain);
  }, [positionGroup, currentSearchedName]);

  // 포지션 그룹이나 메인 선수가 바뀌었을 때 적절한 비교 선수 자동 지정
  useEffect(() => {
    const trimmedMain = (currentSearchedName || "").trim().toLowerCase();
    const currentSelected = ALL_COMP_PLAYERS.find(p => p.id === selectedCompId);

    // 현재 선택된 비교 선수가 메인 선수와 같거나 유효하지 않은 경우
    if (!currentSelected || currentSelected.name.trim().toLowerCase() === trimmedMain) {
      const fallback = currentCompPlayers[0] || ALL_COMP_PLAYERS.find(p => p.name.trim().toLowerCase() !== trimmedMain);
      if (fallback) {
        setSelectedCompId(fallback.id);
      }
    }
  }, [positionGroup, currentCompPlayers, currentSearchedName, selectedCompId]);

  // 초기 파라미터가 있을 때만 자동 로드
  useEffect(() => {
    if (initialPlayerName) {
      loadPlayerStats(initialPlayerName, initialTeam);
    }
  }, []);

  // 최신 연도 기준 활성 데이터셋 (2026 -> 2025 -> 2024 순)
  const latestStat = useMemo(() => {
    return stat2026 || stat2025 || stat2024;
  }, [stat2026, stat2025, stat2024]);

  // 선택된 비교 선수 객체 (메인 선수와 중복 방지)
  const selectedCompPlayer = useMemo(() => {
    const trimmedMain = (currentSearchedName || "").trim().toLowerCase();
    let player = ALL_COMP_PLAYERS.find(p => p.id === selectedCompId) || currentCompPlayers[0];
    
    // 만약 여전히 메인 선수와 동일한 이름이면 다른 선수로 교체
    if (player && player.name.trim().toLowerCase() === trimmedMain) {
      player = currentCompPlayers.find(p => p.name.trim().toLowerCase() !== trimmedMain) || 
               ALL_COMP_PLAYERS.find(p => p.name.trim().toLowerCase() !== trimmedMain) || 
               player;
    }
    return player;
  }, [selectedCompId, currentCompPlayers, currentSearchedName]);

  // 레이더 차트 동적 6개 축 데이터 계산
  const radarChartData = useMemo(() => {
    const axes = POSITION_AXES[positionGroup] || POSITION_AXES.catcher;
    
    return axes.map(axis => {
      const mainRaw = extractRawPlayerStatForAxis(latestStat, axis.key);
      const compRaw = selectedCompPlayer?.stats?.[axis.key] ?? null;

      const mainScore = axis.calcScore(mainRaw);
      const compScore = axis.calcScore(compRaw);

      return {
        subject: axis.subject,
        key: axis.key,
        [currentSearchedName || "검색 선수"]: mainScore,
        [selectedCompPlayer?.name || "비교 선수"]: compScore,
        _mainRawFormatted: axis.formatRaw(mainRaw),
        _compRawFormatted: axis.formatRaw(compRaw),
        _axisConfig: axis
      };
    });
  }, [positionGroup, latestStat, selectedCompPlayer, currentSearchedName]);

  // AI 리포트 생성 핸들러 (Google Gemini 1.5 Flash 연동)
  const handleGenerateAiReport = async () => {
    if (!currentSearchedName) return;

    // 1. API Key 존재 여부 확인
    const currentApiKey = getStoredApiKey();
    if (!currentApiKey) {
      setApiKeyWarning("Gemini API Key를 먼저 설정해주세요.");
      setIsApiKeyModalOpen(true);
      return;
    }

    setLoadingAi(true);
    setAiError(null);
    setApiKeyWarning(null);

    try {
      // 2. 3개년 핵심 스탯 요약 객체 구성
      const historySummary: Record<string, any> = {};
      if (stat2024) {
        historySummary["2024시즌"] = {
          포지션: currentPosition || getPositionGroupLabel(positionGroup),
          팀: currentSearchedTeam,
          ...stat2024
        };
      }
      if (stat2025) {
        historySummary["2025시즌"] = {
          포지션: currentPosition || getPositionGroupLabel(positionGroup),
          팀: currentSearchedTeam,
          ...stat2025
        };
      }
      if (stat2026) {
        historySummary["2026시즌"] = {
          포지션: currentPosition || getPositionGroupLabel(positionGroup),
          팀: currentSearchedTeam,
          ...stat2026
        };
      }

      // 만약 3개년 스탯이 비어있다면 최신 스탯 반영
      if (Object.keys(historySummary).length === 0 && latestStat) {
        historySummary["최근시즌"] = latestStat;
      }

      // 3. Gemini API 호출
      const generatedBriefing = await generateAIReport({
        apiKey: currentApiKey,
        name: currentSearchedName,
        position: currentPosition || getPositionGroupLabel(positionGroup),
        team: currentSearchedTeam,
        history: historySummary,
        latestStat: latestStat
      });

      setReport(generatedBriefing);
      startTypewriter(generatedBriefing);
    } catch (err: any) {
      console.error("Gemini AI 리포트 생성 실패:", err);
      const errMsg = err.message || "연봉 협상 브리핑 생성 중 오류가 발생했습니다.";
      setAiError(errMsg);
      
      // API Key 유효성 오류인 경우 경고창 안내
      if (errMsg.includes("API Key") || errMsg.includes("API_KEY") || errMsg.includes("401") || errMsg.includes("403") || errMsg.includes("400")) {
        setApiKeyWarning("API Key가 올바르지 않거나 권한이 만료되었습니다. 키 설정을 다시 확인해주세요.");
      }
    } finally {
      setLoadingAi(false);
    }
  };

  /**
   * 포지션별 3개년 테이블 컬럼 헤더 및 셀 렌더러 정의
   */
  const renderTableColumns = () => {
    switch (positionGroup) {
      case "pitcher":
        return (
          <>
            <th className="py-2.5 px-3 text-center text-xs font-semibold text-gray-300">ERA</th>
            <th className="py-2.5 px-3 text-center text-xs font-semibold text-gray-300">FIP</th>
            <th className="py-2.5 px-3 text-center text-xs font-semibold text-gray-300">K/9</th>
            <th className="py-2.5 px-3 text-center text-xs font-semibold text-gray-300">BB/9</th>
            <th className="py-2.5 px-3 text-center text-xs font-semibold text-gold">LOB%</th>
            <th className="py-2.5 px-3 text-center text-xs font-semibold text-gold">IP (이닝)</th>
            <th className="py-2.5 px-3 text-center text-xs font-semibold text-emerald-400">WAR</th>
          </>
        );
      case "infield":
        return (
          <>
            <th className="py-2.5 px-3 text-center text-xs font-semibold text-gold">OPS</th>
            <th className="py-2.5 px-3 text-center text-xs font-semibold text-gray-300">wRC+</th>
            <th className="py-2.5 px-3 text-center text-xs font-semibold text-gray-300">ISO</th>
            <th className="py-2.5 px-3 text-center text-xs font-semibold text-gray-300">BB/K</th>
            <th className="py-2.5 px-3 text-center text-xs font-semibold text-gray-300">RF9</th>
            <th className="py-2.5 px-3 text-center text-xs font-semibold text-gray-300">DP (병살)</th>
            <th className="py-2.5 px-3 text-center text-xs font-semibold text-emerald-400">WAR</th>
          </>
        );
      case "outfield":
        return (
          <>
            <th className="py-2.5 px-3 text-center text-xs font-semibold text-gold">OPS</th>
            <th className="py-2.5 px-3 text-center text-xs font-semibold text-gray-300">wRC+</th>
            <th className="py-2.5 px-3 text-center text-xs font-semibold text-gray-300">ISO</th>
            <th className="py-2.5 px-3 text-center text-xs font-semibold text-gray-300">BB/K</th>
            <th className="py-2.5 px-3 text-center text-xs font-semibold text-gray-300">RF9</th>
            <th className="py-2.5 px-3 text-center text-xs font-semibold text-gray-300">보살 (A)</th>
            <th className="py-2.5 px-3 text-center text-xs font-semibold text-emerald-400">WAR</th>
          </>
        );
      case "catcher":
      default:
        return (
          <>
            <th className="py-2.5 px-3 text-center text-xs font-semibold text-gold">도루저지율 (CS%)</th>
            <th className="py-2.5 px-3 text-center text-xs font-semibold text-gray-300">블로킹 (PB/9)</th>
            <th className="py-2.5 px-3 text-center text-xs font-semibold text-gold">OPS</th>
            <th className="py-2.5 px-3 text-center text-xs font-semibold text-gray-300">wRC+</th>
            <th className="py-2.5 px-3 text-center text-xs font-semibold text-gray-300">수비 이닝</th>
            <th className="py-2.5 px-3 text-center text-xs font-semibold text-emerald-400">WAR</th>
          </>
        );
    }
  };

  const renderTableRowCells = (stat: ApiPlayerStat | null, yr: number) => {
    if (!stat) {
      const colCount = positionGroup === "pitcher" ? 7 : (positionGroup === "catcher" ? 6 : 7);
      return (
        <td colSpan={colCount} className="py-3 px-3 text-center text-xs text-gray-500 italic">
          {yr}시즌 기록 없음
        </td>
      );
    }

    if (positionGroup === "pitcher") {
      const era = formatStatValue(stat.ERA, "number2");
      const fip = formatStatValue(stat.FIP, "number2");
      const k9 = formatStatValue(stat["K/9"], "number2");
      const bb9 = formatStatValue(stat["BB/9"], "number2");
      const lob = formatStatValue(stat["LOB%"], "percent");
      const ip = formatStatValue(stat.IP, "number1");
      const war = formatStatValue(stat.WAR, "number2");

      return (
        <>
          <td className={`py-3 px-3 text-center text-xs font-mono ${era.isNoData ? "text-gray-500" : "text-white font-semibold"}`}>{era.text}</td>
          <td className={`py-3 px-3 text-center text-xs font-mono ${fip.isNoData ? "text-gray-500" : "text-gray-200"}`}>{fip.text}</td>
          <td className={`py-3 px-3 text-center text-xs font-mono ${k9.isNoData ? "text-gray-500" : "text-gray-200"}`}>{k9.text}</td>
          <td className={`py-3 px-3 text-center text-xs font-mono ${bb9.isNoData ? "text-gray-500" : "text-gray-200"}`}>{bb9.text}</td>
          <td className={`py-3 px-3 text-center text-xs font-mono font-bold ${lob.isNoData ? "text-gray-500 font-normal" : "text-gold"}`}>{lob.text}</td>
          <td className={`py-3 px-3 text-center text-xs font-mono font-bold ${ip.isNoData ? "text-gray-500 font-normal" : "text-gold"}`}>{ip.text}</td>
          <td className={`py-3 px-3 text-center text-xs font-mono font-extrabold ${war.isNoData ? "text-gray-500 font-normal" : "text-emerald-400"}`}>{war.text}</td>
        </>
      );
    }

    if (positionGroup === "infield") {
      const ops = formatStatValue(stat.OPS, "number3");
      const wrc = formatStatValue(stat["wRC+"], "integer");
      const iso = formatStatValue(stat.ISO, "number3");
      const bbk = formatStatValue(stat["BB/K"], "number2");
      const rf9 = formatStatValue(stat.RF9, "number2");
      const dp = formatStatValue(stat.DP, "integer");
      const war = formatStatValue(stat.WAR, "number2");

      return (
        <>
          <td className={`py-3 px-3 text-center text-xs font-mono font-bold ${ops.isNoData ? "text-gray-500 font-normal" : "text-gold"}`}>{ops.text}</td>
          <td className={`py-3 px-3 text-center text-xs font-mono ${wrc.isNoData ? "text-gray-500" : "text-gray-200"}`}>{wrc.text}</td>
          <td className={`py-3 px-3 text-center text-xs font-mono ${iso.isNoData ? "text-gray-500" : "text-gray-200"}`}>{iso.text}</td>
          <td className={`py-3 px-3 text-center text-xs font-mono ${bbk.isNoData ? "text-gray-500" : "text-gray-200"}`}>{bbk.text}</td>
          <td className={`py-3 px-3 text-center text-xs font-mono ${rf9.isNoData ? "text-gray-500" : "text-gray-200"}`}>{rf9.text}</td>
          <td className={`py-3 px-3 text-center text-xs font-mono ${dp.isNoData ? "text-gray-500" : "text-gray-200"}`}>{dp.text}</td>
          <td className={`py-3 px-3 text-center text-xs font-mono font-extrabold ${war.isNoData ? "text-gray-500 font-normal" : "text-emerald-400"}`}>{war.text}</td>
        </>
      );
    }

    if (positionGroup === "outfield") {
      const ops = formatStatValue(stat.OPS, "number3");
      const wrc = formatStatValue(stat["wRC+"], "integer");
      const iso = formatStatValue(stat.ISO, "number3");
      const bbk = formatStatValue(stat["BB/K"], "number2");
      const rf9 = formatStatValue(stat.RF9, "number2");
      const a = formatStatValue(stat.A, "integer");
      const war = formatStatValue(stat.WAR, "number2");

      return (
        <>
          <td className={`py-3 px-3 text-center text-xs font-mono font-bold ${ops.isNoData ? "text-gray-500 font-normal" : "text-gold"}`}>{ops.text}</td>
          <td className={`py-3 px-3 text-center text-xs font-mono ${wrc.isNoData ? "text-gray-500" : "text-gray-200"}`}>{wrc.text}</td>
          <td className={`py-3 px-3 text-center text-xs font-mono ${iso.isNoData ? "text-gray-500" : "text-gray-200"}`}>{iso.text}</td>
          <td className={`py-3 px-3 text-center text-xs font-mono ${bbk.isNoData ? "text-gray-500" : "text-gray-200"}`}>{bbk.text}</td>
          <td className={`py-3 px-3 text-center text-xs font-mono ${rf9.isNoData ? "text-gray-500" : "text-gray-200"}`}>{rf9.text}</td>
          <td className={`py-3 px-3 text-center text-xs font-mono ${a.isNoData ? "text-gray-500" : "text-gray-200"}`}>{a.text}</td>
          <td className={`py-3 px-3 text-center text-xs font-mono font-extrabold ${war.isNoData ? "text-gray-500 font-normal" : "text-emerald-400"}`}>{war.text}</td>
        </>
      );
    }

    // 포수 (기본)
    const cs = formatStatValue(stat["CS%"], "percent");
    const blk = formatStatValue(stat["PB/9"] ?? stat["BLK/9"], "number2");
    const ops = formatStatValue(stat.OPS, "number3");
    const wrc = formatStatValue(stat["wRC+"], "integer");
    const ip = formatStatValue(stat.IP, "number1");
    const war = formatStatValue(stat.WAR, "number2");

    return (
      <>
        <td className={`py-3 px-3 text-center text-xs font-mono font-bold ${cs.isNoData ? "text-gray-500 font-normal" : "text-gold"}`}>
          {cs.text}
        </td>
        <td className={`py-3 px-3 text-center text-xs font-mono ${blk.isNoData ? "text-gray-500" : "text-gray-200"}`}>
          {blk.text}
        </td>
        <td className={`py-3 px-3 text-center text-xs font-mono font-bold ${ops.isNoData ? "text-gray-500 font-normal" : "text-gold"}`}>
          {ops.text}
        </td>
        <td className={`py-3 px-3 text-center text-xs font-mono ${wrc.isNoData ? "text-gray-500" : "text-gray-200"}`}>
          {wrc.text}
        </td>
        <td className={`py-3 px-3 text-center text-xs font-mono ${ip.isNoData ? "text-gray-500" : "text-gray-200"}`}>
          {ip.text}
        </td>
        <td className={`py-3 px-3 text-center text-xs font-mono font-extrabold ${war.isNoData ? "text-gray-500 font-normal" : "text-emerald-400"}`}>
          {war.text}
        </td>
      </>
    );
  };

  /**
   * 유효한 스탯 수치인지 확인 (0, 0.00, null, undefined, 빈 문자열, NaN 제외)
   */
  const isValidStatNumber = (val: any): boolean => {
    if (val === undefined || val === null || val === "" || val === "-") return false;
    const num = typeof val === "number" ? val : parseFloat(String(val).replace(/[^0-9.-]/g, ""));
    if (isNaN(num)) return false;
    if (Math.abs(num) < 0.0001) return false; // 0 또는 0.00은 데이터 없음으로 예외 처리
    return true;
  };

  /**
   * 포지션별 스탯캐스트 백분위수 항목 렌더러
   */
  const renderStatcastPercentiles = () => {
    if (positionGroup === "pitcher") {
      const eraVal = latestStat?.ERA;
      const hasEra = isValidStatNumber(eraVal);
      const eraPct = hasEra ? Math.min(99, Math.max(1, Math.round((1 - (eraVal! - 2.0) / 4.5) * 100))) : null;
      const eraRaw = hasEra ? `${eraVal!.toFixed(2)}` : undefined;

      const fipVal = latestStat?.FIP;
      const hasFip = isValidStatNumber(fipVal);
      const fipPct = hasFip ? Math.min(99, Math.max(1, Math.round((1 - (fipVal! - 2.2) / 4.5) * 100))) : null;
      const fipRaw = hasFip ? `${fipVal!.toFixed(2)}` : undefined;

      const k9Val = latestStat?.["K/9"];
      const hasK9 = isValidStatNumber(k9Val);
      const k9Pct = hasK9 ? Math.min(99, Math.max(1, Math.round((k9Val! / 12.0) * 100))) : null;
      const k9Raw = hasK9 ? `${k9Val!.toFixed(2)}` : undefined;

      const bb9Val = latestStat?.["BB/9"];
      const hasBb9 = isValidStatNumber(bb9Val);
      const bb9Pct = hasBb9 ? Math.min(99, Math.max(1, Math.round((1 - (bb9Val! - 1.0) / 4.0) * 100))) : null;
      const bb9Raw = hasBb9 ? `${bb9Val!.toFixed(2)}` : undefined;

      const lobVal = latestStat?.["LOB%"];
      const hasLob = isValidStatNumber(lobVal);
      let lobPct: number | null = null;
      let lobRaw: string | undefined = undefined;
      if (hasLob) {
        const val = lobVal! > 1 ? lobVal! : lobVal! * 100;
        lobPct = Math.min(99, Math.max(1, Math.round(((val - 55) / 35) * 100)));
        lobRaw = `${val.toFixed(1)}%`;
      }

      const warVal = latestStat?.WAR;
      const hasWar = isValidStatNumber(warVal);
      const warPct = hasWar ? Math.min(99, Math.max(1, Math.round((warVal! / 6.0) * 100))) : null;
      const warRaw = hasWar ? `${warVal!.toFixed(2)}` : undefined;

      return (
        <>
          {/* Pitching Metrics */}
          <div className="space-y-3.5">
            <div className="flex items-center gap-2 pb-1 border-b border-white/10">
              <Activity className="w-4 h-4 text-rose-400" />
              <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">구위 및 제구 분석 (Pitching Metrics)</span>
            </div>
            
            <div className="space-y-2.5">
              <PercentileBarItem 
                idPrefix="statcast-k9"
                name="탈삼진율 (K/9)" 
                subName="Strikeout Rate" 
                value={k9Pct} 
                rawDisplay={k9Raw} 
              />
              <PercentileBarItem 
                idPrefix="statcast-bb9"
                name="볼넷 억제율 (BB/9)" 
                subName="Walk Prevention" 
                value={bb9Pct} 
                rawDisplay={bb9Raw} 
              />
              <PercentileBarItem 
                idPrefix="statcast-lob"
                name="잔루 처리율 (LOB%)" 
                subName="Left On Base %" 
                value={lobPct} 
                rawDisplay={lobRaw} 
              />
            </div>
          </div>

          {/* Run Prevention & Value */}
          <div className="space-y-3.5">
            <div className="flex items-center gap-2 pb-1 border-b border-white/10">
              <Shield className="w-4 h-4 text-blue-400" />
              <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">실점 억제 및 종합 기여도</span>
            </div>

            <div className="space-y-2.5">
              <PercentileBarItem 
                idPrefix="statcast-era"
                name="평균자책점 (ERA)" 
                subName="Earned Run Avg" 
                value={eraPct} 
                rawDisplay={eraRaw} 
              />
              <PercentileBarItem 
                idPrefix="statcast-fip"
                name="수비무관 평자 (FIP)" 
                subName="Fielding Ind. Pitching" 
                value={fipPct} 
                rawDisplay={fipRaw} 
              />
              <PercentileBarItem 
                idPrefix="statcast-war"
                name="종합 승리 기여도 (WAR)" 
                subName="Wins Above Replacement" 
                value={warPct} 
                rawDisplay={warRaw} 
              />
            </div>
          </div>
        </>
      );
    }

    // 타자 / 야수 공통 (포수, 내야수, 외야수)
    const opsVal = latestStat?.OPS;
    const hasOps = isValidStatNumber(opsVal);
    const opsPct = hasOps ? Math.min(99, Math.max(1, Math.round(((opsVal! - 0.55) / 0.50) * 100))) : null;
    const opsRaw = hasOps ? opsVal!.toFixed(3) : undefined;

    const wrcVal = latestStat?.["wRC+"];
    const hasWrc = isValidStatNumber(wrcVal);
    const wrcPct = hasWrc ? Math.min(99, Math.max(1, Math.round(((wrcVal! - 60) / 100) * 100))) : null;
    const wrcRaw = hasWrc ? `${Math.round(wrcVal!)}` : undefined;

    const isoVal = latestStat?.ISO;
    const hasIso = isValidStatNumber(isoVal);
    const isoPct = hasIso ? Math.min(99, Math.max(1, Math.round((isoVal! / 0.350) * 100))) : null;
    const isoRaw = hasIso ? isoVal!.toFixed(3) : undefined;

    const warVal = latestStat?.WAR;
    const hasWar = isValidStatNumber(warVal);
    const warPct = hasWar ? Math.min(99, Math.max(1, Math.round((warVal! / 6.0) * 100))) : null;
    const warRaw = hasWar ? `${warVal!.toFixed(2)}` : undefined;

    // 수비 지표는 포지션별 분기
    let def1Name = "수비 범위 (RF9)";
    let def1Sub = "Range Factor";
    let def1Pct: number | null = null;
    let def1Raw: string | undefined = undefined;

    let def2Name = "수비 기여도";
    let def2Sub = "Defense Score";
    let def2Pct: number | null = null;
    let def2Raw: string | undefined = undefined;

    if (positionGroup === "catcher") {
      def1Name = "도루 저지율 (CS%)";
      def1Sub = "Caught Stealing %";
      const csVal = latestStat?.["CS%"];
      if (isValidStatNumber(csVal)) {
        const val = csVal! > 1 ? csVal! : csVal! * 100;
        def1Pct = Math.min(99, Math.max(1, Math.round((val / 60) * 100)));
        def1Raw = `${val.toFixed(1)}%`;
      }

      def2Name = "팝타임 (Pop Time)";
      def2Sub = "2B Throw Time";
      const popVal = latestStat?.["팝타임"];
      if (isValidStatNumber(popVal)) {
        def2Pct = Math.min(99, Math.max(1, Math.round((1 - (popVal! - 1.85) / 0.35) * 100)));
        def2Raw = `${popVal!.toFixed(2)}초`;
      } else {
        def2Name = "블로킹율 (PB/9)";
        def2Sub = "Passed Balls / 9";
        const pbVal = latestStat?.["PB/9"] ?? latestStat?.["BLK/9"];
        if (isValidStatNumber(pbVal)) {
          def2Pct = Math.min(99, Math.max(1, Math.round((1 - Math.min(1, Math.max(0, pbVal!))) * 100)));
          def2Raw = `${pbVal!.toFixed(2)}`;
        }
      }
    } else if (positionGroup === "infield") {
      const rfVal = latestStat?.RF9;
      if (isValidStatNumber(rfVal)) {
        def1Pct = Math.min(99, Math.max(1, Math.round((rfVal! / 6.0) * 100)));
        def1Raw = `${rfVal!.toFixed(2)}`;
      }

      def2Name = "병살 처리 (DP)";
      def2Sub = "Double Plays Turned";
      const dpVal = latestStat?.DP;
      if (isValidStatNumber(dpVal)) {
        def2Pct = Math.min(99, Math.max(1, Math.round((dpVal! / 110) * 100)));
        def2Raw = `${Math.round(dpVal!)}개`;
      }
    } else {
      // outfield
      const rfVal = latestStat?.RF9;
      if (isValidStatNumber(rfVal)) {
        def1Pct = Math.min(99, Math.max(1, Math.round((rfVal! / 3.0) * 100)));
        def1Raw = `${rfVal!.toFixed(2)}`;
      }

      def2Name = "외야 보살 (Assists)";
      def2Sub = "Outfield Assists";
      const aVal = latestStat?.A;
      if (isValidStatNumber(aVal)) {
        def2Pct = Math.min(99, Math.max(1, Math.round((aVal! / 15) * 100)));
        def2Raw = `${Math.round(aVal!)}개`;
      }
    }

    return (
      <>
        {/* Batting Metrics */}
        <div className="space-y-3.5">
          <div className="flex items-center gap-2 pb-1 border-b border-white/10">
            <Flame className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">타격 세부 지표 (Batting Metrics)</span>
          </div>

          <div className="space-y-2.5">
            <PercentileBarItem 
              idPrefix="statcast-ops"
              name="출루율+장타율 (OPS)" 
              subName="On-Base Plus Slugging" 
              value={opsPct} 
              rawDisplay={opsRaw} 
            />
            <PercentileBarItem 
              idPrefix="statcast-wrc"
              name="조정 득점창출력 (wRC+)" 
              subName="Weighted Runs Created+" 
              value={wrcPct} 
              rawDisplay={wrcRaw} 
            />
            <PercentileBarItem 
              idPrefix="statcast-iso"
              name="순수 장타율 (ISO)" 
              subName="Isolated Power" 
              value={isoPct} 
              rawDisplay={isoRaw} 
            />
          </div>
        </div>

        {/* Fielding & 종합 */}
        <div className="space-y-3.5">
          <div className="flex items-center gap-2 pb-1 border-b border-white/10">
            <Shield className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">수비 및 종합 가치 (Fielding & Value)</span>
          </div>

          <div className="space-y-2.5">
            <PercentileBarItem 
              idPrefix="statcast-def1"
              name={def1Name} 
              subName={def1Sub} 
              value={def1Pct} 
              rawDisplay={def1Raw} 
            />
            <PercentileBarItem 
              idPrefix="statcast-def2"
              name={def2Name} 
              subName={def2Sub} 
              value={def2Pct} 
              rawDisplay={def2Raw} 
            />
            <PercentileBarItem 
              idPrefix="statcast-war"
              name="대체선수대비 승리기여 (WAR)" 
              subName="Wins Above Replacement" 
              value={warPct} 
              rawDisplay={warRaw} 
            />
          </div>
        </div>
      </>
    );
  };

  return (
    <div className="w-full h-full overflow-y-auto bg-dark-main text-white font-sans selection:bg-gold/30 selection:text-gold p-4 md:p-8 flex flex-col items-center custom-scrollbar">
      
      {/* 1. 상단 타이틀 & 헤더 (KBO 선수 분석 시스템) */}
      <header className="w-full max-w-6xl mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-gold to-amber-600 flex items-center justify-center shadow-lg shadow-gold/20">
              <Zap className="w-5 h-5 text-black font-extrabold" />
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
              KBO 선수 심층 데이터 리포트
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-gold/15 text-gold border border-gold/30 font-semibold tracking-normal">
                v2.5 Dynamic
              </span>
            </h1>
          </div>
          <p className="text-xs md:text-sm text-gray-400 mt-1">
            Google 스프레드시트 실시간 연동 • 포지션 자동 판별 및 스탯캐스트 백분위 다이내믹 시각화
          </p>
        </div>

        {/* 상단 컨트롤 버튼 (API Key 설정 & 새로운 선수 검색) */}
        <div className="flex items-center gap-2 self-start md:self-auto">
          <button
            id="btn-open-api-key-modal"
            onClick={() => {
              setApiKeyWarning(null);
              setIsApiKeyModalOpen(true);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
              hasConfiguredKey
                ? "bg-gold/10 hover:bg-gold/20 text-gold border-gold/30 shadow-sm shadow-gold/10"
                : "bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 hover:text-amber-200 border-amber-500/30"
            }`}
            title="Google Gemini API Key 설정"
          >
            <Key className="w-3.5 h-3.5" />
            <span>API Key 설정</span>
            {hasConfiguredKey ? (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block ml-0.5" title="API Key 등록 완료" />
            ) : (
              <span className="text-[10px] px-1 py-0.2 rounded bg-amber-500/30 text-amber-300 font-mono">미등록</span>
            )}
          </button>

          {hasData && (
            <button
              id="btn-reset-search"
              onClick={handleResetSearch}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-white/10 text-xs transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>새로운 선수 검색</span>
            </button>
          )}
        </div>
      </header>

      {/* 2. 검색 중심 인풋 카드 (초기에는 메인 중앙에 크게, 검색 후에는 상단 바 형태로 표시) */}
      <div className={`w-full max-w-6xl transition-all duration-500 ${!hasData ? "my-8 md:my-16" : "mb-6"}`}>
        <div className={`bg-dark-card border border-white/10 rounded-2xl p-5 md:p-8 shadow-2xl relative overflow-hidden ${!hasData ? "max-w-2xl mx-auto border-gold/30 ring-1 ring-gold/20 shadow-gold/5" : ""}`}>
          
          {!hasData && (
            <div className="text-center mb-6">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-gold/10 border border-gold/30 flex items-center justify-center mb-3">
                <Search className="w-7 h-7 text-gold" />
              </div>
              <h2 className="text-xl md:text-2xl font-bold text-white">선수 데이터베이스 검색</h2>
              <p className="text-xs md:text-sm text-gray-400 mt-1">
                선수 이름과 구단을 입력하여 3개년 스탯, 스탯캐스트 백분위, 육각형 레이더 차트를 조회하세요.
              </p>
            </div>
          )}

          <form onSubmit={handleSearchSubmit} className="flex flex-col md:flex-row gap-3">
            <div className="flex-1 relative">
              <input
                id="search-player-name"
                type="text"
                placeholder="선수명 입력 (예: 손성빈, 김도영, 원태인, 구자욱)"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                className="w-full h-12 bg-black/40 border border-white/15 focus:border-gold focus:ring-1 focus:ring-gold rounded-xl px-4 pl-11 text-sm text-white placeholder-gray-500 outline-none transition-all"
              />
              <Search className="w-5 h-5 text-gray-400 absolute left-3.5 top-3.5" />
            </div>

            <div className="w-full md:w-48 relative">
              <select
                id="search-player-team"
                value={teamInput}
                onChange={(e) => setTeamInput(e.target.value)}
                className="w-full h-12 bg-black/40 border border-white/15 focus:border-gold focus:ring-1 focus:ring-gold rounded-xl px-3 text-sm text-white outline-none transition-all appearance-none cursor-pointer pr-9"
              >
                <option value="" className="bg-dark-card text-gray-400">구단 전체 선택 (선택)</option>
                {KBO_TEAMS.map((tm) => (
                  <option key={tm} value={tm} className="bg-dark-card text-white">
                    {tm}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-4 pointer-events-none" />
            </div>

            <button
              id="btn-search-player"
              type="submit"
              disabled={isFetchingApi || !nameInput.trim()}
              className="h-12 px-6 bg-gradient-to-r from-gold to-amber-500 hover:from-amber-400 hover:to-gold text-black font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-gold/20 hover:shadow-gold/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
            >
              {isFetchingApi ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>DB 동기화 중...</span>
                </>
              ) : (
                <>
                  <span>리포트 조회</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* 에러 메시지 알림 */}
          {apiError && (
            <div className="mt-4 p-3.5 rounded-xl bg-red-950/50 border border-red-800/50 text-red-200 text-xs flex items-center justify-between">
              <span>{apiError}</span>
              <button onClick={() => setApiError(null)} className="text-red-400 hover:text-white font-bold ml-2">✕</button>
            </div>
          )}

          {/* 추천 프리셋 버튼 (빠른 조회) */}
          <div className="mt-5 pt-4 border-t border-white/5 flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-400 mr-1 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-gold" /> 추천 포지션 프리셋:
            </span>
            {QUICK_SEARCH_PRESETS.map((preset) => (
              <button
                key={`${preset.name}-${preset.pos}`}
                id={`preset-${preset.name}`}
                type="button"
                onClick={() => {
                  setNameInput(preset.name);
                  setTeamInput(preset.team);
                  loadPlayerStats(preset.name, preset.team);
                }}
                className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/15 border border-white/10 text-xs text-gray-300 hover:text-gold transition-colors flex items-center gap-1.5"
              >
                <span className="font-semibold text-white">{preset.name}</span>
                <span className="text-[10px] text-gray-400">({preset.label})</span>
              </button>
            ))}
          </div>

        </div>
      </div>

      {/* 3. 조건부 렌더링 영역: 데이터가 로드되었을 때만 상세 리포트 컴포넌트 렌더링 */}
      {hasData && (
        <div className="w-full max-w-6xl space-y-6 animate-fadeIn">

          {/* (A) 선수 프로필 헤더 카드 */}
          <div className="bg-dark-card border border-white/10 rounded-2xl p-6 shadow-xl relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-gold/30 to-amber-600/30 border border-gold/40 flex items-center justify-center text-gold text-2xl font-black shadow-inner">
                {currentSearchedName.slice(0, 1)}
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <h2 className="text-2xl font-extrabold text-white">{currentSearchedName}</h2>
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-md bg-gold text-black">
                    {currentSearchedTeam || "KBO"}
                  </span>
                  <span className="text-xs px-2.5 py-0.5 rounded-md bg-white/10 text-gray-300 border border-white/10">
                    {currentPosition || getPositionGroupLabel(positionGroup)}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-400 mt-1">
                  <span className="flex items-center gap-1">
                    <Layers className="w-3.5 h-3.5 text-gold" />
                    포지션 그룹: <strong className="text-gray-200">{getPositionGroupLabel(positionGroup)}</strong>
                  </span>
                  <span>•</span>
                  <span>최신 시즌: <strong className="text-gray-200">{latestStat?.연도 || 2026}년</strong></span>
                </div>
              </div>
            </div>

            {/* 주요 하이라이트 배지 */}
            <div className="flex items-center gap-3 self-start md:self-auto bg-black/40 px-4 py-2.5 rounded-xl border border-white/5">
              <div className="text-right">
                <div className="text-[10px] text-gray-400 uppercase tracking-wider">포지션 최적화 모드</div>
                <div className="text-xs font-bold text-gold flex items-center gap-1">
                  <Shield className="w-3.5 h-3.5" />
                  {getPositionGroupLabel(positionGroup)} 맞춤형 분석
                </div>
              </div>
            </div>
          </div>

          {/* (B) 최근 3개년 핵심 스탯 테이블 (포지션 동적 헤더 및 CS% 0 예외처리) */}
          <div className="bg-dark-card border border-white/10 rounded-2xl p-5 md:p-6 shadow-xl">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-white/10">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-gold" />
                <h3 className="text-base font-bold text-white">최근 3년 핵심 스탯 추이 (2024 ~ 2026)</h3>
              </div>
              <span className="text-xs text-gray-400 font-mono">* 구글 스프레드시트 DB 실시간 추출값</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.02]">
                    <th className="py-2.5 px-3 text-center text-xs font-semibold text-gray-400">시즌</th>
                    <th className="py-2.5 px-3 text-center text-xs font-semibold text-gray-400">소속 구단</th>
                    {renderTableColumns()}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {/* 2024년 */}
                  <tr className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-3 text-center text-xs font-mono font-bold text-gray-300">2024</td>
                    <td className="py-3 px-3 text-center text-xs text-gray-300">{stat2024?.팀 || stat2024?.구단 || currentSearchedTeam || "-"}</td>
                    {renderTableRowCells(stat2024, 2024)}
                  </tr>
                  {/* 2025년 */}
                  <tr className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-3 text-center text-xs font-mono font-bold text-gray-300">2025</td>
                    <td className="py-3 px-3 text-center text-xs text-gray-300">{stat2025?.팀 || stat2025?.구단 || currentSearchedTeam || "-"}</td>
                    {renderTableRowCells(stat2025, 2025)}
                  </tr>
                  {/* 2026년 (최신) */}
                  <tr className="hover:bg-white/[0.02] transition-colors bg-gold/[0.04]">
                    <td className="py-3 px-3 text-center text-xs font-mono font-bold text-gold">2026 (Live)</td>
                    <td className="py-3 px-3 text-center text-xs text-white font-medium">{stat2026?.팀 || stat2026?.구단 || currentSearchedTeam || "-"}</td>
                    {renderTableRowCells(stat2026, 2026)}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* (C) 스탯캐스트 백분위수 (MLB Savant 스타일 Bar) */}
          <div className="bg-dark-card border border-white/10 rounded-2xl p-5 md:p-6 shadow-xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between pb-3 mb-5 border-b border-white/10 gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <Award className="w-5 h-5 text-gold" />
                  <h3 className="text-base font-bold text-white">
                    스탯캐스트 백분위수 분석 ({latestStat?.연도 || 2026}시즌)
                  </h3>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  리그 전체 기준 상위 백분위(Percentile) 등급 시각화 (KBO 및 MLB Savant 표준 모델)
                </p>
              </div>

              {/* 범례 */}
              <div className="flex items-center gap-3 text-[11px] text-gray-400">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-600" />
                  상위 (75~99%)
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-gray-500" />
                  평균 (26~74%)
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                  하위 (1~25%)
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
              {renderStatcastPercentiles()}
            </div>
          </div>

          {/* (D) 하단: 공수 육각형 밸런스 비교 (레이더 차트) & AI 스카우팅 총평 */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* 레이더 차트 (7컬럼) */}
            <div className="lg:col-span-7 bg-dark-card border border-white/10 rounded-2xl p-5 md:p-6 shadow-xl flex flex-col">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-3 border-b border-white/10 gap-2">
                <div className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-gold" />
                  <h3 className="text-base font-bold text-white">공수 밸런스 비교 레이더 차트</h3>
                </div>

                {/* 포지션별 비교 대상 선수 검색/선택 드롭다운 */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">비교 대상:</span>
                  <SearchableCompSelect
                    selectedCompId={selectedCompId}
                    onSelectCompPlayer={(player) => setSelectedCompId(player.id)}
                    currentMainPlayerName={currentSearchedName}
                    positionGroup={positionGroup}
                    currentSearchedTeam={currentSearchedTeam}
                  />
                </div>
              </div>

              {/* 차트 영역 */}
              <div className="w-full h-[320px] md:h-[350px] relative flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarChartData} margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
                    <PolarGrid stroke="#ffffff" strokeOpacity={0.12} />
                    <PolarAngleAxis 
                      dataKey="subject" 
                      tick={{ fill: "#d1d5db", fontSize: 11, fontWeight: 600 }} 
                    />
                    <PolarRadiusAxis 
                      angle={90} 
                      domain={[0, 100]} 
                      tick={{ fill: "#6b7280", fontSize: 9 }} 
                      stroke="#ffffff" 
                      strokeOpacity={0.08}
                    />
                    <RechartsTooltip 
                      content={<CustomRadarTooltip currentSearchedName={currentSearchedName} />} 
                    />
                    
                    {/* 메인 선수 레이더 (골드) */}
                    <Radar
                      name={currentSearchedName || "검색 선수"}
                      dataKey={currentSearchedName || "검색 선수"}
                      stroke="#ffb700"
                      fill="#ffb700"
                      fillOpacity={0.35}
                      strokeWidth={2.5}
                    />

                    {/* 비교 선수 레이더 (블루) */}
                    <Radar
                      name={selectedCompPlayer?.name || "비교 선수"}
                      dataKey={selectedCompPlayer?.name || "비교 선수"}
                      stroke="#4dabf7"
                      fill="#4dabf7"
                      fillOpacity={0.25}
                      strokeWidth={2}
                    />

                    <Legend 
                      wrapperStyle={{ paddingTop: "10px", fontSize: "12px" }}
                      formatter={(val, entry: any) => (
                        <span style={{ color: entry.color, fontWeight: "bold" }}>{val}</span>
                      )}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-2 text-center text-[11px] text-gray-400">
                * 각 지표는 KBO 포지션별 표준 기준치 대비 0~100 스케일로 환산된 정규화 지수입니다.
              </div>
            </div>

            {/* AI 스카우팅 총평 리포트 (5컬럼) */}
            <div className="lg:col-span-5 bg-dark-card border border-white/10 rounded-2xl p-5 md:p-6 shadow-xl flex flex-col justify-between relative overflow-hidden">
              <div>
                {/* 헤더 */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-4 border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-gold animate-pulse" />
                    <div>
                      <h3 className="text-base font-bold text-white flex items-center gap-2">
                        AI 스카우팅 심층 리포트
                        <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30">
                          Gemini 3.5 Flash
                        </span>
                      </h3>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* 타이핑 중일 때 즉시 완료 버튼 */}
                    {isTyping && (
                      <button
                        onClick={handleSkipTyping}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-white/10 text-[11px] transition-colors"
                        title="타이핑 즉시 완료"
                      >
                        <FastForward className="w-3 h-3 text-gold" />
                        <span>전체보기</span>
                      </button>
                    )}

                    {/* API Key 설정 바로가기 */}
                    <button
                      onClick={() => {
                        setApiKeyWarning(null);
                        setIsApiKeyModalOpen(true);
                      }}
                      className={`p-1.5 rounded-lg border text-xs transition-colors ${
                        hasConfiguredKey 
                          ? "bg-white/5 hover:bg-white/10 text-gray-300 hover:text-gold border-white/10" 
                          : "bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30"
                      }`}
                      title={hasConfiguredKey ? "Gemini API Key 변경" : "Gemini API Key 설정 필요"}
                    >
                      <Key className="w-3.5 h-3.5" />
                    </button>

                    {/* 리포트 재생성 버튼 */}
                    <button
                      id="btn-regenerate-ai-report"
                      onClick={handleGenerateAiReport}
                      disabled={loadingAi}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-gold to-amber-500 hover:from-amber-400 hover:to-gold text-black text-xs font-bold shadow-md shadow-gold/10 transition-all disabled:opacity-50"
                    >
                      {loadingAi ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-black stroke-[3]" />
                          <span>분석 및 생성 중...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5 text-black" />
                          <span>AI 리포트 재생성</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* 본문 영역 */}
                <div className="relative min-h-[140px]">
                  {/* 1. 로딩 상태 */}
                  {loadingAi && (
                    <div className="p-6 rounded-xl bg-black/40 border border-gold/20 flex flex-col items-center justify-center text-center space-y-3 animate-pulse">
                      <div className="relative">
                        <div className="w-10 h-10 rounded-full border-2 border-gold/20 border-t-gold animate-spin" />
                        <Sparkles className="w-4 h-4 text-gold absolute inset-0 m-auto" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gold">
                          Gemini 3.5 Flash가 데이터를 분석하여 연봉 협상 브리핑을 작성 중입니다...
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          {currentSearchedName} 선수의 포지션 및 3개년 세이버매트릭스 지표 기반 구단 설득 논리 생성 중
                        </p>
                      </div>
                    </div>
                  )}

                  {/* 2. 에러 발생 상태 */}
                  {!loadingAi && aiError && (
                    <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-200 space-y-3">
                      <div className="flex items-start gap-2.5">
                        <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold text-red-300">리포트 생성 중 오류가 발생했습니다</p>
                          <p className="text-gray-400 mt-1 leading-relaxed">{aiError}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 pt-1 border-t border-red-500/20">
                        <button
                          onClick={() => {
                            setApiKeyWarning(null);
                            setIsApiKeyModalOpen(true);
                          }}
                          className="flex items-center gap-1 px-3 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-white font-medium text-[11px] transition-colors"
                        >
                          <Key className="w-3 h-3" />
                          <span>API Key 재설정</span>
                        </button>
                        <button
                          onClick={handleGenerateAiReport}
                          className="flex items-center gap-1 px-3 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-white font-medium text-[11px] transition-colors"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>다시 시도</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 3. 정상 리포트 출력 상태 */}
                  {!loadingAi && !aiError && (
                    <div className="relative group">
                      <div className="text-[13.5px] leading-relaxed text-gray-200 font-sans whitespace-pre-line bg-black/35 p-4 md:p-5 rounded-xl border border-white/5 shadow-inner">
                        {typedReport || report || (
                          <span className="text-gray-500">
                            데이터가 정상적으로 로드되었습니다. 상단의 <strong className="text-gold font-semibold">'AI 리포트 재생성'</strong> 버튼을 클릭하여 Gemini 인공지능 기반 구단 연봉 협상용 심층 스카우팅 총평을 생성할 수 있습니다.
                          </span>
                        )}
                        {/* 타이핑 중 커서 효과 */}
                        {isTyping && (
                          <span className="inline-block w-1.5 h-4 bg-gold ml-1 align-middle animate-pulse" />
                        )}
                      </div>

                      {/* 복사 버튼 */}
                      {(typedReport || report) && (
                        <div className="absolute top-2.5 right-2.5">
                          <button
                            onClick={handleCopyReport}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white text-[11px] backdrop-blur-md transition-all shadow-md"
                            title="브리핑 텍스트 복사"
                          >
                            {copied ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-400 stroke-[3]" />
                                <span className="text-emerald-400 font-semibold">복사완료</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>복사</span>
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* 하단 시스템 정보 */}
              <div className="mt-4 pt-3 border-t border-white/5 text-[11px] text-gray-400 flex flex-wrap justify-between items-center gap-2">
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-gold inline-block" />
                  <span>Google Gemini 3.5 Flash 연봉 협상 에이전트 연동</span>
                </span>
                <button
                  onClick={() => {
                    setApiKeyWarning(null);
                    setIsApiKeyModalOpen(true);
                  }}
                  className="flex items-center gap-1.5 text-xs hover:text-white transition-colors"
                >
                  <span className={`w-2 h-2 rounded-full ${hasConfiguredKey ? "bg-emerald-400" : "bg-amber-400"}`} />
                  <span className={hasConfiguredKey ? "text-emerald-400 font-medium" : "text-amber-300 font-medium"}>
                    {hasConfiguredKey ? "API Key 연동됨" : "API Key 미설정 (클릭하여 등록)"}
                  </span>
                </button>
              </div>
            </div>

          </div>

        </div>
      )}

      {/* Gemini API Key 설정 모달 */}
      <ApiKeyModal
        isOpen={isApiKeyModalOpen}
        onClose={() => {
          setIsApiKeyModalOpen(false);
          setApiKeyWarning(null);
        }}
        onKeySaved={(newKey) => {
          setHasConfiguredKey(!!newKey);
          setApiKeyWarning(null);
        }}
        warningMessage={apiKeyWarning}
      />

    </div>
  );
}
