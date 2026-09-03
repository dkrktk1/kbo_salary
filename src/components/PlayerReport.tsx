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
  FastForward,
  BarChart2,
  X
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
import { fetchPlayerFromDatabase, GAS_DB_URL, parsePlayerAge } from "../services/dbService";
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
  LEAGUE_AVERAGE_COMP,
  CompPlayerDef,
  extractRawPlayerStatForAxis,
  normalizeRawToApiStat,
  extractHistoryFromRawItems,
  getValue
} from "../types";
import { PercentileBarItem } from "./PercentileBarItem";
import { SearchableCompSelect } from "./SearchableCompSelect";
import { ApiKeyModal } from "./ApiKeyModal";
import { generateAIReport, getStoredApiKey, hasApiKey } from "../services/geminiService";

interface PlayerReportProps {
  initialPlayerName?: string;
  initialTeam?: string;
}

// 주요 KBO 선수 공식 신장/체중 사전 (DB에 해당 컬럼이 없거나 누락된 경우 정밀 보완)
const KBO_PHYSIQUE_LOOKUP: Record<string, string> = {
  "손성빈": "186cm / 94kg",
  "양의지": "179cm / 93kg",
  "강민호": "185cm / 102kg",
  "박동원": "179cm / 92kg",
  "김형준": "187cm / 92kg",
  "장성우": "187cm / 100kg",
  "이지영": "178cm / 86kg",
  "최재훈": "178cm / 85kg",
  "김태군": "182cm / 95kg",
  "유강남": "183cm / 90kg",
  "정보근": "177cm / 85kg",
  "안중열": "175cm / 85kg",
  "조형우": "185cm / 95kg",
  "신범수": "181cm / 85kg",
  "한준수": "184cm / 93kg",
  "김기연": "178cm / 88kg",
  "이재원": "185cm / 100kg",
  "김준태": "176cm / 90kg",
  "박세혁": "181cm / 88kg",
  "김민식": "180cm / 85kg",
  "이정후": "185cm / 86kg",
  "김도영": "182cm / 85kg",
  "문동주": "188cm / 98kg",
  "원태인": "183cm / 92kg",
  "곽빈": "187cm / 95kg",
  "안우진": "191cm / 90kg",
  "노시환": "185cm / 105kg",
  "구자욱": "189cm / 85kg",
  "김혜성": "182cm / 84kg",
  "박해민": "182cm / 77kg",
  "김현수": "188cm / 100kg",
  "최정": "180cm / 90kg",
  "나성범": "183cm / 100kg",
  "김광현": "188cm / 88kg",
  "류현진": "190cm / 113kg",
  "고영표": "187cm / 88kg",
  "박영현": "183cm / 90kg",
  "정우영": "193cm / 85kg",
  "황재균": "183cm / 96kg",
  "오지환": "186cm / 82kg",
  "박건우": "184cm / 86kg",
  "전준우": "180cm / 95kg",
  "정수빈": "177cm / 78kg",
  "채은성": "186cm / 92kg",
  "손아섭": "174cm / 84kg",
  "박민우": "180cm / 81kg"
};

/**
 * 선수 요약 프로필 (나이, 연봉, 등록일수, 신장/체중) 추출 함수
 */
function extractProfileSummary(records: any[], playerName: string): {
  age: string;
  salary: string;
  serviceTime: string;
  physique: string;
} {
  let foundAgeRaw: any = undefined;
  let foundSalaryRaw: any = undefined;
  let foundServiceRaw: any = undefined;
  let foundPhysiqueRaw: any = undefined;

  for (const r of records) {
    if (r && typeof r === "object") {
      if (foundAgeRaw === undefined && (r["나이"] || r.age || r["생년월일"] || r.birth)) {
        foundAgeRaw = r["나이"] || r.age || r["생년월일"] || r.birth;
      }
      if (foundSalaryRaw === undefined) {
        const sal = r["현재 연봉"] ?? r["현재연봉"] ?? r["연봉"] ?? r.salary;
        if (sal !== undefined && sal !== null && sal !== "" && sal !== 0 && sal !== "0") {
          foundSalaryRaw = sal;
        }
      }
      if (foundServiceRaw === undefined) {
        const st = r["등록일수"] ?? r["총등록일수"] ?? r.serviceTime;
        if (st !== undefined && st !== null && st !== "" && st !== "0" && st !== 0) {
          foundServiceRaw = st;
        }
      }
      if (foundPhysiqueRaw === undefined) {
        const phy = r["신장/체중"] ?? r["신체"] ?? r["체격"] ?? r.physique;
        if (phy && String(phy).trim()) {
          foundPhysiqueRaw = String(phy).trim();
        } else {
          const h = r["신장"] ?? r["키"] ?? r.height;
          const w = r["체중"] ?? r["몸무게"] ?? r.weight;
          if (h && w) {
            foundPhysiqueRaw = `${String(h).replace(/cm/i, "").trim()}cm / ${String(w).replace(/kg/i, "").trim()}kg`;
          }
        }
      }
    }
  }

  // 1. 나이 포맷팅
  let formattedAge = "데이터 없음";
  if (foundAgeRaw !== undefined && foundAgeRaw !== null && foundAgeRaw !== "") {
    const ageNum = parsePlayerAge(foundAgeRaw);
    if (ageNum > 0 && ageNum < 90) {
      formattedAge = `만 ${ageNum}세`;
    } else {
      const parsedNum = parseInt(String(foundAgeRaw), 10);
      if (!isNaN(parsedNum) && parsedNum > 10 && parsedNum < 90) {
        formattedAge = `만 ${parsedNum}세`;
      }
    }
  }

  // 2. 연봉 포맷팅 (만원 단위 기준)
  let formattedSalary = "데이터 없음";
  if (foundSalaryRaw !== undefined && foundSalaryRaw !== null && foundSalaryRaw !== "") {
    const num = typeof foundSalaryRaw === "number" 
      ? foundSalaryRaw 
      : parseFloat(String(foundSalaryRaw).replace(/[^0-9.-]/g, ""));
    if (!isNaN(num) && num > 0) {
      // 10000000 이상(원 단위)이면 만원 단위로 변환
      const manwon = num >= 10000000 ? Math.round(num / 10000) : Math.round(num);
      if (manwon >= 10000) {
        const eok = Math.floor(manwon / 10000);
        const rest = manwon % 10000;
        if (rest > 0) {
          formattedSalary = `${eok}억 ${rest.toLocaleString()}만원`;
        } else {
          formattedSalary = `${eok}억원`;
        }
      } else {
        formattedSalary = `${manwon.toLocaleString()}만원`;
      }
    }
  }

  // 3. 등록일수 포맷팅 (KBO 1군 1시즌 = 145일 기준)
  let formattedService = "데이터 없음";
  if (foundServiceRaw !== undefined && foundServiceRaw !== null && foundServiceRaw !== "") {
    const num = typeof foundServiceRaw === "number" 
      ? foundServiceRaw 
      : parseInt(String(foundServiceRaw).replace(/[^0-9]/g, ""), 10);
    if (!isNaN(num) && num >= 0) {
      if (num >= 145) {
        const years = Math.floor(num / 145);
        const remainDays = num % 145;
        formattedService = `${years}년 ${remainDays}일 (${num}일)`;
      } else {
        formattedService = `${num}일`;
      }
    } else if (typeof foundServiceRaw === "string" && foundServiceRaw.trim()) {
      formattedService = foundServiceRaw.trim();
    }
  }

  // 4. 신장/체중 포맷팅 (DB 데이터 우선 -> lookup 테이블 -> "데이터 없음")
  let formattedPhysique = "데이터 없음";
  if (foundPhysiqueRaw) {
    formattedPhysique = foundPhysiqueRaw;
  } else if (playerName && KBO_PHYSIQUE_LOOKUP[playerName.trim()]) {
    formattedPhysique = KBO_PHYSIQUE_LOOKUP[playerName.trim()];
  }

  return {
    age: formattedAge,
    salary: formattedSalary,
    serviceTime: formattedService,
    physique: formattedPhysique
  };
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
          const color = isMain ? "#ffb700" : (playerName?.includes("리그 평균") ? "#38d9a9" : "#4dabf7");

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

  // 선수 프로필 요약 정보 (나이, 연봉, 등록일수, 신장/체중)
  const [playerProfile, setPlayerProfile] = useState<{
    age: string;
    salary: string;
    serviceTime: string;
    physique: string;
  } | null>(null);

  // 상태 플래그
  const [isFetchingApi, setIsFetchingApi] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [selectedCompId, setSelectedCompId] = useState<string>("comp_league_avg");
  const [comparisonPool, setComparisonPool] = useState<CompPlayerDef[]>([]);

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
    // 긴 글도 중간에 멈춘 것처럼 답답하지 않도록 글자수에 따른 동적 스텝 적용
    const step = fullText.length > 800 ? 6 : (fullText.length > 400 ? 4 : 2);
    const intervalMs = 20;

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

  // 타이핑 즉시 완료 (전체 내용 즉시 표시)
  const handleSkipTyping = () => {
    if (typingTimerRef.current) {
      clearInterval(typingTimerRef.current);
    }
    setTypedReport(report);
    setIsTyping(false);
  };

  // 컴포넌트 언마운트 시 타이머 정리
  useEffect(() => {
    return () => {
      if (typingTimerRef.current) {
        clearInterval(typingTimerRef.current);
      }
    };
  }, []);

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

      // [요청 사항 1] API 응답 데이터 강제 로깅 (디버깅)
      const history = (dbResult.records && dbResult.records.length > 0)
        ? dbResult.records
        : [];
      if (history.length > 0 && history[0]) {
        console.log("API에서 넘어온 1개년도 원본 데이터 키 목록:", Object.keys(history[0]));
        console.log("API 원본 첫 번째 객체 상세:", history[0]);
        const defenseRec = history.find((h: any) => String(h?.부문 || "").includes("수비"));
        if (defenseRec) {
          console.log("API에서 넘어온 [수비] 부문 데이터 키 목록:", Object.keys(defenseRec));
          console.log("API [수비] 부문 데이터 객체 상세:", defenseRec);
        }
      }

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

        // 선수 프로필 요약 정보 (나이, 연봉, 등록일수, 신장/체중) 추출 및 설정
        const allRecords = [...(dbResult.records || [])];
        if (dbResult.stat2024) allRecords.push(dbResult.stat2024);
        if (dbResult.stat2025) allRecords.push(dbResult.stat2025);
        if (dbResult.stat2026) allRecords.push(dbResult.stat2026);
        setPlayerProfile(extractProfileSummary(allRecords, trimmedName));

        setReport(`Google 스프레드시트 DB로부터 '${resolvedTeam ? `${resolvedTeam} ` : ""}${trimmedName}' 선수의 포지션(${resolvedPos}) 및 3개년(2024~2026) 핵심 지표가 성공적으로 동기화되었습니다.`);
      } else {
        // 2. 직접 배포된 구글 Apps Script Web App URL로 2차 시도 (history 배열 파싱)
        const fallbackUrl = `https://script.google.com/macros/s/AKfycbzuv-TBMbIKSM0gUPrb3d99kG82BWvKTXrrdOyQhlYvWf1QKOG5dsNNC5xFM74c/exec?name=${encodeURIComponent(trimmedName)}${targetTeam ? `&team=${encodeURIComponent(targetTeam)}` : ""}&t=${Date.now()}`;
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

            // 선수 프로필 요약 정보 추출 및 설정
            setPlayerProfile(extractProfileSummary(items, trimmedName));

            setReport(`Google 스프레드시트 DB로부터 '${resolvedTeam ? `${resolvedTeam} ` : ""}${trimmedName}' 선수의 포지션(${resolvedPos}) 및 3개년(2024~2026) 성적이 성공적으로 동기화되었습니다.`);
            return;
          }
        }

        // 최종 데이터 없음
        setStat2024(null);
        setStat2025(null);
        setStat2026(null);
        setPlayerProfile(null);
        setHasData(false);
        setApiError(`구글 스프레드시트 DB에 '${targetTeam ? `${targetTeam} ` : ""}${trimmedName}' 선수의 데이터가 존재하지 않습니다.`);
      }
    } catch (err: any) {
      console.error("API 호출 실패:", err);
      setStat2024(null);
      setStat2025(null);
      setStat2026(null);
      setPlayerProfile(null);
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
    setPlayerProfile(null);
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

  // 비교 후보 풀 관리: '리그 평균'은 기본 항목으로 항상 첫 번째에 배치
  useEffect(() => {
    const leagueAvg = LEAGUE_AVERAGE_COMP[positionGroup] || LEAGUE_AVERAGE_COMP.catcher;
    const trimmedMain = (currentSearchedName || "").trim().toLowerCase();
    const recommended = currentCompPlayers.find(p => p.name.trim().toLowerCase() !== trimmedMain) || currentCompPlayers[0];

    setComparisonPool(prev => {
      // 기존에 등록된 선수 중 메인 선수와 동일하거나 리그 평균인 항목 정리
      const userAdded = prev.filter(p => p.id !== "comp_league_avg" && p.name.trim().toLowerCase() !== trimmedMain);

      // 등록된 후보가 없다면 기본 추천 선수 1명을 함께 포함하여 [리그 평균, 추천 선수]로 초기화
      if (userAdded.length === 0 && recommended) {
        return [leagueAvg, recommended];
      }
      return [leagueAvg, ...userAdded];
    });
  }, [positionGroup, currentSearchedName, currentCompPlayers]);

  // 비교 대상 추가 및 차트 선택 핸들러
  const handleSelectOrAddCompPlayer = (player: CompPlayerDef) => {
    setComparisonPool(prev => {
      const exists = prev.some(p => p.id === player.id);
      if (exists) return prev;
      return [...prev, player];
    });
    setSelectedCompId(player.id);
  };

  // 비교 대상 후보 삭제 핸들러 (리그 평균은 기본 필수 항목이므로 삭제 불가)
  const handleRemoveCompPlayer = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (id === "comp_league_avg") return;
    setComparisonPool(prev => {
      const next = prev.filter(p => p.id !== id);
      if (selectedCompId === id) {
        setSelectedCompId("comp_league_avg");
      }
      return next;
    });
  };

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

  // 선택된 비교 선수 객체 (리그 평균 또는 풀/전체에서 조회)
  const selectedCompPlayer = useMemo(() => {
    if (selectedCompId === "comp_league_avg") {
      return LEAGUE_AVERAGE_COMP[positionGroup] || LEAGUE_AVERAGE_COMP.catcher;
    }
    const inPool = comparisonPool.find(p => p.id === selectedCompId);
    if (inPool) return inPool;

    const inAll = ALL_COMP_PLAYERS.find(p => p.id === selectedCompId);
    if (inAll) return inAll;

    return LEAGUE_AVERAGE_COMP[positionGroup] || LEAGUE_AVERAGE_COMP.catcher;
  }, [selectedCompId, comparisonPool, positionGroup]);

  // 레이더 차트 동적 6개 축 데이터 계산
  const radarChartData = useMemo(() => {
    const axes = POSITION_AXES[positionGroup] || POSITION_AXES.catcher;
    const mainName = currentSearchedName || "검색 선수";
    const compName = selectedCompPlayer?.name || "비교 대상";
    
    return axes.map(axis => {
      const mainRaw = extractRawPlayerStatForAxis(latestStat, axis.key);
      const compRaw = selectedCompPlayer?.stats?.[axis.key] ?? null;

      const mainScore = axis.calcScore(mainRaw);
      const compScore = axis.calcScore(compRaw);

      return {
        subject: axis.subject,
        key: axis.key,
        [mainName]: mainScore,
        [compName]: compScore,
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
            <th className="py-2.5 px-3 text-center text-xs font-semibold text-white">Pass/9</th>
            <th className="py-2.5 px-3 text-center text-xs font-semibold text-gold">OPS</th>
            <th className="py-2.5 px-3 text-center text-xs font-semibold text-white">wRC+</th>
            <th className="py-2.5 px-3 text-center text-xs font-semibold text-white">수비 이닝</th>
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

    const row: any = stat;

    if (positionGroup === "pitcher") {
      const eraValue = getValue(row, ['ERA', '평균자책점', '방어율']) ?? '데이터 없음';
      const fipValue = getValue(row, ['FIP', '수비무관평자']) ?? '데이터 없음';
      const k9Value = getValue(row, ['K/9', '탈삼진/9', 'SO/9']) ?? '데이터 없음';
      const bb9Value = getValue(row, ['BB/9', '볼넷/9']) ?? '데이터 없음';
      const lobValue = getValue(row, ['LOB%', '잔루율', 'LOB']) ?? '데이터 없음';
      // 3. 투수 IP vs 수비 IP 충돌 예외 처리: 투수는 PIT_IP 우선
      const ipValue = getValue(row, ['PIT_IP', '투수이닝', '투수 이닝']) 
        ?? (row.pitcherRecord ? getValue(row.pitcherRecord, ['IP', 'PIT_IP', '투수이닝']) : undefined)
        ?? getValue(row, ['IP', '이닝']) ?? '데이터 없음';
      const warValue = getValue(row, ['WAR', '핵심 스탯(WAR)', '핵심스탯(WAR)']) ?? '데이터 없음';

      const warNum = typeof warValue === 'number' ? warValue : parseFloat(String(warValue));
      const displayWar = !isNaN(warNum) ? warNum.toFixed(1) : warValue;

      return (
        <>
          <td className={`py-3 px-3 text-center text-xs font-mono ${eraValue === '데이터 없음' ? "text-gray-500" : "text-white font-semibold"}`}>
            {eraValue !== '데이터 없음' && typeof eraValue === 'number' ? eraValue.toFixed(2) : eraValue}
          </td>
          <td className={`py-3 px-3 text-center text-xs font-mono ${fipValue === '데이터 없음' ? "text-gray-500" : "text-gray-200"}`}>
            {fipValue !== '데이터 없음' && typeof fipValue === 'number' ? fipValue.toFixed(2) : fipValue}
          </td>
          <td className={`py-3 px-3 text-center text-xs font-mono ${k9Value === '데이터 없음' ? "text-gray-500" : "text-gray-200"}`}>
            {k9Value !== '데이터 없음' && typeof k9Value === 'number' ? k9Value.toFixed(2) : k9Value}
          </td>
          <td className={`py-3 px-3 text-center text-xs font-mono ${bb9Value === '데이터 없음' ? "text-gray-500" : "text-gray-200"}`}>
            {bb9Value !== '데이터 없음' && typeof bb9Value === 'number' ? bb9Value.toFixed(2) : bb9Value}
          </td>
          <td className={`py-3 px-3 text-center text-xs font-mono font-bold ${lobValue === '데이터 없음' ? "text-gray-500 font-normal" : "text-gold"}`}>
            {lobValue !== '데이터 없음' ? (typeof lobValue === 'number' ? (lobValue > 0 && lobValue <= 1 ? `${(lobValue * 100).toFixed(1)}%` : `${lobValue}%`) : lobValue) : lobValue}
          </td>
          <td className={`py-3 px-3 text-center text-xs font-mono font-bold ${ipValue === '데이터 없음' ? "text-gray-500 font-normal" : "text-gold"}`}>
            {ipValue !== '데이터 없음' && typeof ipValue === 'number' ? (Number.isInteger(ipValue) ? `${ipValue}.0` : ipValue) : ipValue}
          </td>
          <td className={`py-3 px-3 text-center text-xs font-mono font-extrabold ${displayWar === '데이터 없음' ? "text-gray-500 font-normal" : "text-emerald-400"}`}>
            {displayWar}
          </td>
        </>
      );
    }

    if (positionGroup === "infield") {
      const opsValue = getValue(row, ['OPS', '출루율+장타율']) ?? '데이터 없음';
      const wrcValue = getValue(row, ['wRC+', 'WRC+', 'wrc+']) ?? '데이터 없음';
      const isoValue = getValue(row, ['ISO', '순수장타율']) ?? '데이터 없음';
      const bbkValue = getValue(row, ['BB/K', '선구안']) ?? '데이터 없음';
      const rf9Value = getValue(row, ['RF9', 'RF/9', '수비범위']) ?? '데이터 없음';
      const dpValue = getValue(row, ['DP', '병살', '병살처리']) ?? '데이터 없음';
      const warValue = getValue(row, ['WAR', '핵심 스탯(WAR)', '핵심스탯(WAR)']) ?? '데이터 없음';
      const warNum = typeof warValue === 'number' ? warValue : parseFloat(String(warValue));
      const displayWar = !isNaN(warNum) ? warNum.toFixed(1) : warValue;

      return (
        <>
          <td className={`py-3 px-3 text-center text-xs font-mono font-bold ${opsValue === '데이터 없음' ? "text-gray-500 font-normal" : "text-gold"}`}>
            {opsValue !== '데이터 없음' && typeof opsValue === 'number' ? opsValue.toFixed(3) : opsValue}
          </td>
          <td className={`py-3 px-3 text-center text-xs font-mono ${wrcValue === '데이터 없음' ? "text-gray-500" : "text-gray-200"}`}>
            {wrcValue !== '데이터 없음' && typeof wrcValue === 'number' ? Math.round(wrcValue) : wrcValue}
          </td>
          <td className={`py-3 px-3 text-center text-xs font-mono ${isoValue === '데이터 없음' ? "text-gray-500" : "text-gray-200"}`}>
            {isoValue !== '데이터 없음' && typeof isoValue === 'number' ? isoValue.toFixed(3) : isoValue}
          </td>
          <td className={`py-3 px-3 text-center text-xs font-mono ${bbkValue === '데이터 없음' ? "text-gray-500" : "text-gray-200"}`}>
            {bbkValue !== '데이터 없음' && typeof bbkValue === 'number' ? bbkValue.toFixed(2) : bbkValue}
          </td>
          <td className={`py-3 px-3 text-center text-xs font-mono ${rf9Value === '데이터 없음' ? "text-gray-500" : "text-gray-200"}`}>
            {rf9Value !== '데이터 없음' && typeof rf9Value === 'number' ? rf9Value.toFixed(2) : rf9Value}
          </td>
          <td className={`py-3 px-3 text-center text-xs font-mono ${dpValue === '데이터 없음' ? "text-gray-500" : "text-gray-200"}`}>
            {dpValue !== '데이터 없음' && typeof dpValue === 'number' ? Math.round(dpValue) : dpValue}
          </td>
          <td className={`py-3 px-3 text-center text-xs font-mono font-extrabold ${displayWar === '데이터 없음' ? "text-gray-500 font-normal" : "text-emerald-400"}`}>
            {displayWar}
          </td>
        </>
      );
    }

    if (positionGroup === "outfield") {
      const opsValue = getValue(row, ['OPS', '출루율+장타율']) ?? '데이터 없음';
      const wrcValue = getValue(row, ['wRC+', 'WRC+', 'wrc+']) ?? '데이터 없음';
      const isoValue = getValue(row, ['ISO', '순수장타율']) ?? '데이터 없음';
      const bbkValue = getValue(row, ['BB/K', '선구안']) ?? '데이터 없음';
      const rf9Value = getValue(row, ['RF9', 'RF/9', '수비범위']) ?? '데이터 없음';
      const aValue = getValue(row, ['A', '보살', '어시스트']) ?? '데이터 없음';
      const warValue = getValue(row, ['WAR', '핵심 스탯(WAR)', '핵심스탯(WAR)']) ?? '데이터 없음';
      const warNum = typeof warValue === 'number' ? warValue : parseFloat(String(warValue));
      const displayWar = !isNaN(warNum) ? warNum.toFixed(1) : warValue;

      return (
        <>
          <td className={`py-3 px-3 text-center text-xs font-mono font-bold ${opsValue === '데이터 없음' ? "text-gray-500 font-normal" : "text-gold"}`}>
            {opsValue !== '데이터 없음' && typeof opsValue === 'number' ? opsValue.toFixed(3) : opsValue}
          </td>
          <td className={`py-3 px-3 text-center text-xs font-mono ${wrcValue === '데이터 없음' ? "text-gray-500" : "text-gray-200"}`}>
            {wrcValue !== '데이터 없음' && typeof wrcValue === 'number' ? Math.round(wrcValue) : wrcValue}
          </td>
          <td className={`py-3 px-3 text-center text-xs font-mono ${isoValue === '데이터 없음' ? "text-gray-500" : "text-gray-200"}`}>
            {isoValue !== '데이터 없음' && typeof isoValue === 'number' ? isoValue.toFixed(3) : isoValue}
          </td>
          <td className={`py-3 px-3 text-center text-xs font-mono ${bbkValue === '데이터 없음' ? "text-gray-500" : "text-gray-200"}`}>
            {bbkValue !== '데이터 없음' && typeof bbkValue === 'number' ? bbkValue.toFixed(2) : bbkValue}
          </td>
          <td className={`py-3 px-3 text-center text-xs font-mono ${rf9Value === '데이터 없음' ? "text-gray-500" : "text-gray-200"}`}>
            {rf9Value !== '데이터 없음' && typeof rf9Value === 'number' ? rf9Value.toFixed(2) : rf9Value}
          </td>
          <td className={`py-3 px-3 text-center text-xs font-mono ${aValue === '데이터 없음' ? "text-gray-500" : "text-gray-200"}`}>
            {aValue !== '데이터 없음' && typeof aValue === 'number' ? Math.round(aValue) : aValue}
          </td>
          <td className={`py-3 px-3 text-center text-xs font-mono font-extrabold ${displayWar === '데이터 없음' ? "text-gray-500 font-normal" : "text-emerald-400"}`}>
            {displayWar}
          </td>
        </>
      );
    }

    // 포수 (기본)
    // 2. 유연한 키(Fuzzy) 매칭으로 CS% (도루저지율) 추출
    const rawCs = getValue(row, ['CS%', '도루저지율', 'CS_PCT', 'CS_RATE', '도루 저지율', 'CS']) 
      ?? (row.defenseRecord ? getValue(row.defenseRecord, ['CS%', '도루저지율', 'CS_PCT', 'CS']) : undefined);
    const csValue = rawCs !== undefined && rawCs !== null && rawCs !== "" ? rawCs : '데이터 없음';

    const rawPb = getValue(row, ['Pass/9', 'PASS/9', 'PB/9', 'BLK/9', 'PB', '폭투포일', '패스트볼/9'])
      ?? (row.defenseRecord ? getValue(row.defenseRecord, ['Pass/9', 'PB/9', 'BLK/9', 'PB']) : undefined);
    const pbValue = rawPb !== undefined && rawPb !== null && rawPb !== "" ? rawPb : '데이터 없음';
    const pbNum = typeof pbValue === 'number' ? pbValue : parseFloat(String(pbValue));
    const displayPb = !isNaN(pbNum) ? pbNum.toFixed(3) : pbValue;

    const rawOps = getValue(row, ['OPS', '출루율+장타율'])
      ?? (row.batterRecord ? getValue(row.batterRecord, ['OPS']) : undefined);
    const opsValue = rawOps !== undefined && rawOps !== null && rawOps !== "" ? rawOps : '데이터 없음';

    const rawWrc = getValue(row, ['wRC+', 'WRC+', 'wrc+'])
      ?? (row.batterRecord ? getValue(row.batterRecord, ['wRC+', 'WRC+']) : undefined);
    const wrcValue = rawWrc !== undefined && rawWrc !== null && rawWrc !== "" ? rawWrc : '데이터 없음';

    // 3. 투수 IP vs 수비 IP 충돌 예외 처리: 포수는 DEF_IP, 수비이닝, defenseRecord의 IP 우선 지정
    const rawIp = getValue(row, ['DEF_IP', '수비이닝', '수비 이닝']) 
      ?? (row.defenseRecord ? getValue(row.defenseRecord, ['IP', 'DEF_IP', '수비이닝']) : undefined)
      ?? getValue(row, ['IP', '이닝']);
    const ipValue = rawIp !== undefined && rawIp !== null && rawIp !== "" ? rawIp : '데이터 없음';

    const rawWar = getValue(row, ['WAR', '핵심 스탯(WAR)', '핵심스탯(WAR)']);
    const warValue = rawWar !== undefined && rawWar !== null && rawWar !== "" ? rawWar : '데이터 없음';
    const warNum = typeof warValue === 'number' ? warValue : parseFloat(String(warValue));
    const displayWar = !isNaN(warNum) ? warNum.toFixed(1) : warValue;

    return (
      <>
        <td className={`py-3 px-3 text-center text-xs font-mono font-bold ${csValue === '데이터 없음' ? "text-gray-500 font-normal" : "text-gold"}`}>
          {csValue !== '데이터 없음' 
            ? (typeof csValue === 'number' 
                ? (csValue > 0 && csValue <= 1 ? `${(csValue * 100).toFixed(1)}%` : `${csValue}%`) 
                : (String(csValue).includes('%') ? csValue : `${csValue}%`)) 
            : '데이터 없음'}
        </td>
        <td className={`py-3 px-3 text-center text-xs font-mono ${displayPb === '데이터 없음' ? "text-gray-500" : "text-gray-200"}`}>
          {displayPb}
        </td>
        <td className={`py-3 px-3 text-center text-xs font-mono font-bold ${opsValue === '데이터 없음' ? "text-gray-500 font-normal" : "text-gold"}`}>
          {opsValue !== '데이터 없음' && typeof opsValue === 'number' ? opsValue.toFixed(3) : opsValue}
        </td>
        <td className={`py-3 px-3 text-center text-xs font-mono ${wrcValue === '데이터 없음' ? "text-gray-500" : "text-gray-200"}`}>
          {wrcValue !== '데이터 없음' && typeof wrcValue === 'number' ? Math.round(wrcValue) : wrcValue}
        </td>
        <td className={`py-3 px-3 text-center text-xs font-mono ${ipValue === '데이터 없음' ? "text-gray-500" : "text-gray-200"}`}>
          {ipValue !== '데이터 없음' && typeof ipValue === 'number' ? (Number.isInteger(ipValue) ? `${ipValue}.0` : ipValue) : ipValue}
        </td>
        <td className={`py-3 px-3 text-center text-xs font-mono font-extrabold ${displayWar === '데이터 없음' ? "text-gray-500 font-normal" : "text-emerald-400"}`}>
          {displayWar}
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
      const warRaw = hasWar ? `${warVal!.toFixed(1)}` : undefined;

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
                name="K/9 (탈삼진율)" 
                subName="Strikeout Rate" 
                value={k9Pct} 
                rawDisplay={k9Raw} 
              />
              <PercentileBarItem 
                idPrefix="statcast-bb9"
                name="BB/9 (볼넷 억제율)" 
                subName="Walk Prevention" 
                value={bb9Pct} 
                rawDisplay={bb9Raw} 
              />
              <PercentileBarItem 
                idPrefix="statcast-lob"
                name="LOB% (잔루 처리율)" 
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
                name="ERA (평균자책점)" 
                subName="Earned Run Avg" 
                value={eraPct} 
                rawDisplay={eraRaw} 
              />
              <PercentileBarItem 
                idPrefix="statcast-fip"
                name="FIP (수비무관 평자)" 
                subName="Fielding Ind. Pitching" 
                value={fipPct} 
                rawDisplay={fipRaw} 
              />
              <PercentileBarItem 
                idPrefix="statcast-war"
                name="WAR (종합 승리 기여도)" 
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
    const warRaw = hasWar ? `${warVal!.toFixed(1)}` : undefined;

    // 수비 지표는 포지션별 분기
    let def1Name = "RF9 (수비 범위)";
    let def1Sub = "Range Factor";
    let def1Pct: number | null = null;
    let def1Raw: string | undefined = undefined;

    let def2Name = "수비 기여도";
    let def2Sub = "Defense Score";
    let def2Pct: number | null = null;
    let def2Raw: string | undefined = undefined;

    if (positionGroup === "catcher") {
      def1Name = "CS% (도루 저지율)";
      def1Sub = "Caught Stealing %";
      const csVal = latestStat?.["CS%"];
      if (isValidStatNumber(csVal)) {
        const val = csVal! > 1 ? csVal! : csVal! * 100;
        def1Pct = Math.min(99, Math.max(1, Math.round((val / 60) * 100)));
        def1Raw = `${val.toFixed(1)}%`;
      }

      def2Name = "Pop Time (팝타임)";
      def2Sub = "2B Throw Time";
      const popVal = latestStat?.["팝타임"];
      if (isValidStatNumber(popVal)) {
        def2Pct = Math.min(99, Math.max(1, Math.round((1 - (popVal! - 1.85) / 0.35) * 100)));
        def2Raw = `${popVal!.toFixed(2)}초`;
      } else {
        def2Name = "Pass/9";
        def2Sub = "Passed Balls / 9";
        const pbVal = latestStat?.["PB/9"] ?? latestStat?.["BLK/9"] ?? latestStat?.["Pass/9"];
        if (isValidStatNumber(pbVal)) {
          def2Pct = Math.min(99, Math.max(1, Math.round((1 - Math.min(1, Math.max(0, pbVal!))) * 100)));
          def2Raw = `${pbVal!.toFixed(3)}`;
        }
      }
    } else if (positionGroup === "infield") {
      def1Name = "RF9 (수비 범위)";
      const rfVal = latestStat?.RF9;
      if (isValidStatNumber(rfVal)) {
        def1Pct = Math.min(99, Math.max(1, Math.round((rfVal! / 6.0) * 100)));
        def1Raw = `${rfVal!.toFixed(2)}`;
      }

      def2Name = "DP (병살 처리)";
      def2Sub = "Double Plays Turned";
      const dpVal = latestStat?.DP;
      if (isValidStatNumber(dpVal)) {
        def2Pct = Math.min(99, Math.max(1, Math.round((dpVal! / 110) * 100)));
        def2Raw = `${Math.round(dpVal!)}개`;
      }
    } else {
      // outfield
      def1Name = "RF9 (수비 범위)";
      const rfVal = latestStat?.RF9;
      if (isValidStatNumber(rfVal)) {
        def1Pct = Math.min(99, Math.max(1, Math.round((rfVal! / 3.0) * 100)));
        def1Raw = `${rfVal!.toFixed(2)}`;
      }

      def2Name = "A (외야 보살)";
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
              name="OPS (출루율+장타율)" 
              subName="On-Base Plus Slugging" 
              value={opsPct} 
              rawDisplay={opsRaw} 
            />
            <PercentileBarItem 
              idPrefix="statcast-wrc"
              name="wRC+ (조정 득점창출력)" 
              subName="Weighted Runs Created+" 
              value={wrcPct} 
              rawDisplay={wrcRaw} 
            />
            <PercentileBarItem 
              idPrefix="statcast-iso"
              name="ISO (순수 장타율)" 
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
              name="WAR (대체선수대비 승리기여)" 
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
            포지션별 스탯캐스트 분석 및 백분위 다이내믹 시각화
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
                <div id="player-profile-summary" className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-gray-400 mt-1.5">
                  <span className="flex items-center gap-1">
                    <Layers className="w-3.5 h-3.5 text-gold" />
                    포지션 그룹: <strong className="text-gray-200">{getPositionGroupLabel(positionGroup)}</strong>
                  </span>
                  <span className="text-gray-600">•</span>
                  <span>나이: <strong className="text-gray-200">{playerProfile?.age || "데이터 없음"}</strong></span>
                  <span className="text-gray-600">•</span>
                  <span>연봉: <strong className="text-gold font-semibold">{playerProfile?.salary || "데이터 없음"}</strong></span>
                  <span className="text-gray-600">•</span>
                  <span>등록일수: <strong className="text-gray-200">{playerProfile?.serviceTime || "데이터 없음"}</strong></span>
                  <span className="text-gray-600">•</span>
                  <span>신장/체중: <strong className="text-gray-200">{playerProfile?.physique || "데이터 없음"}</strong></span>
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
                    <th className="py-2.5 px-3 text-center text-xs font-bold text-white">시즌</th>
                    <th className="py-2.5 px-3 text-center text-xs font-bold text-white">소속 구단</th>
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
                <span className="flex items-center gap-1 text-white">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-600" />
                  상위 (75~99%)
                </span>
                <span className="flex items-center gap-1 text-white">
                  <span className="w-2.5 h-2.5 rounded-full bg-gray-500" />
                  평균 (26~74%)
                </span>
                <span className="flex items-center gap-1 text-white">
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
                  <span className="text-xs text-gray-400">비교 선수 검색:</span>
                  <SearchableCompSelect
                    selectedCompId={selectedCompId}
                    onSelectCompPlayer={handleSelectOrAddCompPlayer}
                    currentMainPlayerName={currentSearchedName}
                    positionGroup={positionGroup}
                    currentSearchedTeam={currentSearchedTeam}
                    registeredIds={comparisonPool.map(p => p.id)}
                  />
                </div>
              </div>

              {/* 임시 등록 비교 대상 후보군 바 (1클릭 전환 및 관리) */}
              <div className="bg-white/[0.02] border border-white/10 rounded-xl p-2.5 mb-3 flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-gray-400 font-medium flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                    비교 대상 목록 <span className="text-gray-500 font-normal">(클릭 시 레이더 차트에 즉시 비교 반영)</span>
                  </span>
                  <span className="text-[10px] text-gray-500 font-mono">
                    총 {comparisonPool.length}개 대상 등록됨
                  </span>
                </div>

                <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
                  {comparisonPool.map((p) => {
                    const isSelected = p.id === selectedCompId;
                    const isLeagueAvg = p.id === "comp_league_avg";
                    
                    return (
                      <div
                        key={p.id}
                        onClick={() => setSelectedCompId(p.id)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold cursor-pointer transition-all flex-shrink-0 select-none ${
                          isSelected
                            ? (isLeagueAvg 
                                ? "bg-cyan-500/20 border-cyan-400 text-white shadow-md shadow-cyan-500/10 ring-1 ring-cyan-400/50" 
                                : "bg-blue-600/25 border-blue-400 text-white shadow-md shadow-blue-500/10 ring-1 ring-blue-400/50")
                            : "bg-black/30 hover:bg-white/5 border-white/10 text-gray-300 hover:text-white"
                        }`}
                      >
                        {isLeagueAvg ? (
                          <div className={`w-5 h-5 rounded-lg flex items-center justify-center ${isSelected ? "bg-cyan-500/30 text-cyan-300" : "bg-white/10 text-gray-400"}`}>
                            <BarChart2 className="w-3.5 h-3.5" />
                          </div>
                        ) : (
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${isSelected ? "bg-blue-500 text-white" : "bg-white/10 text-gray-400"}`}>
                            {p.name.slice(0, 1)}
                          </div>
                        )}

                        <div className="flex flex-col text-left">
                          <div className="flex items-center gap-1.5 leading-none">
                            <span className={`text-xs font-bold ${isSelected ? (isLeagueAvg ? "text-cyan-300" : "text-blue-300") : "text-gray-200"}`}>
                              {p.name}
                            </span>
                            {isLeagueAvg && (
                              <span className="text-[9px] px-1 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-bold">
                                기본
                              </span>
                            )}
                          </div>
                          <span className={`text-[10px] ${isSelected ? (isLeagueAvg ? "text-cyan-200/70" : "text-blue-200/70") : "text-gray-500"} leading-tight mt-0.5`}>
                            {p.team}
                          </span>
                        </div>

                        {/* 삭제 버튼 (리그 평균은 기본값이므로 삭제 불가) */}
                        {!isLeagueAvg && (
                          <button
                            type="button"
                            onClick={(e) => handleRemoveCompPlayer(p.id, e)}
                            className="ml-1 p-0.5 rounded-md hover:bg-white/20 text-gray-400 hover:text-red-300 transition-colors cursor-pointer"
                            title="비교 목록에서 제외"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    );
                  })}
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

                    {/* 비교 대상 레이더 (블루 또는 시안) */}
                    <Radar
                      name={selectedCompPlayer?.name || "비교 대상"}
                      dataKey={selectedCompPlayer?.name || "비교 대상"}
                      stroke={selectedCompPlayer?.id === "comp_league_avg" ? "#38d9a9" : "#4dabf7"}
                      fill={selectedCompPlayer?.id === "comp_league_avg" ? "#38d9a9" : "#4dabf7"}
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
                          <span>AI 리포트 생성</span>
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
                      <div 
                        className="text-[13.5px] leading-relaxed text-gray-200 font-sans whitespace-pre-wrap break-words h-auto min-h-[140px] max-h-[650px] overflow-y-auto bg-black/35 p-4 md:p-5 pr-24 rounded-xl border border-white/5 shadow-inner"
                        style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                      >
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

                      {/* 액션 버튼 그룹 (타이핑 건너뛰기 + 복사 버튼) */}
                      {(typedReport || report) && (
                        <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 z-10">
                          {isTyping && (
                            <button
                              onClick={handleSkipTyping}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gold/20 hover:bg-gold/30 text-gold border border-gold/30 text-[11px] font-bold backdrop-blur-md transition-all shadow-md cursor-pointer"
                              title="타이핑 효과 건너뛰고 전체 리포트 즉시 보기"
                            >
                              <FastForward className="w-3 h-3" />
                              <span>전체보기</span>
                            </button>
                          )}
                          <button
                            onClick={handleCopyReport}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white text-[11px] backdrop-blur-md transition-all shadow-md cursor-pointer"
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
