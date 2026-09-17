import React, { useState, useEffect, useMemo, useRef } from "react";
import { loadStoredPlayers, saveStoredPlayers, Player, mockTeams } from "../data";
import {
  fetchPlayerFromDatabase,
  convertDbToPlayer,
  parseDraftYear,
  parseServiceTimeFaStatus,
  cleanPosition,
  deleteSamplePlayerFromDatabase,
  saveSamplePlayerToDatabase,
  mergeRawRecordsForYear,
  extractWarFromObject,
  extractOpsFromObject,
  extractAvgFromObject,
  extractHrFromObject,
  extractCsFromObject,
  extractEraFromObject,
  extractWhipFromObject,
  getValue,
  parsePlayerSalary,
  parsePlayerSalaryToManwon,
  parsePlayerCsPercent,
  DbRawPlayerRecord,
  GAS_DB_URL,
  convertPlayerToAppDbPayload,
  savePlayerToDatabase,
  mapRawToPlayer,
  fetchAppDataFromDatabase
} from "../services/dbService";
import {
  Calculator,
  Sparkles,
  Loader2,
  Target,
  TrendingUp,
  Shield,
  Activity,
  Award,
  Search,
  Database,
  CheckCircle2,
  AlertCircle,
  Flame,
  FlaskConical,
  Plus,
  X,
  Pencil,
  Trash2,
  Calendar,
  ChevronDown,
  Check,
  ArrowRight,
  SlidersHorizontal,
  History,
  Copy,
  Save,
  RefreshCw,
  UserPlus,
  DollarSign
} from "lucide-react";
import SamplePlayerModal from "./SamplePlayerModal";
import StatInputSlider from "./StatInputSlider";

const SAMPLE_PLAYERS_STORAGE_KEY = "kbo_sample_players";

function loadSamplePlayers(): Player[] {
  try {
    const raw = localStorage.getItem(SAMPLE_PLAYERS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.error("Failed to load sample players from localStorage:", e);
  }
  return [];
}

function saveSamplePlayersToStorage(players: Player[]) {
  try {
    localStorage.setItem(SAMPLE_PLAYERS_STORAGE_KEY, JSON.stringify(players));
  } catch (e) {
    console.error("Failed to save sample players:", e);
  }
}

export type PositionCategory = 'CATCHER' | 'FIELDER' | 'PITCHER';

/**
 * 포지션 분류 함수
 * - 포수: '포수'
 * - 투수: '투수', '선발투수', '구원투수', '마무리투수', '중계투수' 등
 * - 내야수/외야수: '내야수', '외야수', '1루수', '2루수', '3루수', '유격수', '좌익수', '중견수', '우익수', '지명타자' 등
 */
export function classifyPosition(rawPos: string | undefined): PositionCategory {
  if (!rawPos) return 'FIELDER';
  const pos = String(rawPos).trim();
  const upper = pos.toUpperCase();
  if (pos.includes('포수') || upper === 'C' || upper.includes('CATCHER')) return 'CATCHER';
  if (pos.includes('투수') || pos.includes('선발') || pos.includes('구원') || pos.includes('마무리') || pos.includes('계투') || upper === 'P' || upper.includes('PITCHER')) {
    return 'PITCHER';
  }
  return 'FIELDER';
}

export function getPositionCategoryLabel(category: PositionCategory): string {
  switch (category) {
    case 'CATCHER':
      return '포수';
    case 'FIELDER':
      return '내야수/외야수';
    case 'PITCHER':
      return '투수';
  }
}

/**
 * 선수의 데이터베이스 포지션을 바탕으로 내야수/외야수/포수/투수 단일 포지션 명칭 반환
 * - 내야수와 외야수가 함께 표기되지 않고 DB 기준으로 1가지만 표시
 */
export function getSinglePositionName(player: Player | null | undefined, fallbackCategory?: PositionCategory): string {
  if (!player || !player.position) {
    if (fallbackCategory === 'CATCHER') return '포수';
    if (fallbackCategory === 'PITCHER') return '투수';
    return '내야수';
  }

  const raw = String(player.position).trim();
  // 포수
  if (raw.includes('포수')) return '포수';
  // 투수
  if (raw.includes('투수') || raw.includes('선발') || raw.includes('구원') || raw.includes('마무리') || raw.includes('계투')) {
    return '투수';
  }
  // 외야수 (외야수, 좌익수, 중견수, 우익수)
  if (raw.includes('외야') || raw.includes('좌익') || raw.includes('우익') || raw.includes('중견')) {
    return '외야수';
  }
  // 내야수 (내야수, 1루수, 2루수, 3루수, 유격수)
  if (raw.includes('내야') || raw.includes('1루') || raw.includes('2루') || raw.includes('3루') || raw.includes('유격')) {
    return '내야수';
  }
  // 지명타자
  if (raw.includes('지명')) {
    return '지명타자';
  }

  const cleaned = cleanPosition(raw);
  if (cleaned) {
    if (cleaned.includes('외야') || cleaned.includes('좌익') || cleaned.includes('우익') || cleaned.includes('중견')) return '외야수';
    if (cleaned.includes('내야') || cleaned.includes('1루') || cleaned.includes('2루') || cleaned.includes('3루') || cleaned.includes('유격')) return '내야수';
    return cleaned;
  }

  return fallbackCategory === 'CATCHER' ? '포수' : fallbackCategory === 'PITCHER' ? '투수' : '내야수';
}

// 각 포지션별 기본값 (Default Parameters)
const DEFAULT_WAR = 4.5;

// 타자(포수, 내야수, 외야수) 공통 기본 타격 지표
const DEFAULT_HITTER_STATS = {
  wrcPlus: 120,        // wRC+ (조정 득점 생산력)
  ops: 0.780,          // OPS (출루율 + 장타율)
};

// 포수 프리미엄 지표
const DEFAULT_CATCHER_PREMIUM = {
  csRate: 32.0,        // 도루저지율 (CS%)
  pb9: 0.38,           // 블로킹 지표 (PB/9: 9이닝당 폭투·포일 허용, 낮을수록 우수)
};

// 내야수/외야수 프리미엄 지표
const DEFAULT_FIELDER_PREMIUM = {
  rf9: 3.85,           // RF9 (9이닝당 레인지 팩터, 수비 범위)
  iso: 0.165,          // 순수 장타율 (ISO)
};

// 투수 지표
const DEFAULT_PITCHER_STATS = {
  innings: 135,        // 이닝 (IP)
  era: 3.50,           // 평균자책점 (ERA)
  whip: 1.22,          // WHIP
};

/**
 * 연봉 및 변동액 표기 포맷터: '5억', '5억 5,000만원', '3,100만원', '100만원', '400만원' 형식
 * - 원(KRW) 단위의 숫자를 정확한 한국어 화폐 단위(억/만원/원)로 변환
 * - 1,000,000원(100만원), 4,000,000원(400만원) 등 500만원 미만의 변동액도 정확히 '만원' 단위로 표기
 * - 숫자 1,000 단위마다 쉼표(,) 구분 적용
 */
export function formatKoreanSalary(amountWon: number): string {
  if (!amountWon || isNaN(amountWon) || amountWon <= 0) return "0원";

  let won = Math.round(amountWon);
  // 500억원 초과 비정상적인 값(과거 중복 10,000 곱셈 오류) 복원
  while (won > 50000000000) {
    won = Math.round(won / 10000);
  }

  if (won >= 100000000) {
    const uk = Math.floor(won / 100000000);
    const manwon = Math.round((won % 100000000) / 10000);

    if (manwon > 0) {
      return `${uk.toLocaleString()}억 ${manwon.toLocaleString()}만원`;
    }
    return `${uk.toLocaleString()}억원`;
  }

  const manwon = Math.floor(won / 10000);
  const remainWon = won % 10000;

  if (manwon > 0) {
    if (remainWon > 0 && won < 100000) {
      // 10만원 미만의 세부 원 단위 잔액이 있는 경우
      return `${manwon.toLocaleString()}만 ${remainWon.toLocaleString()}원`;
    }
    return `${manwon.toLocaleString()}만원`;
  }

  if (won > 0) {
    return `${won.toLocaleString()}원`;
  }

  return "0원";
}

interface BaselineSalaryInputProps {
  year?: number | null;
  isSample: boolean;
  value: string;
  onChange: (val: string) => void;
  salaryWon: number;
  isLoading?: boolean;
}

function BaselineSalaryInput({
  year,
  isSample,
  value,
  onChange,
  salaryWon,
  isLoading
}: BaselineSalaryInputProps) {
  return (
    <div className="bg-gradient-to-r from-amber-500/10 via-gold/10 to-transparent p-2.5 sm:p-3 rounded-xl border border-gold/30 flex flex-col gap-2 shadow-sm">
      {/* 1행: 라벨 및 현재 기준 연봉 (1줄로 표시, 좁을 시 깔끔하게 줄바꿈) */}
      <div className="flex items-center justify-between gap-1.5 flex-wrap">
        <div className="flex items-center gap-1.5 min-w-0">
          <DollarSign className="w-3.5 h-3.5 text-gold shrink-0" />
          <span className="text-xs font-bold text-white whitespace-nowrap">
            기준 연봉 {!isSample && year ? `(${year}년)` : !isSample ? "(연도 미선택)" : ""}
          </span>
          <span className="text-[10px] text-gold/70 font-normal whitespace-nowrap">
            (수정 가능)
          </span>
        </div>
        <div className="shrink-0 text-right ml-auto">
          {salaryWon > 0 ? (
            <span className="text-xs font-mono font-bold text-gold whitespace-nowrap">
              {formatKoreanSalary(salaryWon)}
            </span>
          ) : (
            <span className="text-[10px] text-amber-300 font-medium bg-amber-500/15 px-1.5 py-0.5 rounded border border-amber-500/25 whitespace-nowrap">
              {year ? "직접 입력 필요" : "0원 (연도 미선택)"}
            </span>
          )}
        </div>
      </div>

      {/* 2행: 수기 입력창 */}
      <div className="relative flex items-center">
        <input
          type="text"
          inputMode="numeric"
          value={value}
          onChange={(e) => {
            const clean = e.target.value.replace(/[^0-9,]/g, "");
            onChange(clean);
          }}
          placeholder={isLoading ? "DB 연봉 조회 중..." : year ? "만원 단위 입력 (예: 9500)" : "연도 선택 후 자동 로드 또는 직접 입력"}
          className="w-full bg-black/60 border border-white/20 focus:border-gold rounded-lg px-2.5 py-1.5 pr-11 text-white text-xs font-mono font-bold outline-none transition-all placeholder:text-gray-500 shadow-inner"
        />
        <span className="absolute right-2.5 text-xs text-gold font-bold pointer-events-none whitespace-nowrap">
          만원
        </span>
      </div>

      {/* 3행: 하단 상태 안내 문구 (1줄로 표시, 좁을 시 깔끔하게 줄바꿈) */}
      <div className="flex items-center justify-between gap-1 text-[10px] text-gray-400 px-0.5 flex-wrap">
        <span className="whitespace-nowrap">
          {salaryWon > 0
            ? `${salaryWon.toLocaleString()}원 기준`
            : "기준 연봉 직접 입력"}
        </span>
        {!isSample && (
          <span className={`whitespace-nowrap ${salaryWon > 0 ? "text-emerald-400 font-medium" : "text-amber-400/80"}`}>
            {salaryWon > 0 ? "✓ 기준 연봉 적용" : year ? "DB 연봉 없음 (직접 입력)" : "연도 선택 시 DB 연봉 자동 로드"}
          </span>
        )}
      </div>
    </div>
  );
}

export default function Simulator() {
  const [storedPlayers, setStoredPlayers] = useState<Player[]>(loadStoredPlayers);
  const [samplePlayers, setSamplePlayers] = useState<Player[]>(loadSamplePlayers);
  const [isSampleModalOpen, setIsSampleModalOpen] = useState(false);
  const [sampleModalInitialPlayer, setSampleModalInitialPlayer] = useState<Player | null>(null);

  // DB 검색 관련 State
  const [searchName, setSearchName] = useState("");
  const [searchTeam, setSearchTeam] = useState<string>("전체");
  const [isSearching, setIsSearching] = useState(false);
  const [searchNotice, setSearchNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // [신규] 전체 DB 일괄 동기화 상태 (타자 및 투수 전체 덮어쓰기 지원)
  const [isBatchSyncing, setIsBatchSyncing] = useState(false);
  const [batchSyncProgress, setBatchSyncProgress] = useState("");

  // 현재 선택된 대상 선수 (Player 객체) - 초기 진입 시 빈칸 및 0원 상태로 대기
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);

  // 샘플 선수 삭제 확인 모달 State
  const [deleteConfirmPlayer, setDeleteConfirmPlayer] = useState<Player | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // [신규] 전체 DB 일괄 동기화 (App_data_DB 및 KBO 최신 성적 조회 -> 타자/투수 덮어쓰기 저장)
  const handleSyncAllPlayers = async () => {
    const currentList = loadStoredPlayers();
    if (currentList.length === 0) {
      setSearchNotice({
        type: "error",
        message: "동기화할 등록된 소속 선수가 없습니다."
      });
      return;
    }

    setIsBatchSyncing(true);
    setBatchSyncProgress("최신 DB 기록 조회 중...");
    let updatedCount = 0;
    let savedDbCount = 0;

    try {
      // 1) App_data_DB (에이전시 소속 선수 DB) 최신 데이터 일괄 fetch
      const appDataMap = new Map<string, Player>();
      try {
        const allAppData = await fetchAppDataFromDatabase();
        allAppData.forEach((p) => {
          if (p.name) appDataMap.set(p.name.trim(), p);
        });
      } catch (err) {
        console.warn("App_data_DB batch sync warning:", err);
      }

      // 2) 전체 소속 선수에 대해 최신 KBO 통계 기록 조회 및 로컬 리스트 갱신 (타자 및 투수 모두 완벽 지원)
      const updatedList = [...currentList];
      for (let i = 0; i < updatedList.length; i++) {
        const p = updatedList[i];
        const pName = p.name.trim();
        setBatchSyncProgress(`기록 조회 중... (${i + 1}/${updatedList.length} ${pName})`);
        const appPlayer = appDataMap.get(pName);
        const basePlayer = appPlayer ? { ...p, ...appPlayer, id: p.id } : p;

        // Stat_Master_DB / 구단 로스터에서 연도별 기록 동기화
        const res = await fetchPlayerFromDatabase(p.name, p.team);
        if (res.success && res.records.length > 0) {
          const conv = convertDbToPlayer(res, basePlayer);
          if (conv) {
            updatedList[i] = { ...conv, id: p.id };
            updatedCount++;
            continue;
          }
        }

        if (appPlayer) {
          updatedList[i] = basePlayer;
          updatedCount++;
        }
      }

      // 로컬 상태 및 localStorage 즉시 업데이트
      setStoredPlayers(updatedList);
      saveStoredPlayers(updatedList);

      // 현재 선택된 선수가 있으면 선택된 선수도 최신 정보로 갱신
      if (selectedPlayer) {
        const updatedSelected = updatedList.find(p => p.id === selectedPlayer.id || (p.name === selectedPlayer.name && p.team === selectedPlayer.team));
        if (updatedSelected) {
          setSelectedPlayer(updatedSelected);
          fetchPlayerFromDatabase(updatedSelected.name, updatedSelected.team)
            .then(res => {
              if (res.success && res.records) setPlayerDbRecords(res.records);
            })
            .catch(() => {});
        }
      }

      // 3) 갱신된 모든 선수 정보를 구글 시트 App_data_DB에 순차적으로 자동 덮어쓰기 저장 (투수 스탯 ERA, WHIP, 승/홀/세 등 온전히 포함)
      for (let i = 0; i < updatedList.length; i++) {
        const p = updatedList[i];
        setBatchSyncProgress(`App_data_DB 저장 중... (${i + 1}/${updatedList.length} ${p.name})`);
        
        try {
          const payload = convertPlayerToAppDbPayload(p, "update");
          const saveRes = await savePlayerToDatabase({ ...payload, force: true });
          if (saveRes.success) {
            savedDbCount++;
          }
        } catch (saveErr) {
          console.warn(`[Simulator.handleSyncAllPlayers] '${p.name}' DB 저장 경고:`, saveErr);
        }

        if (i < updatedList.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }

      setSearchNotice({
        type: "success",
        message: `전체 ${currentList.length}명 중 ${updatedCount}명의 최신 기록(타자 및 투수)이 동기화되고, ${savedDbCount}명이 App_data_DB에 성공적으로 자동 덮어쓰기 저장되었습니다.`
      });
    } catch (e: any) {
      setSearchNotice({
        type: "error",
        message: `일괄 동기화 중 오류가 발생했습니다: ${e.message}`
      });
    } finally {
      setIsBatchSyncing(false);
      setBatchSyncProgress("");
    }
  };

  // [신규] 좌측 기준 지표 및 DB 레코드 상태 관리
  const [playerDbRecords, setPlayerDbRecords] = useState<DbRawPlayerRecord[]>([]);
  const [baselineYear, setBaselineYear] = useState<number>(2025);
  const [isYearDropdownOpen, setIsYearDropdownOpen] = useState<boolean>(false);
  const [isBaselineLoading, setIsBaselineLoading] = useState<boolean>(false);
  const yearDropdownRef = useRef<HTMLDivElement>(null);

  // [신규] 비교 지표 연도 선택 상태 관리
  const [comparisonYear, setComparisonYear] = useState<number>(2025);
  const [isCompYearDropdownOpen, setIsCompYearDropdownOpen] = useState<boolean>(false);
  const compYearDropdownRef = useRef<HTMLDivElement>(null);

  // [신규] 샘플 선수 기준 지표 수동 입력 State
  const [sampleBaselineWar, setSampleBaselineWar] = useState<number>(3.0);
  const [sampleBaselineWrcPlus, setSampleBaselineWrcPlus] = useState<number>(110);
  const [sampleBaselineOps, setSampleBaselineOps] = useState<number>(0.780);
  const [sampleBaselineCsRate, setSampleBaselineCsRate] = useState<number>(32.0);
  const [sampleBaselinePb9, setSampleBaselinePb9] = useState<number>(0.35);
  const [sampleBaselineRf9, setSampleBaselineRf9] = useState<number>(3.90);
  const [sampleBaselineIso, setSampleBaselineIso] = useState<number>(0.160);
  const [sampleBaselineInnings, setSampleBaselineInnings] = useState<number>(DEFAULT_PITCHER_STATS.innings);
  const [sampleBaselineEra, setSampleBaselineEra] = useState<number>(DEFAULT_PITCHER_STATS.era);
  const [sampleBaselineWhip, setSampleBaselineWhip] = useState<number>(DEFAULT_PITCHER_STATS.whip);
  const [isSavingSample, setIsSavingSample] = useState<boolean>(false);
  // [신규] 동일 지표 연속 클릭 및 중복 저장 방지용 스냅샷 Ref
  const lastSavedSnapshotRef = useRef<string | null>(null);

  // 년도 드롭아웃 바깥 클릭 시 닫기
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (yearDropdownRef.current && !yearDropdownRef.current.contains(e.target as Node)) {
        setIsYearDropdownOpen(false);
      }
      if (compYearDropdownRef.current && !compYearDropdownRef.current.contains(e.target as Node)) {
        setIsCompYearDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Sample_Player_DB 구글 시트 원격 동기화 (최신 샘플 선수 조회)
  useEffect(() => {
    const fetchRemoteSamplePlayers = async () => {
      try {
        const timestamp = new Date().getTime();
        const url = `https://script.google.com/macros/s/AKfycbzuv-TBMbIKSM0gUPrb3d99kG82BWvKTXrrdOyQhlYvWf1QKOG5dsNNC5xFM74c/exec?sheetName=Sample_Player_DB&t=${timestamp}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          let rawList: any[] = [];
          if (Array.isArray(data)) rawList = data;
          else if (Array.isArray(data?.data)) rawList = data.data;
          else if (Array.isArray(data?.records)) rawList = data.records;
          else if (Array.isArray(data?.players)) rawList = data.players;

          if (rawList.length > 0) {
            const mapped = rawList.map((item, idx) => {
              const pName = item["선수명"] || item["name"] || `샘플선수_${idx + 1}`;
              const pTeam = item["소속구단"] || item["구단"] || item["team"] || "가상구단";
              const pPos = item["포지션"] || item["position"] || "내야수";
              const pSal = Number(item["현재연봉"] || item["현재 연봉"] || item["salaryCurrent"] || 0);
              const pSalWon = pSal > 5000000 ? pSal : pSal * 10000;
              const pWar = Number(item["기준_WAR"] || item["타자_WAR"] || item["투수_WAR"] || item["WAR"] || item["최근 WAR"] || item["war"] || 0);
              const sDays = item["1군등록일수"] 
                ? `${Math.floor(Number(item["1군등록일수"]) / 145)}년 ${Number(item["1군등록일수"]) % 145}일 (${item["1군등록일수"]}일)` 
                : (item["등록일수"] || "5년 40일 (765일)");

              // 포수 전용 지표 파싱 (모든 가능한 시트 헤더 명칭 대응)
              const rawCs = item["기준_도루저지율"] || item["기준 도루저지율"] || item["기준_도루저지율(CS%)"] || item["기준 도루저지율(CS%)"] || item["기준_CS%"] || item["기준 CS%"] || item["기준_CS"] || item["기준 CS"] || item["도루저지율"] || item["도루저지율(CS%)"] || item["CS%"] || item["CS"] || item["csRate"];
              const parsedCs = rawCs !== undefined && rawCs !== null && rawCs !== "" ? parseFloat(String(rawCs).replace("%", "").trim()) : undefined;

              const rawPb = item["기준_블로킹 지표"] || item["기준 블로킹 지표"] || item["기준_블로킹"] || item["기준 블로킹"] || item["기준_블로킹(PB/9)"] || item["기준 블로킹(PB/9)"] || item["기준_PB/9"] || item["기준 PB/9"] || item["기준_PB9"] || item["기준 PB9"] || item["기준_BLK/9"] || item["블로킹 지표"] || item["블로킹"] || item["PB/9"] || item["PB9"] || item["BLK/9"] || item["pb9"];
              const parsedPb = rawPb !== undefined && rawPb !== null && rawPb !== "" ? parseFloat(String(rawPb).trim()) : undefined;

              // 비교 지표 파싱
              const rawCompCs = item["비교_도루저지율"] || item["비교 도루저지율"] || item["비교_도루저지율(CS%)"] || item["비교_CS%"] || item["비교 CS%"] || item["비교_CS"] || item["목표_도루저지율"] || item["목표_CS%"];
              const parsedCompCs = rawCompCs !== undefined && rawCompCs !== null && rawCompCs !== "" ? parseFloat(String(rawCompCs).replace("%", "").trim()) : undefined;

              const rawCompPb = item["비교_블로킹 지표"] || item["비교 블로킹 지표"] || item["비교_블로킹"] || item["비교_PB/9"] || item["비교 PB/9"] || item["비교_PB9"] || item["비교 PB9"] || item["목표_블로킹 지표"] || item["목표_PB/9"];
              const parsedCompPb = rawCompPb !== undefined && rawCompPb !== null && rawCompPb !== "" ? parseFloat(String(rawCompPb).trim()) : undefined;

              const rawRf9 = item["기준_RF9"] || item["기준 RF9"] || item["수비범위"] || item["RF9"] || item["rf9"];
              const parsedRf9 = rawRf9 !== undefined && rawRf9 !== null && rawRf9 !== "" ? parseFloat(String(rawRf9).trim()) : undefined;

              const rawIso = item["기준_ISO"] || item["기준 ISO"] || item["순수장타율"] || item["ISO"] || item["iso"];
              const parsedIso = rawIso !== undefined && rawIso !== null && rawIso !== "" ? parseFloat(String(rawIso).trim()) : undefined;

              const rawOps = item["기준_OPS"] || item["기준 OPS"] || item["OPS"] || item["ops"];
              const parsedOps = rawOps !== undefined && rawOps !== null && rawOps !== "" ? parseFloat(String(rawOps).trim()) : undefined;

              const rawWrc = item["기준_wRC+"] || item["기준 wRC+"] || item["기준wRC+"] || item["기준_wRC"] || item["기준 wRC"] || item["wRC+"] || item["wRC"] || item["WRC+"] || item["WRC"] || item["wrc+"] || item["wrc"] || item["wrcPlus"] || item["wRCPlus"];
              const parsedWrc = rawWrc !== undefined && rawWrc !== null && rawWrc !== "" ? parseFloat(String(rawWrc).trim()) : undefined;

              // 투수 전용 지표 파싱 (기준 & 비교)
              const rawPitcherIp = item["기준_이닝"] || item["기준 이닝"] || item["이닝"] || item["IP"] || item["투구이닝"] || item["innings"];
              const parsedPitcherIp = rawPitcherIp !== undefined && rawPitcherIp !== null && rawPitcherIp !== "" ? parseFloat(String(rawPitcherIp).trim()) : undefined;

              const rawPitcherEra = item["기준_ERA"] || item["기준 ERA"] || item["ERA"] || item["era"];
              const parsedPitcherEra = rawPitcherEra !== undefined && rawPitcherEra !== null && rawPitcherEra !== "" ? parseFloat(String(rawPitcherEra).trim()) : undefined;

              const rawPitcherWhip = item["기준_WHIP"] || item["기준 WHIP"] || item["WHIP"] || item["whip"];
              const parsedPitcherWhip = rawPitcherWhip !== undefined && rawPitcherWhip !== null && rawPitcherWhip !== "" ? parseFloat(String(rawPitcherWhip).trim()) : undefined;

              const rawCompIp = item["비교_이닝"] || item["비교 이닝"] || item["목표_이닝"] || item["목표 이닝"];
              const parsedCompIp = rawCompIp !== undefined && rawCompIp !== null && rawCompIp !== "" ? parseFloat(String(rawCompIp).trim()) : undefined;

              const rawCompEra = item["비교_ERA"] || item["비교 ERA"] || item["목표_ERA"] || item["목표 ERA"];
              const parsedCompEra = rawCompEra !== undefined && rawCompEra !== null && rawCompEra !== "" ? parseFloat(String(rawCompEra).trim()) : undefined;

              const rawCompWhip = item["비교_WHIP"] || item["비교 WHIP"] || item["목표_WHIP"] || item["목표 WHIP"];
              const parsedCompWhip = rawCompWhip !== undefined && rawCompWhip !== null && rawCompWhip !== "" ? parseFloat(String(rawCompWhip).trim()) : undefined;

              const finalOps = parsedOps || (pPos.includes("투수") ? undefined : 0.810);
              const finalWrc = parsedWrc || (finalOps ? Math.round((finalOps - 0.720) * 250 + 100) : 100);

              const playerObj: Player = {
                id: item["ID"] || item["id"] || `sample-${idx}-${pName}`,
                name: pName,
                team: pTeam,
                position: pPos,
                age: Number(item["나이"]) || 25,
                salaryCurrent: pSalWon,
                draftYear: Number(item["입단연도"]) || 2021,
                serviceTime: sDays,
                contractPeriod: "2026년 01월 01일 ~ 2026년 12월 31일",
                agent: "가상 시뮬레이터",
                stats: [{
                  year: 2025,
                  war: pWar,
                  salary: pSalWon,
                  avg: pPos.includes("투수") ? undefined : 0.285,
                  ops: finalOps,
                  era: parsedPitcherEra || Number(item["ERA"]) || (pPos.includes("투수") ? 3.45 : undefined),
                  whip: parsedPitcherWhip || Number(item["WHIP"]) || (pPos.includes("투수") ? 1.22 : undefined),
                  "CS%": parsedCs,
                  "PB/9": parsedPb,
                  "BLK/9": parsedPb,
                  "도루저지율": parsedCs,
                  "블로킹": parsedPb,
                }]
              };
              (playerObj as any).isSample = true;
              (playerObj as any).csRate = parsedCs;
              (playerObj as any).pb9 = parsedPb;
              (playerObj as any).sampleBaseline = {
                war: pWar,
                wrcPlus: finalWrc,
                ops: finalOps,
                csRate: parsedCs ?? 32.0,
                pb9: parsedPb ?? 0.35,
                rf9: parsedRf9 ?? 3.90,
                iso: parsedIso ?? 0.160,
                innings: parsedPitcherIp ?? DEFAULT_PITCHER_STATS.innings,
                era: parsedPitcherEra ?? DEFAULT_PITCHER_STATS.era,
                whip: parsedPitcherWhip ?? DEFAULT_PITCHER_STATS.whip,
              };
              (playerObj as any).sampleComparison = {
                war: Number(item["비교_WAR"] || item["목표_WAR"] || pWar),
                wrcPlus: Number(item["비교_wRC+"] || item["목표_wRC+"] || finalWrc),
                ops: Number(item["비교_OPS"] || item["목표_OPS"] || finalOps),
                csRate: parsedCompCs ?? parsedCs ?? 32.0,
                pb9: parsedCompPb ?? parsedPb ?? 0.35,
                rf9: parsedRf9 ?? 3.90,
                iso: parsedIso ?? 0.160,
                innings: parsedCompIp ?? parsedPitcherIp ?? DEFAULT_PITCHER_STATS.innings,
                era: parsedCompEra ?? parsedPitcherEra ?? DEFAULT_PITCHER_STATS.era,
                whip: parsedCompWhip ?? parsedPitcherWhip ?? DEFAULT_PITCHER_STATS.whip,
              };

              return playerObj;
            });

            setSamplePlayers(prev => {
              const combined = mapped.map(m => {
                const prevMatch = prev.find(p => p.id === m.id || (p.name === m.name && p.team === m.team));
                if (prevMatch) {
                  return {
                    ...prevMatch,
                    ...m,
                    sampleBaseline: {
                      ...((prevMatch as any).sampleBaseline || {}),
                      ...((m as any).sampleBaseline || {}),
                    },
                    sampleComparison: {
                      ...((prevMatch as any).sampleComparison || {}),
                      ...((m as any).sampleComparison || {}),
                    }
                  };
                }
                return m;
              });
              for (const p of prev) {
                if (!combined.some(c => c.id === p.id || (c.name === p.name && c.team === p.team))) {
                  combined.push(p);
                }
              }
              saveSamplePlayersToStorage(combined);
              return combined;
            });
          }
        }
      } catch (err) {
        console.log("Sample_Player_DB 조회 안내 (로컬 저장소 유지):", err);
      }
    };

    fetchRemoteSamplePlayers();
  }, []);

  // 샘플 선수 적용 및 Sample_Player_DB 연동 저장 핸들러
  const handleApplySamplePlayer = (player: Player, savedToRemoteDb?: boolean) => {
    const existingIdx = samplePlayers.findIndex(p => p.id === player.id);
    const isUpdate = existingIdx >= 0;
    let updatedList: Player[];
    if (isUpdate) {
      updatedList = [...samplePlayers];
      updatedList[existingIdx] = player;
    } else {
      updatedList = [player, ...samplePlayers.filter(p => p.id !== player.id)];
    }
    setSamplePlayers(updatedList);
    saveSamplePlayersToStorage(updatedList);

    // 샘플 선수는 Sample_Player_DB 전용이므로 소속 선수 로컬 캐시와 분리 보장
    const currentStored = loadStoredPlayers();
    const cleanedStored = currentStored.filter(
      p => p.id !== player.id && !(p.name === player.name && (p as any).isSample)
    );
    if (cleanedStored.length !== currentStored.length) {
      saveStoredPlayers(cleanedStored);
      setStoredPlayers(cleanedStored);
    }

    lastSavedSnapshotRef.current = null;
    setSelectedPlayer(player);
    setSearchNotice({
      type: "success",
      message: `${isUpdate ? "✏️ 샘플 선수 수정 완료" : "🧪 새 샘플 선수 등록 완료"}: '${player.name}' (${player.team} • ${player.position}) 정보가 시뮬레이터에 적용되었습니다.${savedToRemoteDb ? " (구글 스프레드시트 Sample_Player_DB 동기화 완료)" : " 상단의 [데이터 저장] 버튼을 누르면 구글 시트 데이터베이스에 영구 저장됩니다."}`
    });
  };

  // 샘플 선수 삭제 확인 모달 열기
  const handleRequestDelete = (player: Player) => {
    setDeleteConfirmPlayer(player);
  };

  // 샘플 선수 실제 삭제 처리 (로컬 + 구글 스프레드시트 Sample_Player_DB 원격 연동 삭제)
  const handleConfirmDelete = async () => {
    if (!deleteConfirmPlayer || isDeleting) return;

    const target = deleteConfirmPlayer;
    setIsDeleting(true);

    let remoteSuccess = false;
    try {
      const res = await deleteSamplePlayerFromDatabase({
        id: target.id,
        name: target.name,
        team: target.team,
      });
      remoteSuccess = res.remoteDeleted ?? res.success;
    } catch (err) {
      console.error("Sample_Player_DB 원격 삭제 오류:", err);
    }

    // 1) samplePlayers 목록에서 삭제
    const updated = samplePlayers.filter(p => p.id !== target.id);
    setSamplePlayers(updated);
    saveSamplePlayersToStorage(updated);

    // 2) storedPlayers에서도 동기화 정리
    const currentStored = loadStoredPlayers();
    const updatedStored = currentStored.filter(
      p => p.id !== target.id && !(p.name === target.name && p.team === target.team)
    );
    if (updatedStored.length !== currentStored.length) {
      saveStoredPlayers(updatedStored);
      setStoredPlayers(updatedStored);
    }

    // 3) 만약 현재 시뮬레이터에 선택된 선수라면 선택 해제
    if (selectedPlayer?.id === target.id) {
      setSelectedPlayer(null);
    }

    setSearchNotice({
      type: "success",
      message: `🗑️ 샘플 선수 삭제 완료: '${target.name}' (${target.team} • ${target.position}) 정보가 로컬 및 Sample_Player_DB 데이터베이스에서 완전히 삭제되었습니다.${remoteSuccess ? " (구글 시트 연동 삭제 완료)" : ""}`
    });

    setIsDeleting(false);
    setDeleteConfirmPlayer(null);
  };

  // 1. 공통 WAR (모든 포지션)
  const [targetWar, setTargetWar] = useState(DEFAULT_WAR);

  // 2. 타자(포수, 내/외야수) 공통 기본 타격 지표
  const [hitterWrcPlus, setHitterWrcPlus] = useState(DEFAULT_HITTER_STATS.wrcPlus);
  const [hitterOps, setHitterOps] = useState(DEFAULT_HITTER_STATS.ops);

  // 3. 포수 프리미엄 지표: [도루저지율(CS%), 블로킹(PB/9)]
  const [catcherCsRate, setCatcherCsRate] = useState(DEFAULT_CATCHER_PREMIUM.csRate);
  const [catcherPb9, setCatcherPb9] = useState(DEFAULT_CATCHER_PREMIUM.pb9);

  // 4. 내야수/외야수 프리미엄 지표: [RF9(수비범위), ISO(순수장타율)]
  const [fielderRf9, setFielderRf9] = useState(DEFAULT_FIELDER_PREMIUM.rf9);
  const [fielderIso, setFielderIso] = useState(DEFAULT_FIELDER_PREMIUM.iso);

  // 5. 투수 전용 파라미터: [이닝(IP), ERA, WHIP] (ERA, WHIP는 낮을수록 우수)
  const [pitcherInnings, setPitcherInnings] = useState(DEFAULT_PITCHER_STATS.innings);
  const [pitcherEra, setPitcherEra] = useState(DEFAULT_PITCHER_STATS.era);
  const [pitcherWhip, setPitcherWhip] = useState(DEFAULT_PITCHER_STATS.whip);
  
  const [report, setReport] = useState<string>("");
  const [loading, setLoading] = useState(false);

  // 로컬 소속 선수 변경 리스너
  useEffect(() => {
    const handleUpdate = () => {
      const updated = loadStoredPlayers();
      setStoredPlayers(updated);
    };
    window.addEventListener("kbo_players_updated", handleUpdate);
    return () => window.removeEventListener("kbo_players_updated", handleUpdate);
  }, []);

  const positionCategory = useMemo(() => {
    return classifyPosition(selectedPlayer?.position);
  }, [selectedPlayer?.position]);

  // 연봉 원(KRW) 단위 보정:
  // 1) 500억원 초과 비정상적인 값(과거 중복 10,000 곱셈 오류) 복원
  // 2) 500만 미만 숫자(만원 단위 입력)는 10,000을 곱해 원(KRW) 단위로 변환
  // 3) 500만 이상 숫자(이미 원 단위인 경우, 예: 손성빈 6,000만원 = 60,000,000)는 그대로 유지
  let rawSalary = selectedPlayer?.salaryCurrent || 0;
  while (rawSalary > 50000000000) {
    rawSalary = Math.round(rawSalary / 10000);
  }
  const currentSalaryWon = !selectedPlayer ? 0 : (rawSalary < 5000000 ? rawSalary * 10000 : rawSalary);

  // [기준 지표 연봉 수동 입력 및 동기화 상태]
  // 사용자가 직접 기준 연봉을 만원 단위로 수정할 수 있으며, 연도 변경 시 DB 연봉으로 재동기화됨
  const [manualBaselineSalaryText, setManualBaselineSalaryText] = useState<string>("");

  const manualBaselineSalaryWon = useMemo(() => {
    if (!manualBaselineSalaryText || manualBaselineSalaryText.trim() === "") return 0;
    return parsePlayerSalary(manualBaselineSalaryText);
  }, [manualBaselineSalaryText]);

  // 최종 기준 연봉(원 단위): 입력칸의 값이 우선 반영되며, 비어있으면 0원
  const effectiveBaselineSalaryWon = manualBaselineSalaryWon;

  // [상태 관리]: 선택된 선수가 변경될 때 연도를 선택하기 전까지 모든 지표를 0으로 초기화
  useEffect(() => {
    if (!selectedPlayer) return;
    // 샘플 선수는 전용 지표 세팅 효과에서 관리하므로 일반 초기화 건너뜀
    if (isSamplePlayer) return;

    // [요구사항]: 연도를 선택하기 전까지는 기준 지표 및 비교 지표의 모든 값을 0으로 표시
    setBaselineYear(null);
    setComparisonYear(null);
    setManualBaselineSalaryText("");

    setTargetWar(0);
    setPitcherInnings(0);
    setPitcherEra(0);
    setPitcherWhip(0);
    setHitterWrcPlus(0);
    setHitterOps(0);
    setCatcherCsRate(0);
    setCatcherPb9(0);
    setFielderRf9(0);
    setFielderIso(0);

    // 선수 변경 시 기존 리포트 초기화
    setReport("");
  }, [selectedPlayer?.id, selectedPlayer?.name, selectedPlayer?.position, isSamplePlayer]);

  // [신규] 선택된 선수가 변경되었을 때 데이터베이스에서 해당 선수의 전체 시즌 레코드(연도별 실적) 비동기 조회
  useEffect(() => {
    if (!selectedPlayer) {
      setPlayerDbRecords([]);
      return;
    }

    // 이미 현재 선수의 레코드가 들어있는지 확인
    const alreadyHasRecords = playerDbRecords.length > 0 && playerDbRecords.some((r) => {
      const rName = r.선수명 || r.이름 || r.name || "";
      return rName === selectedPlayer.name;
    });

    if (alreadyHasRecords) return;

    let isCancelled = false;
    setIsBaselineLoading(true);

    fetchPlayerFromDatabase(selectedPlayer.name, selectedPlayer.team)
      .then((res) => {
        if (!isCancelled && res.success && res.records && res.records.length > 0) {
          setPlayerDbRecords(res.records);
        }
      })
      .catch((err) => {
        console.warn("선수 DB 레코드 비동기 로드 실패:", err);
      })
      .finally(() => {
        if (!isCancelled) setIsBaselineLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [selectedPlayer?.name, selectedPlayer?.team]);

  // [신규] 드롭다운에서 선택 가능한 연도 목록 도출 (DB 레코드 및 선수 과거 성적 기반)
  const availableYears = useMemo(() => {
    const yearsSet = new Set<number>();

    if (playerDbRecords && playerDbRecords.length > 0) {
      playerDbRecords.forEach((r) => {
        const yRaw = getValue(r, ["연도", "시즌", "year", "Year", "season"]);
        const y = typeof yRaw === "number" ? yRaw : parseInt(String(yRaw).replace(/[^0-9]/g, ""), 10);
        if (y && y >= 2015 && y <= 2026) {
          yearsSet.add(y);
        }
      });
    }

    if (selectedPlayer?.stats && selectedPlayer.stats.length > 0) {
      selectedPlayer.stats.forEach((s) => {
        if (s.year && s.year >= 2015 && s.year <= 2026) {
          yearsSet.add(s.year);
        }
      });
    }

    if (yearsSet.size === 0) {
      [2025, 2024, 2023, 2022].forEach((y) => yearsSet.add(y));
    } else {
      [2025, 2024].forEach((y) => yearsSet.add(y));
    }

    return Array.from(yearsSet).sort((a, b) => b - a);
  }, [playerDbRecords, selectedPlayer?.stats]);

  // 사용 가능한 연도 목록이 갱신되었을 때 이미 선택된 baselineYear가 유효하지 않은 경우만 보정 (null 미선택 상태는 자동 선택하지 않음)
  useEffect(() => {
    if (baselineYear !== null && availableYears.length > 0 && !availableYears.includes(baselineYear)) {
      setBaselineYear(availableYears[0] ?? null);
    }
  }, [availableYears, baselineYear]);

  useEffect(() => {
    if (comparisonYear !== null && availableYears.length > 0 && !availableYears.includes(comparisonYear)) {
      setComparisonYear(availableYears[0] ?? null);
    }
  }, [availableYears, comparisonYear]);

  // [신규] 기준 지표 연도 선택 시 해당 시즌의 DB 성적 및 연봉 불러오기
  const handleSelectBaselineYear = (yr: number) => {
    setBaselineYear(yr);
    setIsYearDropdownOpen(false);
  };

  // [신규] 좌측 기준 지표 데이터 도출 (선택된 baselineYear 기준, 연도 선택 전까지는 0으로 표시)
  const baselineStats = useMemo(() => {
    if (!selectedPlayer) return null;

    // [요구사항]: 연도를 선택하기 전까지는 기준 지표의 모든 값을 0으로 반환
    if (!baselineYear) {
      return {
        year: null,
        war: 0,
        wrcPlus: 0,
        ops: 0,
        avg: 0,
        hr: 0,
        salaryWon: 0,
        csRate: 0,
        pb9: 0,
        rf9: 0,
        iso: 0,
        innings: 0,
        era: 0,
        whip: 0,
        wls: undefined,
        games: 0,
        pa: 0,
        hasDbRecord: false
      };
    }

    const merged = mergeRawRecordsForYear(playerDbRecords, baselineYear, selectedPlayer.name);
    const pStat = selectedPlayer.stats?.find((s) => s.year === baselineYear);

    // 1. WAR 추출
    let war = 0;
    if (merged) {
      war = extractWarFromObject(merged);
    } else if (pStat?.war !== undefined && pStat?.war !== null) {
      war = pStat.war;
    } else {
      war = 0;
    }

    // 2. OPS 추출
    let ops = 0;
    if (merged) {
      const mOps = extractOpsFromObject(merged);
      if (mOps !== undefined && mOps > 0) {
        ops = mOps;
      } else if (pStat?.ops) {
        ops = pStat.ops;
      }
    } else if (pStat?.ops) {
      ops = pStat.ops;
    }

    // 3. AVG 및 HR 보조 지표
    let avg = pStat?.avg ?? 0;
    let hr = pStat?.hr ?? 0;
    if (merged) {
      const mAvg = extractAvgFromObject(merged);
      if (mAvg !== undefined) avg = mAvg;
      const mHr = extractHrFromObject(merged);
      if (mHr !== undefined) hr = mHr;
    }

    // 4. wRC+ 추출 (DB 레코드 또는 OPS 기반 추정)
    let wrcPlus = 0;
    if (merged) {
      const rawWrc = getValue(merged, ["wRC+", "WRC+", "wrc+", "wRC", "WRC"]);
      if (rawWrc !== undefined && rawWrc !== null && rawWrc !== "" && rawWrc !== "-") {
        const parsedWrc = parseFloat(String(rawWrc));
        if (!isNaN(parsedWrc)) wrcPlus = Math.round(parsedWrc);
      } else if (ops > 0) {
        wrcPlus = Math.round((ops - 0.720) * 250 + 100);
      }
    } else if (ops > 0) {
      wrcPlus = Math.round((ops - 0.720) * 250 + 100);
    }

    // 5. 해당 시즌 수령 연봉 (기록이 있을 경우)
    let salaryWon = 0;
    if (merged) {
      const rawSal = getValue(merged, ["연봉", "현재 연봉", "현재연봉", "salary"]);
      if (rawSal) salaryWon = parsePlayerSalary(rawSal);
    }
    if (!salaryWon && pStat?.salary) {
      salaryWon = pStat.salary;
    }

    // 6. 포수 전용 지표 (CS%, PB/9)
    let csRate = 0;
    let pb9 = 0;
    if (merged) {
      const rawCs = extractCsFromObject(merged) ?? getValue(merged, ["CS%", "cs%", "도루저지율"]);
      if (rawCs !== undefined) {
        const parsedCs = parsePlayerCsPercent(rawCs);
        if (parsedCs !== undefined) csRate = parsedCs;
      }
      const rawPb = getValue(merged, ["PB/9", "Pass/9", "PASS/9", "BLK/9", "PB", "폭투포일"]);
      if (rawPb !== undefined && rawPb !== "" && rawPb !== "-") {
        const parsedPb = parseFloat(String(rawPb));
        if (!isNaN(parsedPb)) pb9 = parsedPb;
      }
    }

    // 7. 내/외야수 전용 지표 (RF9, ISO)
    let rf9 = 0;
    let iso = 0;
    if (merged) {
      const rawRf9 = getValue(merged, ["RF9", "rf9", "Rf9", "RF/9"]);
      if (rawRf9 !== undefined && rawRf9 !== "" && rawRf9 !== "-") {
        const parsedRf9 = parseFloat(String(rawRf9));
        if (!isNaN(parsedRf9)) rf9 = parsedRf9;
      }
      const rawIso = getValue(merged, ["ISOP", "ISO", "iso", "Iso"]);
      if (rawIso !== undefined && rawIso !== "" && rawIso !== "-") {
        const parsedIso = parseFloat(String(rawIso));
        if (!isNaN(parsedIso)) iso = parsedIso;
      } else if (ops && avg) {
        iso = Math.max(0, parseFloat((ops - avg - 0.08).toFixed(3)));
      }
    } else if (ops && avg) {
      iso = Math.max(0, parseFloat((ops - avg - 0.08).toFixed(3)));
    }

    // 8. 투수 전용 지표 (이닝, ERA, WHIP, 승패)
    let innings = 0;
    let era = 0;
    let whip = 0;
    let wls: string | undefined = undefined;
    if (merged) {
      const rawIp = getValue(merged, ["IP", "투수이닝", "투구이닝", "이닝", "innings"]);
      if (rawIp !== undefined && rawIp !== null && rawIp !== "" && rawIp !== "-") {
        const parsedIp = parseFloat(String(rawIp));
        if (!isNaN(parsedIp)) innings = Math.round(parsedIp);
      }
      const mEra = extractEraFromObject(merged);
      if (mEra !== undefined) era = mEra;
      const mWhip = extractWhipFromObject(merged);
      if (mWhip !== undefined) whip = mWhip;
      const rawWls = getValue(merged, ["승패", "W-L", "W/L", "성적", "기록", "wls"]);
      if (rawWls) wls = String(rawWls);
    } else if (pStat) {
      if (typeof pStat.era === "number") era = pStat.era;
      if (typeof pStat.whip === "number") whip = pStat.whip;
      if (pStat.wls) wls = pStat.wls;
    }

    const games = merged ? getValue(merged, ["G", "경기", "경기수"]) : undefined;
    const pa = merged ? getValue(merged, ["PA", "타석"]) : undefined;

    return {
      year: baselineYear,
      war: Number(war.toFixed(2)),
      wrcPlus,
      ops: Number(ops.toFixed(3)),
      avg: avg !== undefined ? Number(avg.toFixed(3)) : undefined,
      hr: hr !== undefined ? Number(hr) : undefined,
      salaryWon,
      csRate: Number(csRate.toFixed(1)),
      pb9: Number(pb9.toFixed(2)),
      rf9: Number(rf9.toFixed(2)),
      iso: Number(iso.toFixed(3)),
      innings: Number(innings),
      era: Number(era.toFixed(2)),
      whip: Number(whip.toFixed(2)),
      wls,
      games: games !== undefined && games !== "" ? Number(games) : undefined,
      pa: pa !== undefined && pa !== "" ? Number(pa) : undefined,
      hasDbRecord: Boolean(merged)
    };
  }, [baselineYear, selectedPlayer, playerDbRecords]);

  // 샘플 선수 여부 판별 (수동 입력 및 DB 격리 대상)
  const isSamplePlayer = useMemo(() => {
    if (!selectedPlayer) return false;
    return Boolean(
      (selectedPlayer as any).isSample ||
      selectedPlayer.id?.startsWith("sample-") ||
      selectedPlayer.name?.includes("샘플") ||
      selectedPlayer.name?.includes("가상") ||
      samplePlayers.some((sp) => sp.id === selectedPlayer.id)
    );
  }, [selectedPlayer, samplePlayers]);

  // 샘플 선수 선택 시 기존 지표 불러오기 및 기본값 세팅
  useEffect(() => {
    if (!selectedPlayer || !isSamplePlayer) return;

    const sampleBase = (selectedPlayer as any).sampleBaseline;
    const pStat = selectedPlayer.stats?.[0];
    const cat = classifyPosition(selectedPlayer.position);
    const isCatcher = cat === 'CATCHER';
    const isFielder = cat === 'FIELDER';
    const isPitcher = cat === 'PITCHER';

    const defaultWar = typeof sampleBase?.war === "number"
      ? sampleBase.war
      : (typeof pStat?.war === "number" ? pStat.war : 2.8);
    const defaultOps = typeof sampleBase?.ops === "number"
      ? sampleBase.ops
      : (typeof pStat?.ops === "number" ? pStat.ops : 0.780);
    const defaultWrc = typeof sampleBase?.wrcPlus === "number"
      ? sampleBase.wrcPlus
      : Math.round((defaultOps - 0.720) * 250 + 100);

    // 포수일 때만 CS% 및 PB/9 유효값 파싱, 외야수/내야수일 때는 0 세팅
    const defaultCs = isCatcher
      ? (typeof sampleBase?.csRate === "number"
          ? sampleBase.csRate
          : (typeof (pStat as any)?.["CS%"] === "number"
              ? (pStat as any)["CS%"]
              : (typeof (pStat as any)?.["도루저지율"] === "number"
                  ? (pStat as any)["도루저지율"]
                  : (typeof (selectedPlayer as any)?.csRate === "number"
                      ? (selectedPlayer as any).csRate
                      : 30.0))))
      : 0;

    const defaultPb = isCatcher
      ? (typeof sampleBase?.pb9 === "number"
          ? sampleBase.pb9
          : (typeof (pStat as any)?.["PB/9"] === "number"
              ? (pStat as any)["PB/9"]
              : (typeof (pStat as any)?.["BLK/9"] === "number"
                  ? (pStat as any)["BLK/9"]
                  : (typeof (pStat as any)?.["블로킹"] === "number"
                      ? (pStat as any)["블로킹"]
                      : (typeof (selectedPlayer as any)?.pb9 === "number"
                          ? (selectedPlayer as any).pb9
                          : 0.38)))))
      : 0;

    const defaultInnings = isPitcher
      ? (typeof sampleBase?.innings === "number"
          ? sampleBase.innings
          : (typeof (selectedPlayer as any)?.innings === "number"
              ? (selectedPlayer as any).innings
              : DEFAULT_PITCHER_STATS.innings))
      : DEFAULT_PITCHER_STATS.innings;

    const defaultEra = isPitcher
      ? (typeof sampleBase?.era === "number"
          ? sampleBase.era
          : (typeof pStat?.era === "number" ? pStat.era : DEFAULT_PITCHER_STATS.era))
      : DEFAULT_PITCHER_STATS.era;

    const defaultWhip = isPitcher
      ? (typeof sampleBase?.whip === "number"
          ? sampleBase.whip
          : (typeof pStat?.whip === "number" ? pStat.whip : DEFAULT_PITCHER_STATS.whip))
      : DEFAULT_PITCHER_STATS.whip;

    setSampleBaselineWar(defaultWar);
    setSampleBaselineOps(defaultOps);
    setSampleBaselineWrcPlus(defaultWrc);
    setSampleBaselineCsRate(defaultCs);
    setSampleBaselinePb9(defaultPb);
    setSampleBaselineRf9(typeof sampleBase?.rf9 === "number" ? sampleBase.rf9 : 3.90);
    setSampleBaselineIso(typeof sampleBase?.iso === "number" ? sampleBase.iso : 0.160);
    setSampleBaselineInnings(defaultInnings);
    setSampleBaselineEra(defaultEra);
    setSampleBaselineWhip(defaultWhip);

    const sampleComp = (selectedPlayer as any).sampleComparison;
    if (sampleComp) {
      if (typeof sampleComp.war === "number") setTargetWar(sampleComp.war);
      if (typeof sampleComp.wrcPlus === "number") setHitterWrcPlus(sampleComp.wrcPlus);
      if (typeof sampleComp.ops === "number") setHitterOps(sampleComp.ops);
      if (isCatcher) {
        if (typeof sampleComp.csRate === "number") setCatcherCsRate(sampleComp.csRate);
        else setCatcherCsRate(defaultCs);
        if (typeof sampleComp.pb9 === "number") setCatcherPb9(sampleComp.pb9);
        else setCatcherPb9(defaultPb);
      }
      if (isFielder) {
        if (typeof sampleComp.rf9 === "number") setFielderRf9(sampleComp.rf9);
        if (typeof sampleComp.iso === "number") setFielderIso(sampleComp.iso);
      }
      if (isPitcher) {
        if (typeof sampleComp.innings === "number") setPitcherInnings(sampleComp.innings);
        else setPitcherInnings(defaultInnings);
        if (typeof sampleComp.era === "number") setPitcherEra(sampleComp.era);
        else setPitcherEra(defaultEra);
        if (typeof sampleComp.whip === "number") setPitcherWhip(sampleComp.whip);
        else setPitcherWhip(defaultWhip);
      }
    } else {
      if (isCatcher) {
        setCatcherCsRate(defaultCs);
        setCatcherPb9(defaultPb);
      }
      if (isPitcher) {
        setPitcherInnings(defaultInnings);
        setPitcherEra(defaultEra);
        setPitcherWhip(defaultWhip);
      }
    }
  }, [selectedPlayer?.id, isSamplePlayer, selectedPlayer]);

  // [신규] 유효 기준 지표: 일반 선수는 baselineStats, 샘플 선수는 수동 입력된 sampleBaseline 지표 사용
  // 기준 연봉은 사용자가 직접 수정한 값(effectiveBaselineSalaryWon)이 최우선 반영됨
  const effectiveBaselineStats = useMemo(() => {
    if (isSamplePlayer) {
      return {
        year: 2025,
        war: sampleBaselineWar,
        wrcPlus: sampleBaselineWrcPlus,
        ops: sampleBaselineOps,
        avg: selectedPlayer?.stats?.[0]?.avg ?? 0.285,
        hr: selectedPlayer?.stats?.[0]?.hr ?? 15,
        salaryWon: effectiveBaselineSalaryWon,
        csRate: sampleBaselineCsRate,
        pb9: sampleBaselinePb9,
        rf9: sampleBaselineRf9,
        iso: sampleBaselineIso,
        innings: sampleBaselineInnings,
        era: sampleBaselineEra,
        whip: sampleBaselineWhip,
        games: 144,
        pa: 550,
        hasDbRecord: false,
      };
    }
    if (!baselineStats) return null;
    return {
      ...baselineStats,
      salaryWon: effectiveBaselineSalaryWon,
    };
  }, [
    isSamplePlayer,
    sampleBaselineWar,
    sampleBaselineWrcPlus,
    sampleBaselineOps,
    sampleBaselineCsRate,
    sampleBaselinePb9,
    sampleBaselineRf9,
    sampleBaselineIso,
    sampleBaselineInnings,
    sampleBaselineEra,
    sampleBaselineWhip,
    selectedPlayer,
    effectiveBaselineSalaryWon,
    baselineStats,
  ]);

  // [요구사항 1 & 2]: 연도 선택 시 연봉 정보가 DB에 있으면 그 정보를 그대로 가져오고, 없으면 빈칸으로 설정
  useEffect(() => {
    if (!selectedPlayer) {
      setManualBaselineSalaryText("");
      return;
    }

    if (isSamplePlayer) {
      const sal = (selectedPlayer as any).sampleBaseline?.salaryWon || selectedPlayer.salaryCurrent || 0;
      if (sal > 0) {
        const manwon = parsePlayerSalaryToManwon(sal);
        setManualBaselineSalaryText(manwon > 0 ? String(manwon) : "");
      } else {
        setManualBaselineSalaryText("");
      }
      return;
    }

    // 일반 선수: DB 레코드 또는 stats에서 선택된 baselineYear의 연봉 탐색
    const merged = mergeRawRecordsForYear(playerDbRecords, baselineYear, selectedPlayer.name);
    const pStat = selectedPlayer.stats?.find((s) => s.year === baselineYear);

    let salWon = 0;
    if (merged) {
      const rawSal = getValue(merged, ["연봉", "현재 연봉", "현재연봉", "salary", "당해연봉", "시즌연봉", "금액"]);
      if (rawSal !== undefined && rawSal !== null && rawSal !== "" && rawSal !== "-") {
        salWon = parsePlayerSalary(rawSal);
      }
    }
    if (!salWon && pStat?.salary) {
      salWon = pStat.salary;
    }

    if (salWon > 0) {
      const manwon = parsePlayerSalaryToManwon(salWon);
      setManualBaselineSalaryText(manwon > 0 ? String(manwon) : "");
    } else {
      // 해당 연도에 DB 연봉 정보가 없으면 빈칸으로 설정
      setManualBaselineSalaryText("");
    }
  }, [selectedPlayer?.id, selectedPlayer?.name, baselineYear, playerDbRecords, isSamplePlayer]);

  // [신규] 비교 지표 연도 선택 시 해당 시즌의 DB 성적 불러와 비교 슬라이더에 세팅
  const handleSelectComparisonYear = (yr: number) => {
    setComparisonYear(yr);
    setIsCompYearDropdownOpen(false);

    if (!selectedPlayer) return;

    const merged = mergeRawRecordsForYear(playerDbRecords, yr, selectedPlayer.name);
    const pStat = selectedPlayer.stats?.find((s) => s.year === yr);

    let war = 0;
    if (merged) {
      war = extractWarFromObject(merged);
    } else if (pStat?.war !== undefined && pStat?.war !== null) {
      war = pStat.war;
    } else {
      war = 0;
    }

    let ops = 0;
    if (merged) {
      const mOps = extractOpsFromObject(merged);
      if (mOps !== undefined && mOps > 0) ops = mOps;
      else if (pStat?.ops) ops = pStat.ops;
    } else if (pStat?.ops) {
      ops = pStat.ops;
    }

    let wrcPlus = 0;
    if (merged) {
      const rawWrc = getValue(merged, ["wRC+", "WRC+", "wrc+", "wRC", "WRC"]);
      if (rawWrc !== undefined && rawWrc !== null && rawWrc !== "" && rawWrc !== "-") {
        const parsedWrc = parseFloat(String(rawWrc));
        if (!isNaN(parsedWrc)) wrcPlus = Math.round(parsedWrc);
      } else if (ops > 0) {
        wrcPlus = Math.round((ops - 0.720) * 250 + 100);
      }
    } else if (ops > 0) {
      wrcPlus = Math.round((ops - 0.720) * 250 + 100);
    }

    let csRate = 0;
    let pb9 = 0;
    if (merged) {
      const rawCs = extractCsFromObject(merged) ?? getValue(merged, ["CS%", "cs%", "도루저지율"]);
      if (rawCs !== undefined) {
        const parsedCs = parsePlayerCsPercent(rawCs);
        if (parsedCs !== undefined) csRate = parsedCs;
      }
      const rawPb = getValue(merged, ["PB/9", "Pass/9", "PASS/9", "BLK/9", "PB", "폭투포일"]);
      if (rawPb !== undefined && rawPb !== "" && rawPb !== "-") {
        const parsedPb = parseFloat(String(rawPb));
        if (!isNaN(parsedPb)) pb9 = parsedPb;
      }
    }

    let rf9 = 0;
    let iso = 0;
    if (merged) {
      const rawRf9 = getValue(merged, ["RF9", "rf9", "Rf9", "RF/9"]);
      if (rawRf9 !== undefined && rawRf9 !== "" && rawRf9 !== "-") {
        const parsedRf9 = parseFloat(String(rawRf9));
        if (!isNaN(parsedRf9)) rf9 = parsedRf9;
      }
      const rawIso = getValue(merged, ["ISOP", "ISO", "iso", "Iso"]);
      if (rawIso !== undefined && rawIso !== "" && rawIso !== "-") {
        const parsedIso = parseFloat(String(rawIso));
        if (!isNaN(parsedIso)) iso = parsedIso;
      } else if (ops && pStat?.avg) {
        iso = Math.max(0, parseFloat((ops - pStat.avg - 0.08).toFixed(3)));
      }
    }

    setTargetWar(Number(war.toFixed(2)));
    if (positionCategory === 'PITCHER') {
      let innings = 0;
      let era = 0;
      let whip = 0;
      if (merged) {
        const rawIp = getValue(merged, ["IP", "투수이닝", "투구이닝", "이닝"]);
        if (rawIp !== undefined && rawIp !== null && rawIp !== "" && rawIp !== "-") {
          const parsedIp = parseFloat(String(rawIp));
          if (!isNaN(parsedIp)) innings = Math.round(parsedIp);
        }
        const mEra = extractEraFromObject(merged);
        if (mEra !== undefined) era = mEra;
        const mWhip = extractWhipFromObject(merged);
        if (mWhip !== undefined) whip = mWhip;
      } else if (pStat) {
        if (typeof pStat.era === "number") era = pStat.era;
        if (typeof pStat.whip === "number") whip = pStat.whip;
      }
      setPitcherInnings(innings);
      setPitcherEra(era);
      setPitcherWhip(whip);
    } else {
      setHitterWrcPlus(wrcPlus);
      setHitterOps(Number(ops.toFixed(3)));
      if (positionCategory === 'CATCHER') {
        setCatcherCsRate(Number(csRate.toFixed(1)));
        setCatcherPb9(Number(pb9.toFixed(2)));
      } else {
        setFielderRf9(Number(rf9.toFixed(2)));
        setFielderIso(Number(iso.toFixed(3)));
      }
    }
  };

  // [신규] 샘플 선수의 기준 지표 및 비교 지표 데이터베이스(Sample_Player_DB) 저장 핸들러
  const handleSaveSampleStatsToDatabase = async () => {
    if (!selectedPlayer || !isSamplePlayer) return;

    const cat = classifyPosition(selectedPlayer.position);
    const isCatcher = cat === 'CATCHER';
    const isFielder = cat === 'FIELDER';
    const isPitcher = cat === 'PITCHER';

    // [중복 저장 방지 1]: 현재 저장하려는 전체 지표 스냅샷 생성
    const currentSnapshot = JSON.stringify({
      id: selectedPlayer.id,
      name: selectedPlayer.name,
      team: selectedPlayer.team,
      cat,
      sampleBaselineWar,
      sampleBaselineWrcPlus: isPitcher ? null : sampleBaselineWrcPlus,
      sampleBaselineOps: isPitcher ? null : sampleBaselineOps,
      sampleBaselineCsRate: isCatcher ? sampleBaselineCsRate : null,
      sampleBaselinePb9: isCatcher ? sampleBaselinePb9 : null,
      sampleBaselineRf9: isFielder ? sampleBaselineRf9 : null,
      sampleBaselineIso: isFielder ? sampleBaselineIso : null,
      targetWar,
      hitterWrcPlus: !isPitcher ? hitterWrcPlus : null,
      hitterOps: !isPitcher ? hitterOps : null,
      catcherCsRate: isCatcher ? catcherCsRate : null,
      catcherPb9: isCatcher ? catcherPb9 : null,
      fielderRf9: isFielder ? fielderRf9 : null,
      fielderIso: isFielder ? fielderIso : null,
      pitcherInnings: isPitcher ? pitcherInnings : null,
      pitcherEra: isPitcher ? pitcherEra : null,
      pitcherWhip: isPitcher ? pitcherWhip : null,
    });

    // 이미 저장된 지표와 완전히 동일한 상태에서 다시 [데이터 저장] 버튼을 누른 경우 중복 저장 차단
    if (lastSavedSnapshotRef.current === currentSnapshot) {
      setSearchNotice({
        type: "info",
        message: `ℹ️ '${selectedPlayer.name}' 선수의 최신 지표가 이미 데이터베이스에 저장되어 있습니다. (변경된 지표 없음)`
      });
      return;
    }

    setIsSavingSample(true);

    try {
      const updatedStats = [
        {
          year: 2025,
          war: sampleBaselineWar,
          salary: selectedPlayer.salaryCurrent,
          ops: isPitcher ? undefined : sampleBaselineOps,
          avg: isPitcher ? undefined : (selectedPlayer.stats?.[0]?.avg ?? 0.285),
          hr: isPitcher ? undefined : (selectedPlayer.stats?.[0]?.hr ?? 15),
          era: isPitcher ? sampleBaselineEra : undefined,
          whip: isPitcher ? sampleBaselineWhip : undefined,
          wls: isPitcher ? "10승 6패" : undefined,
          "CS%": isCatcher ? sampleBaselineCsRate : undefined,
          "PB/9": isCatcher ? sampleBaselinePb9 : undefined,
          "BLK/9": isCatcher ? sampleBaselinePb9 : undefined,
          "도루저지율": isCatcher ? sampleBaselineCsRate : undefined,
          "블로킹": isCatcher ? sampleBaselinePb9 : undefined,
          "RF9": isFielder ? sampleBaselineRf9 : undefined,
          "ISO": isFielder ? sampleBaselineIso : undefined,
        }
      ];

      const updatedPlayer: Player = {
        ...selectedPlayer,
        stats: updatedStats,
      };

      (updatedPlayer as any).isSample = true;
      (updatedPlayer as any).csRate = isCatcher ? sampleBaselineCsRate : undefined;
      (updatedPlayer as any).pb9 = isCatcher ? sampleBaselinePb9 : undefined;
      (updatedPlayer as any).sampleBaseline = {
        war: sampleBaselineWar,
        wrcPlus: isPitcher ? undefined : sampleBaselineWrcPlus,
        ops: isPitcher ? undefined : sampleBaselineOps,
        csRate: isCatcher ? sampleBaselineCsRate : undefined,
        pb9: isCatcher ? sampleBaselinePb9 : undefined,
        rf9: isFielder ? sampleBaselineRf9 : undefined,
        iso: isFielder ? sampleBaselineIso : undefined,
        innings: isPitcher ? sampleBaselineInnings : undefined,
        era: isPitcher ? sampleBaselineEra : undefined,
        whip: isPitcher ? sampleBaselineWhip : undefined,
      };
      (updatedPlayer as any).sampleComparison = {
        war: targetWar,
        wrcPlus: isPitcher ? undefined : hitterWrcPlus,
        ops: isPitcher ? undefined : hitterOps,
        csRate: isCatcher ? catcherCsRate : undefined,
        pb9: isCatcher ? catcherPb9 : undefined,
        rf9: isFielder ? fielderRf9 : undefined,
        iso: isFielder ? fielderIso : undefined,
        innings: isPitcher ? pitcherInnings : undefined,
        era: isPitcher ? pitcherEra : undefined,
        whip: isPitcher ? pitcherWhip : undefined,
      };

      // 1) Update local storage samplePlayers
      const currentSampleList = loadSamplePlayers();
      const existingIdx = currentSampleList.findIndex((p) => p.id === updatedPlayer.id);
      let updatedSampleList: Player[];
      if (existingIdx >= 0) {
        updatedSampleList = [...currentSampleList];
        updatedSampleList[existingIdx] = updatedPlayer;
      } else {
        updatedSampleList = [updatedPlayer, ...currentSampleList];
      }
      saveSamplePlayersToStorage(updatedSampleList);
      setSamplePlayers(updatedSampleList);
      setSelectedPlayer(updatedPlayer);

      // 2) Save to Google Sheets DB (Sample_Player_DB)
      // 포지션별 지표에 해당하는 내용만 엄격히 선별하여 단일 키로 전송 (외야수/내야수 저장 시 CS% 등 불필요 지표 완전 제외)
      const payload: Record<string, any> = {
        sheetName: "Sample_Player_DB",
        targetSheet: "Sample_Player_DB",
        sheet: "Sample_Player_DB",
        type: "sample_player",
        action: "save_sample",
        isSample: true,
        id: updatedPlayer.id,
        ID: updatedPlayer.id,
        선수명: updatedPlayer.name,
        name: updatedPlayer.name,
        소속구단: updatedPlayer.team,
        team: updatedPlayer.team,
        포지션: updatedPlayer.position,
        position: updatedPlayer.position,
        나이: updatedPlayer.age,
        age: updatedPlayer.age,
        현재연봉: updatedPlayer.salaryCurrent,
        "현재 연봉": updatedPlayer.salaryCurrent,
        salary: updatedPlayer.salaryCurrent,
        salaryCurrent: updatedPlayer.salaryCurrent,
        입단연도: updatedPlayer.draftYear,
        draftYear: updatedPlayer.draftYear,
        "1군등록일수": updatedPlayer.serviceTime,
        serviceTime: updatedPlayer.serviceTime,
      };

      if (isCatcher) {
        // 포수 전용: WAR, wRC+, OPS, 도루저지율(CS%), 블로킹 지표(PB/9)만 저장 (RF9, ISO 절대 저장 안함)
        payload["기준_WAR"] = sampleBaselineWar;
        payload["기준 WAR"] = sampleBaselineWar;
        payload["WAR"] = sampleBaselineWar;

        // wRC+ 포수 기준 지표 완벽 매핑
        payload["기준_wRC+"] = sampleBaselineWrcPlus;
        payload["기준 wRC+"] = sampleBaselineWrcPlus;
        payload["기준wRC+"] = sampleBaselineWrcPlus;
        payload["기준_wRC"] = sampleBaselineWrcPlus;
        payload["기준 wRC"] = sampleBaselineWrcPlus;
        payload["기준wRC"] = sampleBaselineWrcPlus;
        payload["wRC+"] = sampleBaselineWrcPlus;
        payload["wRC"] = sampleBaselineWrcPlus;
        payload["WRC+"] = sampleBaselineWrcPlus;
        payload["WRC"] = sampleBaselineWrcPlus;
        payload["wrc+"] = sampleBaselineWrcPlus;
        payload["wrc"] = sampleBaselineWrcPlus;
        payload["wrcPlus"] = sampleBaselineWrcPlus;
        payload["wRCPlus"] = sampleBaselineWrcPlus;
        payload["기준_wRCplus"] = sampleBaselineWrcPlus;
        payload["기준 wRCplus"] = sampleBaselineWrcPlus;

        payload["기준_OPS"] = sampleBaselineOps;
        payload["기준 OPS"] = sampleBaselineOps;
        payload["OPS"] = sampleBaselineOps;

        payload["기준_도루저지율"] = sampleBaselineCsRate;
        payload["기준 도루저지율"] = sampleBaselineCsRate;
        payload["기준도루저지율"] = sampleBaselineCsRate;
        payload["기준_도루저지율(CS%)"] = sampleBaselineCsRate;
        payload["기준 도루저지율(CS%)"] = sampleBaselineCsRate;
        payload["기준_CS%"] = sampleBaselineCsRate;
        payload["기준 CS%"] = sampleBaselineCsRate;
        payload["도루저지율"] = sampleBaselineCsRate;
        payload["CS%"] = sampleBaselineCsRate;
        payload["csRate"] = sampleBaselineCsRate;

        payload["기준_블로킹 지표"] = sampleBaselinePb9;
        payload["기준 블로킹 지표"] = sampleBaselinePb9;
        payload["기준_블로킹지표"] = sampleBaselinePb9;
        payload["기준블로킹지표"] = sampleBaselinePb9;
        payload["기준_블로킹"] = sampleBaselinePb9;
        payload["기준 블로킹"] = sampleBaselinePb9;
        payload["기준_블로킹(PB/9)"] = sampleBaselinePb9;
        payload["기준 블로킹(PB/9)"] = sampleBaselinePb9;
        payload["기준_PB/9"] = sampleBaselinePb9;
        payload["기준 PB/9"] = sampleBaselinePb9;
        payload["블로킹 지표"] = sampleBaselinePb9;
        payload["PB/9"] = sampleBaselinePb9;
        payload["pb9"] = sampleBaselinePb9;

        // 비교 지표 (포수)
        payload["비교_WAR"] = targetWar;
        payload["비교 WAR"] = targetWar;
        payload["목표_WAR"] = targetWar;

        // wRC+ 포수 비교 지표 완벽 매핑
        payload["비교_wRC+"] = hitterWrcPlus;
        payload["비교 wRC+"] = hitterWrcPlus;
        payload["비교wRC+"] = hitterWrcPlus;
        payload["비교_wRC"] = hitterWrcPlus;
        payload["비교 wRC"] = hitterWrcPlus;
        payload["비교wRC"] = hitterWrcPlus;
        payload["목표_wRC+"] = hitterWrcPlus;
        payload["목표 wRC+"] = hitterWrcPlus;
        payload["목표wRC+"] = hitterWrcPlus;
        payload["목표_wRC"] = hitterWrcPlus;
        payload["목표 wRC"] = hitterWrcPlus;
        payload["목표wRC"] = hitterWrcPlus;
        payload["비교_wRCplus"] = hitterWrcPlus;
        payload["비교 wRCplus"] = hitterWrcPlus;
        payload["비교_wrc+"] = hitterWrcPlus;
        payload["목표_wrc+"] = hitterWrcPlus;

        payload["비교_OPS"] = hitterOps;
        payload["비교 OPS"] = hitterOps;
        payload["목표_OPS"] = hitterOps;

        payload["비교_도루저지율"] = catcherCsRate;
        payload["비교 도루저지율"] = catcherCsRate;
        payload["비교_CS%"] = catcherCsRate;
        payload["비교 CS%"] = catcherCsRate;
        payload["목표_도루저지율"] = catcherCsRate;

        payload["비교_블로킹 지표"] = catcherPb9;
        payload["비교 블로킹 지표"] = catcherPb9;
        payload["비교_PB/9"] = catcherPb9;
        payload["비교 PB/9"] = catcherPb9;
        payload["목표_블로킹 지표"] = catcherPb9;
      } else if (isFielder) {
        // 외야수 / 내야수: WAR, wRC+, OPS, RF9, ISO만 저장 (도루저지율 CS%, 블로킹 지표 PB/9 절대 포함 금지!)
        payload["기준_WAR"] = sampleBaselineWar;
        payload["기준 WAR"] = sampleBaselineWar;
        payload["WAR"] = sampleBaselineWar;

        // wRC+ 내야수/외야수 기준 지표 완벽 매핑 (모든 변형 헤더 키 지원)
        payload["기준_wRC+"] = sampleBaselineWrcPlus;
        payload["기준 wRC+"] = sampleBaselineWrcPlus;
        payload["기준wRC+"] = sampleBaselineWrcPlus;
        payload["기준_wRC"] = sampleBaselineWrcPlus;
        payload["기준 wRC"] = sampleBaselineWrcPlus;
        payload["기준wRC"] = sampleBaselineWrcPlus;
        payload["wRC+"] = sampleBaselineWrcPlus;
        payload["wRC"] = sampleBaselineWrcPlus;
        payload["WRC+"] = sampleBaselineWrcPlus;
        payload["WRC"] = sampleBaselineWrcPlus;
        payload["wrc+"] = sampleBaselineWrcPlus;
        payload["wrc"] = sampleBaselineWrcPlus;
        payload["wrcPlus"] = sampleBaselineWrcPlus;
        payload["wRCPlus"] = sampleBaselineWrcPlus;
        payload["기준_wRCplus"] = sampleBaselineWrcPlus;
        payload["기준 wRCplus"] = sampleBaselineWrcPlus;
        payload["기준_wrc+"] = sampleBaselineWrcPlus;
        payload["기준 wrc+"] = sampleBaselineWrcPlus;

        payload["기준_OPS"] = sampleBaselineOps;
        payload["기준 OPS"] = sampleBaselineOps;
        payload["OPS"] = sampleBaselineOps;

        payload["기준_RF9"] = sampleBaselineRf9;
        payload["기준 RF9"] = sampleBaselineRf9;
        payload["RF9"] = sampleBaselineRf9;
        payload["기준_ISO"] = sampleBaselineIso;
        payload["기준 ISO"] = sampleBaselineIso;
        payload["ISO"] = sampleBaselineIso;

        // 비교 지표 (외야수 / 내야수)
        payload["비교_WAR"] = targetWar;
        payload["비교 WAR"] = targetWar;
        payload["목표_WAR"] = targetWar;

        // wRC+ 내야수/외야수 비교 지표 완벽 매핑
        payload["비교_wRC+"] = hitterWrcPlus;
        payload["비교 wRC+"] = hitterWrcPlus;
        payload["비교wRC+"] = hitterWrcPlus;
        payload["비교_wRC"] = hitterWrcPlus;
        payload["비교 wRC"] = hitterWrcPlus;
        payload["비교wRC"] = hitterWrcPlus;
        payload["목표_wRC+"] = hitterWrcPlus;
        payload["목표 wRC+"] = hitterWrcPlus;
        payload["목표wRC+"] = hitterWrcPlus;
        payload["목표_wRC"] = hitterWrcPlus;
        payload["목표 wRC"] = hitterWrcPlus;
        payload["목표wRC"] = hitterWrcPlus;
        payload["비교_wRCplus"] = hitterWrcPlus;
        payload["비교 wRCplus"] = hitterWrcPlus;
        payload["비교_wrc+"] = hitterWrcPlus;
        payload["목표_wrc+"] = hitterWrcPlus;

        payload["비교_OPS"] = hitterOps;
        payload["비교 OPS"] = hitterOps;
        payload["목표_OPS"] = hitterOps;

        payload["비교_RF9"] = fielderRf9;
        payload["비교 RF9"] = fielderRf9;
        payload["목표_RF9"] = fielderRf9;
        payload["비교_ISO"] = fielderIso;
        payload["비교 ISO"] = fielderIso;
        payload["목표_ISO"] = fielderIso;
      } else if (isPitcher) {
        // 투수: WAR, 이닝, ERA, WHIP, 승/홀/세만 저장 (타자/포수 지표 절대 포함 금지!)
        payload["기준_WAR"] = sampleBaselineWar;
        payload["기준 WAR"] = sampleBaselineWar;
        payload["WAR"] = sampleBaselineWar;
        payload["기준_이닝"] = sampleBaselineInnings;
        payload["기준 이닝"] = sampleBaselineInnings;
        payload["이닝"] = sampleBaselineInnings;
        payload["IP"] = sampleBaselineInnings;
        payload["기준_ERA"] = sampleBaselineEra;
        payload["기준 ERA"] = sampleBaselineEra;
        payload["ERA"] = sampleBaselineEra;
        payload["기준_WHIP"] = sampleBaselineWhip;
        payload["기준 WHIP"] = sampleBaselineWhip;
        payload["WHIP"] = sampleBaselineWhip;

        // 비교 지표 (투수)
        payload["비교_WAR"] = targetWar;
        payload["비교 WAR"] = targetWar;
        payload["목표_WAR"] = targetWar;
        payload["비교_이닝"] = pitcherInnings;
        payload["비교 이닝"] = pitcherInnings;
        payload["목표_이닝"] = pitcherInnings;
        payload["비교_ERA"] = pitcherEra;
        payload["비교 ERA"] = pitcherEra;
        payload["목표_ERA"] = pitcherEra;
        payload["비교_WHIP"] = pitcherWhip;
        payload["비교 WHIP"] = pitcherWhip;
        payload["목표_WHIP"] = pitcherWhip;
      }

      // [중복 저장 방지 2]: 구글 시트에 동일 선수가 이미 존재할 경우,
      // 기존 레코드를 먼저 원격 삭제(delete)하여 행이 누적되는 것을 방지한 후, 최신 지표 1개 행으로 Upsert 저장
      try {
        await deleteSamplePlayerFromDatabase({
          id: updatedPlayer.id,
          name: updatedPlayer.name,
          team: updatedPlayer.team,
        });
      } catch (delErr) {
        console.warn("기존 샘플 레코드 정리 중 알림 (신규 선수일 수 있음):", delErr);
      }

      const res = await saveSamplePlayerToDatabase(payload);
      const isRemoteSuccess = res.remoteSaved ?? res.success;

      // 성공 시 마지막 저장 스냅샷 기록 (동일한 데이터로 연속 클릭 시 차단)
      lastSavedSnapshotRef.current = currentSnapshot;

      setSearchNotice({
        type: "success",
        message: `💾 '${updatedPlayer.name}' 선수의 기준 지표(WAR ${sampleBaselineWar.toFixed(2)}) 및 비교 지표(WAR ${targetWar.toFixed(2)}) 데이터가 데이터베이스에 성공적으로 저장되었습니다.${isRemoteSuccess ? " (Sample_Player_DB 구글 시트 원격 동기화 완료)" : ""}`
      });
    } catch (err: any) {
      console.error("샘플 선수 지표 DB 저장 실패:", err);
      setSearchNotice({
        type: "error",
        message: `데이터 저장 중 오류가 발생했습니다: ${err?.message || "알 수 없는 오류"}`
      });
    } finally {
      setIsSavingSample(false);
    }
  };

  // [신규] 기준 지표 스탯을 우측 비교 지표 슬라이더에 1클릭 복사
  const handleApplyBaselineToComparison = () => {
    if (!effectiveBaselineStats) return;
    setTargetWar(effectiveBaselineStats.war);
    if (positionCategory === 'PITCHER') {
      if ((effectiveBaselineStats as any).innings !== undefined) setPitcherInnings((effectiveBaselineStats as any).innings);
      if ((effectiveBaselineStats as any).era !== undefined) setPitcherEra((effectiveBaselineStats as any).era);
      if ((effectiveBaselineStats as any).whip !== undefined) setPitcherWhip((effectiveBaselineStats as any).whip);
    } else {
      setHitterWrcPlus(effectiveBaselineStats.wrcPlus);
      setHitterOps(effectiveBaselineStats.ops);
      if (positionCategory === 'CATCHER') {
        if (effectiveBaselineStats.csRate !== undefined) setCatcherCsRate(effectiveBaselineStats.csRate);
        if (effectiveBaselineStats.pb9 !== undefined) setCatcherPb9(effectiveBaselineStats.pb9);
      } else {
        if (effectiveBaselineStats.rf9 !== undefined) setFielderRf9(effectiveBaselineStats.rf9);
        if (effectiveBaselineStats.iso !== undefined) setFielderIso(effectiveBaselineStats.iso);
      }
    }
  };

  // [신규] 기준 지표 대비 비교 지표 증감 배지 렌더러
  function renderDeltaBadge(diff: number, format: (val: number) => string, invertGoodBad = false) {
    if (Math.abs(diff) < 0.0001) {
      return (
        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white/5 text-gray-400 border border-white/10 whitespace-nowrap">
          동일 (=)
        </span>
      );
    }
    const isPositive = diff > 0;
    const isGood = invertGoodBad ? !isPositive : isPositive;
    const colorClass = isGood
      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
      : "bg-rose-500/15 text-rose-400 border-rose-500/30";
    const prefix = isPositive ? "+" : "";
    const arrow = isPositive ? "▲" : "▼";

    return (
      <span className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded border whitespace-nowrap ${colorClass}`}>
        {prefix}{format(diff)} {arrow}
      </span>
    );
  }

  // DB 실시간 선수 검색 핸들러 (구글 스프레드시트 DB 및 등록/샘플 DB 연계 검색)
  async function handleSearchFromDatabase(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const trimmed = searchName.trim();
    if (!trimmed) {
      setSearchNotice({ type: "error", message: "선수명을 입력해주세요." });
      return;
    }

    setIsSearching(true);
    setSearchNotice(null);

    // 1. 등록된 샘플 선수 및 소속 선수에서 빠른 매칭 확인
    const matchedSample = samplePlayers.find(
      p => p.name === trimmed || p.name.includes(trimmed) || trimmed.includes(p.name)
    );
    const matchedStored = storedPlayers.find(
      p => (p.name === trimmed || p.name.includes(trimmed) || trimmed.includes(p.name)) &&
           (searchTeam === "전체" || p.team.includes(searchTeam) || searchTeam.includes(p.team.slice(0, 2)))
    );

    try {
      const targetTeam = searchTeam === "전체" ? undefined : searchTeam;
      const result = await fetchPlayerFromDatabase(trimmed, targetTeam);

      if (result.success && result.records.length > 0) {
        setPlayerDbRecords(result.records);
        const converted = convertDbToPlayer(result);
        if (converted) {
          setSelectedPlayer(converted);
          setSearchNotice({
            type: "success",
            message: `DB 조회 성공: ${converted.team} ${converted.name} (${converted.position}) 선수 데이터가 적용되었습니다.`
          });
          return;
        } else {
          setSearchNotice({ type: "error", message: `'${trimmed}' 선수의 스탯을 변환하지 못했습니다.` });
        }
      } else {
        // 원격 DB에 없을 경우 로컬 샘플 선수 또는 소속 선수에서 대체 로드
        if (matchedSample) {
          setSelectedPlayer(matchedSample);
          setSearchNotice({
            type: "success",
            message: `샘플 선수 DB 조회 성공: ${matchedSample.team} ${matchedSample.name} (${matchedSample.position}) 데이터가 적용되었습니다.`
          });
          return;
        }
        if (matchedStored) {
          setSelectedPlayer(matchedStored);
          setSearchNotice({
            type: "success",
            message: `등록 선수 DB 조회 성공: ${matchedStored.team} ${matchedStored.name} (${matchedStored.position}) 데이터가 적용되었습니다.`
          });
          return;
        }

        setSearchNotice({
          type: "error",
          message: result.error || `'${trimmed}' 선수를 데이터베이스에서 찾을 수 없습니다. 이름과 구단을 확인해주세요.`
        });
      }
    } catch (err: any) {
      console.error("DB 검색 오류:", err);
      if (matchedSample) {
        setSelectedPlayer(matchedSample);
        setSearchNotice({
          type: "success",
          message: `샘플 선수 로컬 데이터가 적용되었습니다: ${matchedSample.name} (${matchedSample.team})`
        });
      } else if (matchedStored) {
        setSelectedPlayer(matchedStored);
        setSearchNotice({
          type: "success",
          message: `등록 선수 로컬 데이터가 적용되었습니다: ${matchedStored.name} (${matchedStored.team})`
        });
      } else {
        setSearchNotice({ type: "error", message: "구글 스프레드시트 DB 조회 중 통신 오류가 발생했습니다." });
      }
    } finally {
      setIsSearching(false);
    }
  }

  // 1. 선수의 1군 등록일수(Service Time) 및 KBO 규정 기준 FA / 비FA 판정
  const serviceTimeInfo = useMemo(() => {
    if (!selectedPlayer) {
      return {
        raw: "",
        display: "-",
        seasons: 0,
        remainDays: 0,
        totalDays: 0,
        isNonFA: true,
        faRequirementSeasons: 7,
        remainingSeasonsToFA: 7
      };
    }
    const rawService = (selectedPlayer as any)?.등록일수 ?? (selectedPlayer as any)?.["총등록일수"] ?? selectedPlayer?.serviceTime ?? "";
    return parseServiceTimeFaStatus(rawService);
  }, [selectedPlayer]);

  // 입단 연도 및 프로 연차(2026 시즌 기준) 계산 (보조 데이터)
  const draftInfo = useMemo(() => {
    if (!selectedPlayer?.draftYear) return { draftYear: 0, display: "-" };
    return parseDraftYear(selectedPlayer.draftYear);
  }, [selectedPlayer?.draftYear]);

  const currentSeasonYear = 2026;
  const careerYears = useMemo(() => {
    if (draftInfo.draftYear > 0) {
      return Math.max(1, currentSeasonYear - draftInfo.draftYear + 1);
    }
    if (selectedPlayer?.age && selectedPlayer.age >= 19) {
      return Math.max(1, selectedPlayer.age - 19);
    }
    return 4;
  }, [draftInfo.draftYear, selectedPlayer?.age]);

  // KBO 야구규약 기준 FA / 비FA 판별 (1군 등록일수 7~8시즌 요건 기준)
  // 등록일수 데이터가 존재하면 1군 등록일수(7시즌/1,015일 미달)를 최우선 기준으로 판정
  const isNonFA = useMemo(() => {
    if (!selectedPlayer) return true;
    if (serviceTimeInfo.totalDays > 0 || serviceTimeInfo.seasons > 0) {
      return serviceTimeInfo.isNonFA;
    }
    // 등록일수 데이터가 미상인 경우 입단 연차(8년차 미만)로 안전하게 판별
    return careerYears < 8;
  }, [selectedPlayer, serviceTimeInfo, careerYears]);

  // 2. 포지션별 가치 모델링 기반 보너스 계산 (4대 정밀 고과/시장가치 알고리즘 적용)
  const playerPositionStr = ((selectedPlayer?.position || "") + " " + ((selectedPlayer as any)?.positionDetail || "")).toLowerCase();
  
  // [알고리즘 2 판별]: 불펜 투수 (pitcherInnings <= 90 또는 세부 포지션에 구원/마무리/불펜/계투/셋업 포함)
  const isReliefPitcher = positionCategory === 'PITCHER' && (
    pitcherInnings <= 90 ||
    playerPositionStr.includes("구원") ||
    playerPositionStr.includes("마무리") ||
    playerPositionStr.includes("불펜") ||
    playerPositionStr.includes("중간") ||
    playerPositionStr.includes("계투") ||
    playerPositionStr.includes("셋업") ||
    playerPositionStr.includes("relief") ||
    playerPositionStr.includes("closer")
  );

  let rawPositionBonus = 0;
  let volumeMultiplier = 1.0;

  if (positionCategory === 'PITCHER') {
    if (isReliefPitcher) {
      // [알고리즘 2]: 불펜 투수 전용 가중치 (Relief Pitcher Weighting)
      // 기준점: ERA 3.50, WHIP 1.20 기준 (엄격한 기준 적용)
      // 보너스 배수 1.5배 상향, 누적 이닝 패널티 면제 및 이닝당 가치 400만원 상향
      const innBonus = Math.max(0, (pitcherInnings - 40) * 4000000);
      const eraBonus = (3.50 - pitcherEra) * 70000000 * 1.5;
      const whipBonus = (1.20 - pitcherWhip) * 400000000 * 1.5;
      rawPositionBonus = innBonus + eraBonus + whipBonus;

      // [알고리즘 1]: 불펜 투수 볼륨 가중치 (50이닝 기준 스몰 샘플 거품 방어)
      volumeMultiplier = Math.min(1.0, pitcherInnings / 50);
    } else {
      // 선발 투수
      const innBonus = (pitcherInnings - 100) * 2000000;
      const eraBonus = (4.00 - pitcherEra) * 70000000;
      const whipBonus = (1.30 - pitcherWhip) * 400000000;
      rawPositionBonus = innBonus + eraBonus + whipBonus;

      // [알고리즘 1]: 선발 투수 볼륨 가중치 (120이닝 기준 스몰 샘플 거품 방어)
      volumeMultiplier = Math.min(1.0, pitcherInnings / 120);
    }
  } else {
    // 모든 타자(포수, 내/외야수) 공통 타격 기여도
    const wrcBonus = (hitterWrcPlus - 100) * 5000000;
    const opsBonus = (hitterOps - 0.720) * 800000000;

    // 포지션 프리미엄 추가 가산점
    let premiumBonus = 0;
    if (positionCategory === 'CATCHER') {
      const csBonus = (catcherCsRate - 28) * 9000000;
      const pbBonus = (0.50 - catcherPb9) * 200000000; // PB/9 낮을수록 포수 블로킹 가산점
      premiumBonus = csBonus + pbBonus;
    } else {
      const rf9Bonus = (fielderRf9 - 3.50) * 60000000;
      const isoBonus = (fielderIso - 0.150) * 1200000000;
      premiumBonus = rf9Bonus + isoBonus;
    }
    rawPositionBonus = wrcBonus + opsBonus + premiumBonus;

    // [알고리즘 1]: 타자 볼륨 가중치 (400타석 기준 스몰 샘플 거품 방어)
    const batterPa = (effectiveBaselineStats?.pa && effectiveBaselineStats.pa > 0) ? effectiveBaselineStats.pa : 400;
    volumeMultiplier = Math.min(1.0, batterPa / 400);
  }

  // 비율 스탯 볼륨 가중치 적용 최종 positionBonus
  const positionBonus = rawPositionBonus * volumeMultiplier;

  // [알고리즘 3]: 나이 대비 감가상각 곡선 (Aging Curve)
  // 조건: selectedPlayer.age >= 32
  // 로직: 31세를 초과하는 1년당 FA 환산 가치를 5%씩 삭감 (최대 30% 삭감 제한)
  const playerAge = selectedPlayer?.age ?? 0;
  const isAgingCurveApplied = Boolean(selectedPlayer && playerAge >= 32);
  const ageMultiplier = isAgingCurveApplied ? Math.max(0.70, 1.0 - (playerAge - 31) * 0.05) : 1.0;

  // [트랙 1]: 데이터 기반 FA 환산 시장 가치 (WAR 1.0당 1.5억 ~ 2.0억원 + 핵심 포지션 가중치 및 에이징 커브 적용)
  // 음수 WAR 입력 시에도 최저 연봉 3,000만원(KBO 규정) 하한 보장
  const unadjustedFaMin = Math.max(30000000, targetWar * 150000000 + positionBonus);
  const unadjustedFaMax = Math.max(unadjustedFaMin, targetWar * 200000000 + positionBonus * 1.25);
  const pureFaMin = Math.max(30000000, Math.round(unadjustedFaMin * ageMultiplier));
  const pureFaMax = Math.max(pureFaMin, Math.round(unadjustedFaMax * ageMultiplier));

  // [핵심 로직 수정]: 예상 연봉 계산의 기준 연봉을 선수의 현재 연봉(currentSalaryWon)이 아니라 기준 지표에 있는 연봉(effectiveBaselineSalaryWon)으로 설정
  const baselineBaseSalaryWon = effectiveBaselineSalaryWon;

  let minFaEstimate = 0;
  let maxFaEstimate = 0;

  if (selectedPlayer && baselineYear) {
    if (pureFaMin >= baselineBaseSalaryWon * 0.95) {
      // 1) 순수 세이버메트릭스 시장 가치가 기준 연봉보다 높거나 저연봉 구간 선수
      minFaEstimate = pureFaMin;
      maxFaEstimate = pureFaMax;
    } else {
      // 2) 기준 연봉(예: 42억원)이 순수 WAR 단순 계산치를 크게 상회하는 고액 연봉/기존 FA 스타:
      // 기준 연봉을 베이스라인으로 유지하되, 목표 스탯(WAR 편차 및 포지션 프리미엄 보너스)의 가감을 실시간으로 연동 (에이징 커브 승수 적용)
      const warDelta = targetWar - 4.0;
      const statAdjustmentMin = (warDelta * 150000000 + positionBonus) * ageMultiplier;
      const statAdjustmentMax = (warDelta * 200000000 + positionBonus * 1.25) * ageMultiplier;

      minFaEstimate = Math.max(30000000, Math.max(baselineBaseSalaryWon * 0.60, baselineBaseSalaryWon * 0.95 + statAdjustmentMin));
      maxFaEstimate = Math.max(minFaEstimate * 1.05, baselineBaseSalaryWon * 1.10 + statAdjustmentMax);
    }
  }

  const roundedMinFa = (selectedPlayer && baselineYear) ? Math.round(minFaEstimate / 5000000) * 5000000 : 0;
  const roundedMaxFa = (selectedPlayer && baselineYear) ? Math.round(maxFaEstimate / 5000000) * 5000000 : 0;

  // [알고리즘 4 판별]: 저연봉자 폭발적 인상 로직 (Breakout Multiplier)
  // 조건: isNonFA === true 이고 currentSalaryWon(또는 기준연봉) <= 100000000 (1억 이하) 이며 targetWar >= 2.0 인 경우
  const currentOrBaseSalaryWon = baselineBaseSalaryWon > 0 ? baselineBaseSalaryWon : currentSalaryWon;
  const isBreakoutCandidate = Boolean(selectedPlayer && isNonFA && currentOrBaseSalaryWon <= 100000000 && targetWar >= 2.0);

  // [트랙 2]: 현실적 협상 목표액 (비FA 구단 고과 인상/삭감 공식 및 폭발적 인상 로직 적용)
  let practicalBase = 0;
  if (!selectedPlayer || !baselineYear) {
    practicalBase = 0;
  } else if (isNonFA) {
    if (isBreakoutCandidate) {
      // [알고리즘 4 적용]: KBO 고과 시뮬레이션의 기존 제한(20% 룰)을 무시하고,
      // baselineBaseSalaryWon + (targetWar * 40000000) 공식을 '현실적 협상 목표액'에 다이렉트 적용 (WAR 1.0당 4천만 원 파격 인상 보장)
      const breakoutDirectIncrease = targetWar * 40000000;
      const scaledPosBonus = Math.max(-20000000, Math.min(30000000, positionBonus * 0.15));
      practicalBase = Math.max(30000000, baselineBaseSalaryWon + breakoutDirectIncrease + scaledPosBonus);
    } else {
      // 일반 KBO 구단 고과 시뮬레이션 공식 (기준 지표 연봉 기반 산출):
      // 공식 1: 기준 연봉 + (기준 연봉 * (WAR * 0.2))
      const salaryRateIncrease = baselineBaseSalaryWon * (targetWar * 0.20);
      // 공식 2: 기준 연봉 + (WAR * 3,000만원)
      const warDirectIncrease = targetWar * 30000000;

      let practicalIncrease = 0;
      if (targetWar >= 0) {
        // 양수 WAR: 저연봉 구간 선수의 기여도 보호를 위해 둘 중 더 유리한 인상안 채택
        practicalIncrease = Math.max(salaryRateIncrease, warDirectIncrease);
      } else {
        // 음수 WAR: 성적 부진 고과 삭감 시뮬레이션 (KBO 규약상 최대 -30% 한도 및 최저 연봉 보호)
        practicalIncrease = Math.max(-baselineBaseSalaryWon * 0.30, Math.min(salaryRateIncrease, warDirectIncrease));
      }

      // 포지션 프리미엄을 비FA 고과 스케일에 맞게 온건하게 가산 (최대 ±3,000만원 제한)
      const scaledPosBonus = Math.max(-20000000, Math.min(30000000, positionBonus * 0.15));

      // 최저 3,000만원(KBO 규정) 하한선 보장
      practicalBase = Math.max(30000000, baselineBaseSalaryWon + practicalIncrease + scaledPosBonus);
    }
  } else {
    // 1군 등록일수 요건을 충족한 FA 선수는 시장 가치가 곧 현실적 목표액
    practicalBase = (minFaEstimate + maxFaEstimate) / 2;
  }

  // 현실적 협상 목표액 범위 (Min ~ Max Range)
  const minPracticalEstimate = (!selectedPlayer || !baselineYear)
    ? 0
    : isNonFA
    ? Math.max(30000000, Math.round((practicalBase * 0.90) / 5000000) * 5000000)
    : roundedMinFa;
  const maxPracticalEstimate = (!selectedPlayer || !baselineYear)
    ? 0
    : isNonFA
    ? Math.max(minPracticalEstimate, Math.round((practicalBase * 1.10) / 5000000) * 5000000)
    : roundedMaxFa;

  const roundedMinPractical = (selectedPlayer && baselineYear) ? Math.round(minPracticalEstimate / 5000000) * 5000000 : 0;
  const roundedMaxPractical = (selectedPlayer && baselineYear) ? Math.round(maxPracticalEstimate / 5000000) * 5000000 : 0;

  // 기준 지표 연봉 대비 현실적 목표액 인상/삭감폭 정밀 계산
  // 1) 인상 국면: 최대 인상 타겟은 최고 예상액(roundedMaxPractical) - 기준 연봉
  // 2) 삭감 국면: 최대 삭감 예상은 최저 예상액(roundedMinPractical)까지 떨어진 경우인 기준 연봉 - roundedMinPractical
  const isPureIncrease = Boolean(selectedPlayer && baselineBaseSalaryWon > 0 && roundedMinPractical > baselineBaseSalaryWon);
  const isPureCut = Boolean(selectedPlayer && baselineBaseSalaryWon > 0 && roundedMaxPractical < baselineBaseSalaryWon);
  const isMixed = Boolean(
    selectedPlayer &&
    baselineBaseSalaryWon > 0 &&
    roundedMinPractical <= baselineBaseSalaryWon &&
    baselineBaseSalaryWon <= roundedMaxPractical &&
    roundedMinPractical !== roundedMaxPractical
  );

  const maxIncreaseWon = (selectedPlayer && baselineBaseSalaryWon > 0) ? Math.max(0, roundedMaxPractical - baselineBaseSalaryWon) : 0;
  const maxIncreasePercent = (selectedPlayer && baselineBaseSalaryWon > 0) ? Math.round((maxIncreaseWon / baselineBaseSalaryWon) * 100) : 0;

  const maxCutWon = (selectedPlayer && baselineBaseSalaryWon > 0) ? Math.max(0, baselineBaseSalaryWon - roundedMinPractical) : 0;
  const maxCutPercent = (selectedPlayer && baselineBaseSalaryWon > 0) ? Math.round((maxCutWon / baselineBaseSalaryWon) * 100) : 0;

  async function runSimulation() {
    if (!selectedPlayer) return;
    setLoading(true);
    try {
      let targetStats: Record<string, any> = {};
      if (positionCategory === 'PITCHER') {
        targetStats = {
          대분류: '투수',
          세부포지션: selectedPlayer.position,
          불펜여부: isReliefPitcher ? "구원/마무리/불펜" : "선발",
          목표WAR: targetWar,
          투구이닝_IP: pitcherInnings,
          평균자책점_ERA: pitcherEra.toFixed(2),
          WHIP: pitcherWhip.toFixed(2),
          지표특이사항: isReliefPitcher ? "불펜 전용 가중치(ERA 3.50, WHIP 1.20 기준 1.5배 및 이닝 패널티 면제) 적용" : "ERA와 WHIP는 수치가 낮을수록 리그 최상위 경기 억제력을 의미함"
        };
      } else if (positionCategory === 'CATCHER') {
        targetStats = {
          대분류: '타자 (포수)',
          세부포지션: selectedPlayer.position,
          목표WAR: targetWar,
          기본타격_wRCplus: hitterWrcPlus,
          기본타격_OPS: hitterOps.toFixed(3),
          포수프리미엄_도루저지율_CS: `${catcherCsRate.toFixed(1)}%`,
          포수프리미엄_블로킹_PB9: `${catcherPb9.toFixed(2)} (낮을수록 블로킹 우수)`
        };
      } else {
        targetStats = {
          대분류: '타자 (내야수/외야수)',
          세부포지션: selectedPlayer.position,
          목표WAR: targetWar,
          기본타격_wRCplus: hitterWrcPlus,
          기본타격_OPS: hitterOps.toFixed(3),
          포지션프리미엄_수비범위_RF9: fielderRf9.toFixed(2),
          포지션프리미엄_순수장타율_ISO: fielderIso.toFixed(3)
        };
      }

      const algorithmDetails = {
        volumeMultiplier: {
          value: Number(volumeMultiplier.toFixed(2)),
          applied: volumeMultiplier < 0.999,
          type: positionCategory === 'PITCHER' ? (isReliefPitcher ? "불펜 (50이닝 기준)" : "선발 (120이닝 기준)") : "타자 (400타석 기준)",
          sampleValue: positionCategory === 'PITCHER' ? `${pitcherInnings}이닝` : `${effectiveBaselineStats?.pa ?? 400}타석`
        },
        reliefWeighting: {
          isRelief: isReliefPitcher,
          applied: isReliefPitcher
        },
        agingCurve: {
          applied: isAgingCurveApplied,
          age: playerAge,
          multiplier: Number(ageMultiplier.toFixed(2)),
          discountPercent: Math.round((1 - ageMultiplier) * 100)
        },
        breakoutMultiplier: {
          applied: isBreakoutCandidate,
          rule: "1억원 이하 저연봉자 대상 WAR 2.0+ 달성 시 20% 인상률 캡 해제 및 WAR당 4,000만원 다이렉트 고과 산출"
        }
      };
      
      const res = await fetch("/api/gemini/simulator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          playerData: {
            ...selectedPlayer,
            draftYearDisplay: draftInfo.display,
            careerYears: `${careerYears}년차`,
            isNonFA: isNonFA ? "비FA" : "FA 대상",
            formattedCurrentSalary: formatKoreanSalary(currentSalaryWon),
            formattedBaselineSalary: formatKoreanSalary(baselineBaseSalaryWon)
          }, 
          targetStats,
          practicalTargetRange: {
            min: formatKoreanSalary(roundedMinPractical),
            max: formatKoreanSalary(roundedMaxPractical)
          },
          faMarketRange: {
            min: formatKoreanSalary(roundedMinFa),
            max: formatKoreanSalary(roundedMaxFa)
          },
          isNonFA,
          serviceTimeInfo: {
            display: serviceTimeInfo.display,
            seasons: serviceTimeInfo.seasons,
            totalDays: serviceTimeInfo.totalDays,
            statusLabel: isNonFA ? "비FA (등록일수 미달)" : "FA 자격 충족"
          },
          algorithmDetails
        })
      });
      const data = await res.json();
      if (res.ok) {
        setReport(data.text);
      } else {
        setReport("시뮬레이션 실행 실패: " + data.error);
      }
    } catch (e: any) {
      setTimeout(() => {
        const algorithmMentions: string[] = [];
        if (isAgingCurveApplied) {
          algorithmMentions.push(`• **⏳ 에이징 커브(Aging Curve) 선반영**: 30대 중반(${playerAge}세)의 에이징 커브 리스크(-${Math.round((1 - ageMultiplier) * 100)}% 감가상각)를 선반영하여 구단 친화적으로 시장 가치를 합리적으로 조정했습니다.`);
        }
        if (isBreakoutCandidate) {
          algorithmMentions.push(`• **🚀 저연봉자 폭발적 인상(Breakout Multiplier)**: 1억 이하 저연봉 구간 선수로, 올 시즌 보여준 폭발적인 기여도(목표 WAR ${targetWar.toFixed(2)})를 감안해 인상률 캡(20%)을 해제한 S급 고과 기준(WAR 1.0당 4,000만원 다이렉트 인상)을 적용했습니다.`);
        }
        if (volumeMultiplier < 0.999) {
          algorithmMentions.push(`• **⚖️ 표본 신뢰도 볼륨 가중치(Volume Multiplier)**: 출장 ${positionCategory === 'PITCHER' ? (isReliefPitcher ? `${pitcherInnings}이닝(50이닝 기준)` : `${pitcherInnings}이닝(120이닝 기준)`) : `${effectiveBaselineStats?.pa ?? 400}타석(400타석 기준)`} 표본에 따른 신뢰도 가중치(${(volumeMultiplier * 100).toFixed(0)}%)를 적용하여 거품을 뺀 합리적인 지표입니다.`);
        }
        if (isReliefPitcher) {
          algorithmMentions.push(`• **🛡️ 불펜 투수 전용 가중치(Relief Weighting)**: 불펜/마무리 투수 전용 기준(ERA 3.50, WHIP 1.20) 및 1.5배 보너스 배수와 이닝 누적 패널티 면제를 온전히 반영했습니다.`);
        }

        setReport(`• **💎 데이터 기반 FA 시장 가치 (Market Value)**: 목표 WAR ${targetWar.toFixed(2)} 달성 시 선수의 순수 세이버메트릭스 시장 가치는 **${formatKoreanSalary(roundedMinFa)} ~ ${formatKoreanSalary(roundedMaxFa)}** (1 WAR당 1.5억~2.0억원 및 포지션 가중치) 수준에 이릅니다.${isAgingCurveApplied ? ` (※ 30대 중반의 에이징 커브 리스크를 선반영하여 구단 친화적으로 가치를 조정했습니다.)` : ""}${volumeMultiplier < 0.999 ? ` (※ 출장 타석/이닝 표본에 따른 신뢰도 가중치를 적용하여 거품을 뺀 합리적인 지표입니다.)` : ""}
• **🎯 현실적 협상 목표액 (${isNonFA ? (isBreakoutCandidate ? "저연봉 폭발적 고과 인상 타겟" : "등록일수 미달 비FA 고과 앵커링") : "FA 자격 기준 타겟"})**: 선수의 데이터 기반 실제 시장 가치는 ${formatKoreanSalary(roundedMaxFa)} 수준이나, ${isNonFA ? (isBreakoutCandidate ? `1억 이하 저연봉 구간 선수로, 올 시즌 보여준 폭발적인 기여도(목표 WAR ${targetWar.toFixed(2)})를 감안해 인상률 캡을 해제한 S급 고과 기준(WAR 1.0당 4,000만원 다이렉트 인상)을 적용하여 전략적으로 **${formatKoreanSalary(roundedMinPractical)} ~ ${formatKoreanSalary(roundedMaxPractical)}**을 현실적 협상 목표액으로 제시합니다.` : `현재 1군 등록일수(${serviceTimeInfo.display})가 KBO 규약상 FA 자격 취득 요건(정규 7~8시즌)에 미달하는 점과 구단의 연봉 고과 산정 시스템을 존중하여, 전략적으로 **${formatKoreanSalary(roundedMinPractical)} ~ ${formatKoreanSalary(roundedMaxPractical)}**을 현실적 협상 목표액으로 제시합니다.`) : `1군 등록일수 요건을 충족한 FA 지위로서 **${formatKoreanSalary(roundedMinPractical)} ~ ${formatKoreanSalary(roundedMaxPractical)}**을 정당한 협상 목표액으로 요구합니다.`}
• **💼 구단 프런트 설득 핵심 논리**: ${isNonFA ? `순수 세이버메트릭스 시장 가치 대비 대폭 할인된 고과 친화적 타겟임을 강조하여 구단 프런트의 예산 부담을 완화하는 동시에, ${isPureCut ? `성적 부진에 따른 연봉 삭감 방어선(최대 -${formatKoreanSalary(maxCutWon)}, -${maxCutPercent}%)을 구축하는` : `목표 성적 달성에 걸맞은 인상(+${formatKoreanSalary(maxIncreaseWon)}, +${maxIncreasePercent}%)을 쟁취하는`} 에이전트 윈-윈(Win-Win) 협상안입니다.` : `시장의 치열한 영입 경쟁 및 대체 불가능한 주전 가치를 앞세워 구단의 적극적인 예산 투입을 설득합니다.`}
• **✨ 포지션 프리미엄 입증**: ${positionCategory === 'CATCHER' ? `도루저지율 ${catcherCsRate.toFixed(1)}%와 블로킹 PB/9 ${catcherPb9.toFixed(2)}로 안방마님 수비 안정감을 극대화합니다.` : positionCategory === 'PITCHER' ? (isReliefPitcher ? `불펜 전용 가중치(ERA ${pitcherEra.toFixed(2)}, WHIP ${pitcherWhip.toFixed(2)}, ${pitcherInnings}이닝)를 반영하여 필승조 마운드 지배력을 증명합니다.` : `${pitcherInnings}이닝 소화와 평균자책점 ${pitcherEra.toFixed(2)}, WHIP ${pitcherWhip.toFixed(2)}로 에이스급 마운드 지배력을 증명합니다.`) : `wRC+ ${hitterWrcPlus} 및 RF9 ${fielderRf9.toFixed(2)}의 공수겸장 기여도를 확보합니다.`}${algorithmMentions.length > 0 ? `\n${algorithmMentions.join("\n")}` : ""}`);
        setLoading(false);
      }, 800);
      return;
    }
    setLoading(false);
  }

  return (
    <div className="p-6 md:p-8 h-full overflow-y-auto bg-dark-main text-gray-200 flex flex-col gap-6">
      {/* 상단 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gold/15 border border-gold/30 flex items-center justify-center text-gold shadow-md shadow-gold/10">
              <Calculator className="w-4 h-4" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              목표-연봉 시뮬레이터
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-gold/15 text-gold border border-gold/30">
                DB 실시간 검색 연동
              </span>
            </h2>
          </div>
          <p className="text-sm text-gray-400 mt-1 pl-10.5">
            선수들의 포지션별 목표 스탯과 예상 연봉 범위를 시뮬레이션합니다.
          </p>
        </div>

        {/* 우측 헤더 액션 버튼 그룹 */}
        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          {/* 전체 DB 동기화 버튼 (타자 및 투수 최신 성적 App_data_DB 덮어쓰기) */}
          <button
            type="button"
            onClick={handleSyncAllPlayers}
            disabled={isBatchSyncing}
            className="px-3.5 py-2 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-400 text-xs font-bold flex items-center gap-2 transition-all shadow-md shadow-blue-500/10 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isBatchSyncing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                <span>{batchSyncProgress || "동기화 중..."}</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                <span>전체 DB 동기화</span>
              </>
            )}
          </button>

          {/* 수기 등록 액션 버튼 */}
          <button
            type="button"
            onClick={() => {
              setSampleModalInitialPlayer(null);
              setIsSampleModalOpen(true);
            }}
            className="px-3.5 py-2 rounded-xl bg-gold/15 hover:bg-gold/25 border border-gold/40 text-gold text-xs font-bold flex items-center gap-2 transition-all shadow-md shadow-gold/10 cursor-pointer"
          >
            <FlaskConical className="w-4 h-4" />
            <span>샘플 선수 수기 등록 (로직 검증)</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* 좌측: 선수 검색 및 목표 스탯 설정 패널 */}
        <div className="col-span-1 xl:col-span-7 bg-[#131722] border border-white/10 rounded-2xl p-6 shadow-xl flex flex-col h-full justify-between gap-6">
          <div className="flex flex-col gap-5">
            {/* 1. DB 선수 검색 영역 (드롭다운 대체) */}
            <div className="bg-black/40 border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-gold" />
                  <label className="text-base font-bold text-white uppercase tracking-wider">
                    데이터베이스 선수 검색
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSampleModalInitialPlayer(null);
                    setIsSampleModalOpen(true);
                  }}
                  className="text-xs font-bold text-gold hover:text-amber-300 flex items-center gap-1 bg-gold/10 hover:bg-gold/20 px-2.5 py-1 rounded-lg border border-gold/30 transition-all cursor-pointer"
                >
                  <FlaskConical className="w-3.5 h-3.5" />
                  <span>수기 등록</span>
                </button>
              </div>

              <form onSubmit={handleSearchFromDatabase} className="flex flex-col gap-2.5">
                <div className="grid grid-cols-3 gap-2">
                  <select
                    className="col-span-1 bg-black/60 border border-white/15 text-white text-xs rounded-lg p-2.5 outline-none focus:border-gold cursor-pointer"
                    value={searchTeam}
                    onChange={(e) => setSearchTeam(e.target.value)}
                  >
                    <option value="전체" className="bg-[#131722] text-white">전체 구단</option>
                    {mockTeams.map((t) => (
                      <option key={t.id} value={t.name} className="bg-[#131722] text-white">
                        {t.name}
                      </option>
                    ))}
                  </select>

                  <div className="col-span-2 relative">
                    <input
                      type="text"
                      placeholder="선수명 (예: 노시환, 원태인, 양의지)"
                      value={searchName}
                      onChange={(e) => setSearchName(e.target.value)}
                      className="w-full bg-black/60 border border-white/15 text-white placeholder-gray-500 text-xs rounded-lg p-2.5 pl-8 outline-none focus:border-gold"
                    />
                    <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-3 pointer-events-none" />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSearching}
                  className="w-full bg-gold/15 hover:bg-gold/25 border border-gold/40 text-gold py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSearching ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-gold" />
                      <span>DB 조회 중...</span>
                    </>
                  ) : (
                    <>
                      <Search className="w-3.5 h-3.5" />
                      <span>DB에서 선수 검색 & 적용</span>
                    </>
                  )}
                </button>
              </form>

              {/* 검색 결과 알림 메시지 */}
              {searchNotice && (
                <div
                  className={`mt-2.5 p-2 rounded-lg text-[11px] flex items-start gap-1.5 ${
                    searchNotice.type === "success"
                      ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-300"
                      : "bg-red-500/10 border border-red-500/20 text-red-300"
                  }`}
                >
                  {searchNotice.type === "success" ? (
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  )}
                  <span className="leading-tight">{searchNotice.message}</span>
                </div>
              )}

              {/* 로컬에 저장된 소속 선수가 있을 경우 빠른 전환 칩 */}
              {storedPlayers.length > 0 && (
                <div className="mt-3 pt-3 border-t border-white/5">
                  <div className="text-[11px] text-gray-400 font-medium mb-1.5">등록된 소속 선수 빠른 선택:</div>
                  <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                    {storedPlayers.map((p) => {
                      const isSelected = selectedPlayer?.id === p.id || (selectedPlayer?.name === p.name && selectedPlayer?.team === p.team);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setSelectedPlayer(p);
                            setSearchNotice(null);
                          }}
                          className={`text-[11px] px-2 py-1 rounded-md border transition-all cursor-pointer ${
                            isSelected
                              ? "bg-gold/20 text-gold border-gold/50 font-bold"
                              : "bg-white/5 hover:bg-white/10 text-gray-300 border-white/10"
                          }`}
                        >
                          {p.name} <span className="text-[10px] opacity-70">({p.team.slice(0, 2)})</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 수기로 직접 등록한 샘플 선수 목록 */}
              <div className="mt-3 pt-3 border-t border-white/10">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <FlaskConical className="w-3.5 h-3.5 text-gold" />
                    <span className="text-xs font-bold text-white">수기 등록 샘플 선수</span>
                    {samplePlayers.length > 0 && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-gold/15 text-gold font-mono font-bold">
                        {samplePlayers.length}명
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSampleModalInitialPlayer(null);
                      setIsSampleModalOpen(true);
                    }}
                    className="text-[11px] text-gold hover:underline flex items-center gap-1 cursor-pointer font-medium"
                  >
                    <Plus className="w-3 h-3" />
                    <span>새 샘플 등록</span>
                  </button>
                </div>

                {samplePlayers.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                    {samplePlayers.map((p) => {
                      const isSelected = selectedPlayer?.id === p.id;
                      return (
                        <div
                          key={p.id}
                          className={`inline-flex items-center text-[11px] rounded-lg border transition-all whitespace-nowrap shrink-0 ${
                            isSelected
                              ? "bg-gold/20 text-gold border-gold/50 font-bold shadow-sm shadow-gold/10"
                              : "bg-white/5 hover:bg-white/10 text-gray-300 border-white/10"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedPlayer(p);
                              setSearchNotice(null);
                            }}
                            className="px-2.5 py-1 cursor-pointer flex items-center gap-1 whitespace-nowrap"
                          >
                            <span>{p.name}</span>
                            <span className="text-[10px] opacity-70">
                              ({p.position.slice(0, 2)} • {formatKoreanSalary(p.salaryCurrent)})
                            </span>
                          </button>
                          <button
                            type="button"
                            title="샘플 선수 정보 수정"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSampleModalInitialPlayer(p);
                              setIsSampleModalOpen(true);
                            }}
                            className="p-1 text-gray-400 hover:text-gold cursor-pointer border-l border-white/10"
                          >
                            <Pencil className="w-2.5 h-2.5" />
                          </button>
                          <button
                            type="button"
                            title="샘플 선수 삭제"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRequestDelete(p);
                            }}
                            className="p-1 text-gray-400 hover:text-red-400 cursor-pointer border-l border-white/10 transition-colors"
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-2.5 rounded-lg bg-black/20 border border-dashed border-white/10 text-center">
                    <p className="text-[11px] text-gray-400 mb-1.5">
                      등록일수, 연봉, 포지션을 수기로 지정하여 시뮬레이터 로직을 테스트해보세요.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setSampleModalInitialPlayer(null);
                        setIsSampleModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-gold bg-gold/10 hover:bg-gold/20 border border-gold/30 px-2.5 py-1 rounded-md transition-all cursor-pointer whitespace-nowrap"
                    >
                      <FlaskConical className="w-3 h-3" />
                      <span>+ 첫 샘플 선수 등록하기</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* 2. 현재 선택된 대상 선수 요약 프로필 카드 */}
            {selectedPlayer ? (
              <div className="bg-[#181d2c] border border-gold/30 rounded-xl p-4 relative overflow-hidden shadow-inner flex flex-col gap-2.5">
                {/* 상단 1행: 선수명 & 우측 수정 버튼 */}
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-base font-bold text-white tracking-tight truncate whitespace-nowrap">
                    {selectedPlayer.name}
                  </h4>
                  {(selectedPlayer as any)?.isSample && (
                    <button
                      type="button"
                      onClick={() => {
                        setSampleModalInitialPlayer(selectedPlayer);
                        setIsSampleModalOpen(true);
                      }}
                      className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-gold/15 hover:bg-gold/25 text-gold border border-gold/30 cursor-pointer flex items-center gap-1 transition-all whitespace-nowrap shrink-0"
                    >
                      <Pencil className="w-3 h-3" />
                      <span>수정</span>
                    </button>
                  )}
                </div>

                {/* 2행: 메타 뱃지 행 (구단, 포지션, 샘플 선수 여부) */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] px-2 py-0.5 rounded bg-white/10 text-gray-200 font-mono whitespace-nowrap">
                    {selectedPlayer.team}
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-black/40 border border-white/15 text-gray-200 whitespace-nowrap">
                    {positionCategory === 'CATCHER' && <Shield className="w-3 h-3 text-amber-400 shrink-0" />}
                    {positionCategory === 'PITCHER' && <Activity className="w-3 h-3 text-sky-400 shrink-0" />}
                    {positionCategory === 'FIELDER' && <Award className="w-3 h-3 text-emerald-400 shrink-0" />}
                    <span>{getSinglePositionName(selectedPlayer, positionCategory)}</span>
                  </span>
                  {(selectedPlayer as any)?.isSample && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold flex items-center gap-1 whitespace-nowrap">
                      <FlaskConical className="w-3 h-3 shrink-0" />
                      <span>샘플 선수</span>
                    </span>
                  )}
                </div>

                {/* 3행: 인적사항 (나이, 등록일수, 입단연도 및 연차) */}
                <div className="text-xs text-gray-400 leading-relaxed">
                  {selectedPlayer.age}세 • {selectedPlayer.serviceTime || "등록일수 미상"} • {selectedPlayer.draftYear ? `${selectedPlayer.draftYear}년 입단 (${careerYears}년차)` : "입단연도 미상"}
                </div>

                {/* 4행: 하단 현재 연봉 정보 및 비FA/FA 뱃지 */}
                <div className="flex items-center justify-between pt-2.5 border-t border-white/10 text-xs font-mono">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 whitespace-nowrap font-sans">현재 연봉</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap font-sans font-bold ${
                      isNonFA ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" : "bg-gold/15 text-gold border-gold/30"
                    }`}>
                      {isNonFA ? "비FA" : "FA 충족"}
                    </span>
                  </div>
                  <span className="font-bold text-gold whitespace-nowrap">
                    {formatKoreanSalary(currentSalaryWon)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-white/5 border border-dashed border-white/15 rounded-xl text-center text-xs text-gray-400 flex flex-col items-center justify-center gap-2">
                <span className="text-gray-300 font-medium">선수 정보가 비어 있습니다</span>
                <span className="text-[11px] text-gray-500">상단 DB 검색창에서 선수를 검색하거나, 샘플 선수를 직접 수기 등록해 보세요.</span>
                <button
                  type="button"
                  onClick={() => {
                    setSampleModalInitialPlayer(null);
                    setIsSampleModalOpen(true);
                  }}
                  className="mt-1 px-3 py-1.5 rounded-lg bg-gold/20 hover:bg-gold/30 text-gold border border-gold/40 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all"
                >
                  <FlaskConical className="w-3.5 h-3.5" />
                  <span>+ 샘플/가상 선수 수기 등록하기</span>
                </button>
              </div>
            )}

            {/* 3. 목표 스탯 파라미터 슬라이더 설정 */}
            {selectedPlayer ? (
              <div>
                <div className="pb-2.5 mb-3.5 border-b border-white/10 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 shrink-0">
                      <Target className="w-4 h-4 text-gold shrink-0" />
                      <h3 className="text-sm sm:text-base font-bold text-white uppercase tracking-wider whitespace-nowrap">
                        {positionCategory === 'PITCHER' ? '투수 목표 스탯 파라미터' : '타자 목표 스탯 파라미터'}
                      </h3>
                    </div>
                    <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-white/10 text-gray-300 font-semibold whitespace-nowrap shrink-0">
                      {positionCategory === 'PITCHER' ? '투수 모델링' : positionCategory === 'CATCHER' ? '타자 (포수)' : `타자 (${getSinglePositionName(selectedPlayer, positionCategory)})`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-gray-400">
                    <span className="truncate text-gray-400 text-[11px]">목표 스탯 조정 시 예상 연봉이 실시간 계산됩니다</span>
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-white/5 text-gray-400 border border-white/10 whitespace-nowrap shrink-0 ml-auto">
                      슬라이더 조절 및 직접 수치 입력 가능
                    </span>
                  </div>
                </div>

                {/* [요구사항 3] 샘플 선수의 경우 기준 지표/비교 지표 카드 상단에 데이터 저장 버튼을 1개 만들고, 기준 지표, 비교 지표 값이 데이터베이스에 저장될 수 있게 구현 */}
                {isSamplePlayer && (
                  <div className="mb-4 bg-gradient-to-r from-amber-500/15 via-[#161a24] to-emerald-500/15 border border-gold/40 rounded-xl p-3 sm:p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-gold/20 border border-gold/40 flex items-center justify-center shrink-0">
                        <FlaskConical className="w-4 h-4 text-gold" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-white">샘플 선수 지표 설정 모드</span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-gold/20 text-gold font-mono font-bold border border-gold/30">
                            {selectedPlayer.name}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-white/10 text-gray-300 font-mono">
                            {selectedPlayer.team} • {selectedPlayer.position}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-300 mt-0.5">
                          기준 지표와 비교 지표를 수동 입력 후, [데이터 저장] 버튼을 누르면 데이터베이스(Sample_Player_DB)에 영구 저장됩니다.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleSaveSampleStatsToDatabase}
                      disabled={isSavingSample}
                      className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-gradient-to-r from-gold via-amber-400 to-amber-500 hover:from-amber-400 hover:to-gold text-black font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg shadow-gold/20 hover:scale-[1.02] active:scale-95 transition-all cursor-pointer disabled:opacity-50 shrink-0"
                      title="현재 설정된 기준 지표와 비교 지표 값을 데이터베이스에 저장합니다"
                    >
                      {isSavingSample ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-black" />
                          <span>데이터 저장 중...</span>
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4 stroke-[2.5]" />
                          <span>데이터 저장</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* 1. 타자 렌더링 분기: 좌측(기준 지표) vs 우측(비교 지표) 2분할 레이아웃 */}
                {positionCategory !== 'PITCHER' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* [좌측 컬럼] 기준 지표 (Reference Stats) */}
                    <div className="bg-black/35 rounded-xl border border-white/10 p-4 flex flex-col justify-between gap-4 shadow-sm">
                      <div className="flex flex-col gap-3.5">
                        {/* 헤더 & 년도 드롭아웃 버튼 (샘플 선수는 연도 선택 버튼 제거, 수동 입력 모드 뱃지 표시) */}
                        <div className="flex items-center justify-between pb-3 border-b border-white/10 relative">
                          <div className="flex items-center gap-2">
                            <History className="w-4 h-4 text-gold shrink-0" />
                            <div>
                              <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                                기준 지표
                                <span className="text-[10px] font-normal text-gold">
                                  {isSamplePlayer ? "수동 설정" : "실적"}
                                </span>
                              </h4>
                            </div>
                          </div>

                          {!isSamplePlayer ? (
                            /* 일반 선수: 기준 연도 선택 드롭다운 */
                            <div className="relative" ref={yearDropdownRef}>
                              <button
                                type="button"
                                onClick={() => setIsYearDropdownOpen((prev) => !prev)}
                                className={`px-2.5 py-1.5 rounded-lg bg-[#1a202c] hover:bg-[#252e3e] border text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer ${
                                  baselineYear ? "border-gold/40 hover:border-gold text-white" : "border-amber-500 text-amber-300 animate-pulse"
                                }`}
                                title="기준 년도를 선택하여 해당 시즌의 DB 성적을 불러옵니다"
                              >
                                <Calendar className="w-3.5 h-3.5 text-gold shrink-0" />
                                <span>{baselineYear ? `${baselineYear}년` : "연도 선택"}</span>
                                <ChevronDown
                                  className={`w-3.5 h-3.5 text-gold transition-transform duration-200 ${
                                    isYearDropdownOpen ? "rotate-180" : ""
                                  }`}
                                />
                              </button>

                              {/* 드롭아웃 메뉴 */}
                              {isYearDropdownOpen && (
                                <div className="absolute right-0 top-full mt-1.5 w-44 bg-[#161a24] border border-white/20 rounded-xl shadow-2xl z-50 py-1 overflow-hidden backdrop-blur-md">
                                  <div className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-white/10 flex items-center justify-between">
                                    <span>시즌 선택 (DB 연동)</span>
                                    <span className="text-gold font-mono text-[9px]">KBO</span>
                                  </div>
                                  <div className="max-h-52 overflow-y-auto py-1">
                                    {availableYears.map((yr) => {
                                      const isSelected = yr === baselineYear;
                                      const hasDb = playerDbRecords.some((r) => {
                                        const y = getValue(r, ["연도", "시즌", "year", "Year", "season"]);
                                        return Number(y) === yr;
                                      }) || selectedPlayer?.stats?.some((s) => s.year === yr);

                                      return (
                                        <button
                                          key={yr}
                                          type="button"
                                          onClick={() => handleSelectBaselineYear(yr)}
                                          className={`w-full px-3 py-2 text-xs flex items-center justify-between text-left transition-all cursor-pointer ${
                                            isSelected
                                              ? "bg-gold/20 text-gold font-bold"
                                              : "text-gray-300 hover:bg-white/10 hover:text-white"
                                          }`}
                                        >
                                          <div className="flex items-center gap-1.5">
                                            <span>{yr} 시즌</span>
                                            {yr === 2025 && (
                                              <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300">최근</span>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-1.5">
                                            {hasDb && (
                                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-white/5 text-gray-400 font-mono">
                                                DB
                                              </span>
                                            )}
                                            {isSelected && <Check className="w-3.5 h-3.5 text-gold" />}
                                          </div>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            /* 샘플 선수: 연도 선택 버튼 제거 및 수동 모드 표시 */
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-gold/15 text-gold border border-gold/30">
                              기준 지표 수동 입력
                            </span>
                          )}
                        </div>

                        {!isSamplePlayer ? (
                          /* 일반 선수: DB 실적 카드형 렌더링 */
                          <>
                            {/* 시즌 안내 태그 & 로딩 인디케이터 */}
                            <div className="flex items-center justify-between text-[11px] bg-white/5 px-2.5 py-1.5 rounded-lg border border-white/5">
                              <div className="flex items-center gap-1.5 text-gray-300">
                                <span className="font-semibold text-white">
                                  {baselineYear ? `${baselineYear}년 실제 기록` : "연도 미선택 (연도를 선택하세요)"}
                                </span>
                                {!baselineYear ? (
                                  <span className="text-[10px] text-amber-400 font-medium">연도 선택 대기</span>
                                ) : isBaselineLoading ? (
                                  <Loader2 className="w-3 h-3 animate-spin text-gold" />
                                ) : effectiveBaselineStats?.hasDbRecord ? (
                                  <span className="text-[10px] text-emerald-400 font-medium">● DB 연동완료</span>
                                ) : (
                                  <span className="text-[10px] text-gray-400">참고치</span>
                                )}
                              </div>
                            </div>

                            {/* [요구사항 1]: 기준 지표 카드에 연봉을 직접 입력할 수 있는 입력칸 추가 */}
                            <BaselineSalaryInput
                              year={baselineYear}
                              isSample={isSamplePlayer}
                              value={manualBaselineSalaryText}
                              onChange={setManualBaselineSalaryText}
                              salaryWon={effectiveBaselineSalaryWon}
                              isLoading={isBaselineLoading}
                            />

                            {/* 지표 리스트 (카드형 배치) */}
                            <div className="flex flex-col gap-2.5">
                              {/* 1. 기준 WAR */}
                              <div className="bg-black/40 p-3 rounded-lg border border-white/5 flex items-center justify-between">
                                <div>
                                  <div className="text-[11px] text-gray-400 font-medium">기준 승리기여도</div>
                                  <div className="text-sm font-bold text-white flex items-baseline gap-1">
                                    <span>WAR</span>
                                    <span className="text-base text-gold font-mono">
                                      {effectiveBaselineStats ? effectiveBaselineStats.war.toFixed(2) : "0.00"}
                                    </span>
                                  </div>
                                </div>
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 text-gray-300 border border-white/10">
                                  {!baselineYear ? "연도 미선택" : (effectiveBaselineStats?.war ?? 0) >= 4.5 ? "올스타/MVP급" : (effectiveBaselineStats?.war ?? 0) >= 3.0 ? "주전 주축급" : (effectiveBaselineStats?.war ?? 0) >= 1.5 ? "주전급" : "백업/교체급"}
                                </span>
                              </div>

                              {/* 2. 기준 wRC+ */}
                              <div className="bg-black/40 p-3 rounded-lg border border-white/5 flex items-center justify-between">
                                <div>
                                  <div className="text-[11px] text-gray-400 font-medium">조정 득점 생산력</div>
                                  <div className="text-sm font-bold text-white flex items-baseline gap-1">
                                    <span>wRC+</span>
                                    <span className="text-base text-amber-300 font-mono">
                                      {effectiveBaselineStats ? effectiveBaselineStats.wrcPlus : 0}
                                    </span>
                                  </div>
                                </div>
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                                  {!baselineYear ? "연도 미선택" : (effectiveBaselineStats?.wrcPlus ?? 0) >= 135 ? "특급 (상위 5%)" : (effectiveBaselineStats?.wrcPlus ?? 0) >= 115 ? "리그 우수" : (effectiveBaselineStats?.wrcPlus ?? 0) >= 95 ? "리그 평균" : "평균 이하"}
                                </span>
                              </div>

                              {/* 3. 기준 OPS */}
                              <div className="bg-black/40 p-3 rounded-lg border border-white/5 flex items-center justify-between">
                                <div>
                                  <div className="text-[11px] text-gray-400 font-medium">출루율 + 장타율</div>
                                  <div className="text-sm font-bold text-white flex items-baseline gap-1">
                                    <span>OPS</span>
                                    <span className="text-base text-amber-300 font-mono">
                                      {effectiveBaselineStats ? effectiveBaselineStats.ops.toFixed(3) : "0.000"}
                                    </span>
                                  </div>
                                </div>
                                <div className="text-right font-mono text-[11px] text-gray-400">
                                  {effectiveBaselineStats?.avg !== undefined && effectiveBaselineStats.avg > 0 && <span>.{Math.round(effectiveBaselineStats.avg * 1000)} 타율</span>}
                                  {effectiveBaselineStats?.hr !== undefined && effectiveBaselineStats.hr > 0 && <span className="ml-1.5">{effectiveBaselineStats.hr}홈런</span>}
                                </div>
                              </div>

                              {/* 4. 포지션별 전용 지표 */}
                              <div className="bg-gold/5 p-3 rounded-lg border border-gold/20 flex flex-col gap-2">
                                <div className="text-[10px] font-bold text-gold uppercase tracking-wider flex items-center justify-between">
                                  <span>
                                    {positionCategory === 'CATCHER' ? "포수 전용 수비 지표" : `${getSinglePositionName(selectedPlayer, positionCategory)} 프리미엄 지표`}
                                  </span>
                                  <span className="text-[9px] text-gray-400 font-mono">가산점 요소</span>
                                </div>

                                {positionCategory === 'CATCHER' ? (
                                  <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div className="bg-black/30 p-2 rounded border border-white/5">
                                      <span className="text-[10px] text-gray-400 block">도루저지율 (CS%)</span>
                                      <span className="font-mono font-bold text-amber-300 text-sm">
                                        {effectiveBaselineStats?.csRate !== undefined ? `${effectiveBaselineStats.csRate.toFixed(1)}%` : "0.0%"}
                                      </span>
                                    </div>
                                    <div className="bg-black/30 p-2 rounded border border-white/5">
                                      <span className="text-[10px] text-gray-400 block">블로킹 (PB/9)</span>
                                      <span className="font-mono font-bold text-emerald-400 text-sm">
                                        {effectiveBaselineStats?.pb9 !== undefined ? effectiveBaselineStats.pb9.toFixed(2) : "0.00"}
                                      </span>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div className="bg-black/30 p-2 rounded border border-white/5">
                                      <span className="text-[10px] text-gray-400 block">수비 범위 (RF9)</span>
                                      <span className="font-mono font-bold text-emerald-400 text-sm">
                                        {effectiveBaselineStats?.rf9 !== undefined ? effectiveBaselineStats.rf9.toFixed(2) : "0.00"}
                                      </span>
                                    </div>
                                    <div className="bg-black/30 p-2 rounded border border-white/5">
                                      <span className="text-[10px] text-gray-400 block">순수 장타율 (ISO)</span>
                                      <span className="font-mono font-bold text-emerald-400 text-sm">
                                        {effectiveBaselineStats?.iso !== undefined ? effectiveBaselineStats.iso.toFixed(3) : "0.000"}
                                      </span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </>
                        ) : (
                          /* [요구사항 2] 샘플 선수: 기준 지표 수동 입력 슬라이더 / 직접 입력 */
                          <div className="flex flex-col gap-3.5">
                            {/* [요구사항 1]: 기준 지표 카드에 연봉을 직접 입력할 수 있는 입력칸 추가 */}
                            <BaselineSalaryInput
                              year={baselineYear}
                              isSample={isSamplePlayer}
                              value={manualBaselineSalaryText}
                              onChange={setManualBaselineSalaryText}
                              salaryWon={effectiveBaselineSalaryWon}
                              isLoading={isBaselineLoading}
                            />

                            <div className="flex items-center justify-between text-[11px] bg-gold/10 px-2.5 py-1.5 rounded-lg border border-gold/20">
                              <span className="font-semibold text-gold">기준 실적 스탯 직접 조절</span>
                              <span className="text-[10px] text-gold/80">슬라이더 및 수치 조절</span>
                            </div>

                            {/* 기준 WAR */}
                            <StatInputSlider
                              label="기준 WAR (승리기여도)"
                              subLabel={<span className="text-[10px] text-gold/80">기준값</span>}
                              unit="WAR"
                              value={sampleBaselineWar}
                              onChange={setSampleBaselineWar}
                              min={-0.5}
                              max={10}
                              step={0.01}
                              digits={2}
                              allowNegative={true}
                              themeColor="gold"
                              ticks={[
                                { text: "-0.50" },
                                { text: "4.50 (올스타)" },
                                { text: "10.00 (MVP)" },
                              ]}
                            />

                            {/* 기준 wRC+ */}
                            <StatInputSlider
                              label="기준 wRC+ (득점 생산력)"
                              subLabel={<span className="text-[10px] text-amber-400/80">기준값</span>}
                              unit="wRC+"
                              value={sampleBaselineWrcPlus}
                              onChange={setSampleBaselineWrcPlus}
                              min={20}
                              max={200}
                              step={1}
                              digits={0}
                              themeColor="amber"
                              ticks={[
                                { text: "20" },
                                { text: "100 (평균)" },
                                { text: "160 (MVP)" },
                              ]}
                            />

                            {/* 기준 OPS */}
                            <StatInputSlider
                              label="기준 OPS (출루율+장타율)"
                              subLabel={<span className="text-[10px] text-amber-400/80">기준값</span>}
                              unit="OPS"
                              value={sampleBaselineOps}
                              onChange={setSampleBaselineOps}
                              min={0.400}
                              max={1.100}
                              step={0.005}
                              digits={3}
                              themeColor="amber"
                              ticks={[
                                { text: "0.400" },
                                { text: "0.800 (중심)" },
                                { text: "1.000+" },
                              ]}
                            />

                            {/* 기준 포지션별 지표 */}
                            {positionCategory === 'CATCHER' ? (
                              <>
                                <StatInputSlider
                                  label="기준 도루저지율 (CS%)"
                                  subLabel={<span className="text-[10px] text-amber-400/80">기준값</span>}
                                  unit="%"
                                  value={sampleBaselineCsRate}
                                  onChange={setSampleBaselineCsRate}
                                  min={10}
                                  max={50}
                                  step={0.5}
                                  digits={1}
                                  themeColor="amber"
                                  ticks={[
                                    { text: "10.0%" },
                                    { text: "30.0% (평균)" },
                                    { text: "45.0% (특급)" },
                                  ]}
                                />
                                <StatInputSlider
                                  label="기준 블로킹 (PB/9)"
                                  subLabel={<span className="text-[10px] text-amber-400/80">기준값</span>}
                                  unit="PB/9"
                                  value={sampleBaselinePb9}
                                  onChange={setSampleBaselinePb9}
                                  min={0.10}
                                  max={0.90}
                                  step={0.01}
                                  digits={2}
                                  themeColor="amber"
                                  ticks={[
                                    { text: "0.20 (철벽)", highlight: true },
                                    { text: "0.38 (평균)" },
                                    { text: "0.75" },
                                  ]}
                                />
                              </>
                            ) : (
                              <>
                                <StatInputSlider
                                  label="기준 수비 범위 (RF9)"
                                  subLabel={<span className="text-[10px] text-emerald-400/80">기준값</span>}
                                  unit="RF9"
                                  value={sampleBaselineRf9}
                                  onChange={setSampleBaselineRf9}
                                  min={1.00}
                                  max={6.00}
                                  step={0.05}
                                  digits={2}
                                  themeColor="emerald"
                                  ticks={[
                                    { text: "2.00" },
                                    { text: "3.85 (평균)" },
                                    { text: "5.20 (특급)" },
                                  ]}
                                />
                                <StatInputSlider
                                  label="기준 순수 장타율 (ISO)"
                                  subLabel={<span className="text-[10px] text-emerald-400/80">기준값</span>}
                                  unit="ISO"
                                  value={sampleBaselineIso}
                                  onChange={setSampleBaselineIso}
                                  min={0.050}
                                  max={0.350}
                                  step={0.005}
                                  digits={3}
                                  themeColor="emerald"
                                  ticks={[
                                    { text: "0.100 (단타)" },
                                    { text: "0.165 (중장)" },
                                    { text: "0.260+ (거포)" },
                                  ]}
                                />
                              </>
                            )}
                          </div>
                        )}
                      </div>

                      {/* 하단: 기준 스탯을 비교 지표로 복사 버튼 */}
                      <button
                        type="button"
                        onClick={handleApplyBaselineToComparison}
                        className="w-full py-2 px-3 rounded-lg bg-gold/15 hover:bg-gold/25 border border-gold/30 text-gold text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm mt-1"
                        title="현재 설정된 기준 실적 스탯을 우측 비교 지표 슬라이더에 그대로 복사합니다"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>기준 스탯을 비교 지표로 가져오기</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* [우측 컬럼] 비교 지표 (Comparison Stats / Sliders) */}
                    <div className="bg-black/35 rounded-xl border border-white/10 p-4 flex flex-col gap-3.5 shadow-sm">
                      {/* [요구사항 1] 비교지표에도 연도 선택 버튼 추가 (샘플 선수는 제외) */}
                      <div className="flex items-center justify-between pb-3 border-b border-white/10">
                        <div className="flex items-center gap-2">
                          <SlidersHorizontal className="w-4 h-4 text-emerald-400 shrink-0" />
                          <div>
                            <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                              비교 지표
                              <span className="text-[10px] font-normal text-emerald-400">
                                {isSamplePlayer ? "수동 설정" : "시뮬레이션"}
                              </span>
                            </h4>
                          </div>
                        </div>

                        {!isSamplePlayer ? (
                          /* 일반 선수: 비교 연도 선택 드롭다운 버튼 */
                          <div className="relative" ref={compYearDropdownRef}>
                            <button
                              type="button"
                              onClick={() => setIsCompYearDropdownOpen((prev) => !prev)}
                              className="px-2.5 py-1.5 rounded-lg bg-[#1a202c] hover:bg-[#252e3e] border border-emerald-500/40 hover:border-emerald-400 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                              title="비교 연도를 선택하여 해당 시즌의 DB 성적을 비교 지표로 불러옵니다"
                            >
                              <Calendar className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              <span>{comparisonYear}년</span>
                              <ChevronDown
                                className={`w-3.5 h-3.5 text-emerald-400 transition-transform duration-200 ${
                                  isCompYearDropdownOpen ? "rotate-180" : ""
                                }`}
                              />
                            </button>

                            {/* 비교 연도 드롭아웃 메뉴 */}
                            {isCompYearDropdownOpen && (
                              <div className="absolute right-0 top-full mt-1.5 w-44 bg-[#161a24] border border-white/20 rounded-xl shadow-2xl z-50 py-1 overflow-hidden backdrop-blur-md">
                                <div className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-white/10 flex items-center justify-between">
                                  <span>비교 시즌 선택 (DB 연동)</span>
                                  <span className="text-emerald-400 font-mono text-[9px]">KBO</span>
                                </div>
                                <div className="max-h-52 overflow-y-auto py-1">
                                  {availableYears.map((yr) => {
                                    const isSelected = yr === comparisonYear;
                                    const hasDb = playerDbRecords.some((r) => {
                                      const y = getValue(r, ["연도", "시즌", "year", "Year", "season"]);
                                      return Number(y) === yr;
                                    }) || selectedPlayer?.stats?.some((s) => s.year === yr);

                                    return (
                                      <button
                                        key={yr}
                                        type="button"
                                        onClick={() => handleSelectComparisonYear(yr)}
                                        className={`w-full px-3 py-2 text-xs flex items-center justify-between text-left transition-all cursor-pointer ${
                                          isSelected
                                            ? "bg-emerald-500/20 text-emerald-300 font-bold"
                                            : "text-gray-300 hover:bg-white/10 hover:text-white"
                                        }`}
                                      >
                                        <div className="flex items-center gap-1.5">
                                          <span>{yr} 시즌</span>
                                          {yr === 2025 && (
                                            <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300">최근</span>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                          {hasDb && (
                                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-white/5 text-gray-400 font-mono">
                                              DB
                                            </span>
                                          )}
                                          {isSelected && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          /* 샘플 선수: 연도 선택 버튼 미표시, 수동 안내 뱃지 */
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 whitespace-nowrap">
                            비교 지표 수동 입력
                          </span>
                        )}
                      </div>

                      {/* 슬라이더 1: 목표 WAR */}
                      <StatInputSlider
                        label="목표 WAR (승리기여도)"
                        subLabel={
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-gray-400">기준({effectiveBaselineStats?.war.toFixed(2) ?? "0.00"})대비</span>
                            {renderDeltaBadge(targetWar - (effectiveBaselineStats?.war ?? 0), (v) => v.toFixed(2))}
                          </div>
                        }
                        unit="WAR"
                        value={targetWar}
                        onChange={setTargetWar}
                        min={-0.5}
                        max={10}
                        step={0.01}
                        digits={2}
                        allowNegative={true}
                        themeColor="gold"
                        ticks={[
                          { text: "-0.50" },
                          { text: "4.50 (올스타)" },
                          { text: "10.00 (MVP)" },
                        ]}
                      />

                      {/* 슬라이더 2: 조정 득점 생산력 (wRC+) */}
                      <StatInputSlider
                        label="wRC+ (득점 생산력)"
                        subLabel={
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-gray-400">기준({effectiveBaselineStats?.wrcPlus ?? 100})대비</span>
                            {renderDeltaBadge(hitterWrcPlus - (effectiveBaselineStats?.wrcPlus ?? 100), (v) => `${Math.round(v)}`)}
                          </div>
                        }
                        unit="wRC+"
                        value={hitterWrcPlus}
                        onChange={setHitterWrcPlus}
                        min={20}
                        max={200}
                        step={1}
                        digits={0}
                        themeColor="amber"
                        ticks={[
                          { text: "20" },
                          { text: "100 (평균)" },
                          { text: "160 (MVP)" },
                        ]}
                      />

                      {/* 슬라이더 3: 목표 OPS */}
                      <StatInputSlider
                        label="목표 OPS (출루율+장타율)"
                        subLabel={
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-gray-400">기준({effectiveBaselineStats?.ops.toFixed(3) ?? "0.750"})대비</span>
                            {renderDeltaBadge(hitterOps - (effectiveBaselineStats?.ops ?? 0.750), (v) => v.toFixed(3))}
                          </div>
                        }
                        unit="OPS"
                        value={hitterOps}
                        onChange={setHitterOps}
                        min={0.400}
                        max={1.100}
                        step={0.005}
                        digits={3}
                        themeColor="amber"
                        ticks={[
                          { text: "0.400" },
                          { text: "0.800 (중심)" },
                          { text: "1.000+" },
                        ]}
                      />

                      {/* 포지션 프리미엄 슬라이더 (포수 또는 내외야수) */}
                      {positionCategory === 'CATCHER' ? (
                        <>
                          <StatInputSlider
                            label="도루저지율 (CS%)"
                            subLabel={
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-gray-400">기준({effectiveBaselineStats?.csRate?.toFixed(1) ?? "30.0"}%)대비</span>
                                {renderDeltaBadge(catcherCsRate - (effectiveBaselineStats?.csRate ?? 30.0), (v) => `${v.toFixed(1)}%`)}
                              </div>
                            }
                            unit="%"
                            value={catcherCsRate}
                            onChange={setCatcherCsRate}
                            min={10}
                            max={50}
                            step={0.5}
                            digits={1}
                            themeColor="amber"
                            ticks={[
                              { text: "10.0%" },
                              { text: "30.0% (평균)" },
                              { text: "45.0% (특급)" },
                            ]}
                          />

                          <StatInputSlider
                            label="블로킹 지표 (PB/9)"
                            subLabel={
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-gray-400">기준({effectiveBaselineStats?.pb9?.toFixed(2) ?? "0.38"})대비</span>
                                {renderDeltaBadge(catcherPb9 - (effectiveBaselineStats?.pb9 ?? 0.38), (v) => v.toFixed(2), true)}
                              </div>
                            }
                            unit="PB/9"
                            value={catcherPb9}
                            onChange={setCatcherPb9}
                            min={0.10}
                            max={0.90}
                            step={0.01}
                            digits={2}
                            themeColor="amber"
                            ticks={[
                              { text: "0.20 (철벽)", highlight: true },
                              { text: "0.38 (평균)" },
                              { text: "0.75" },
                            ]}
                          />
                        </>
                      ) : (
                        <>
                          <StatInputSlider
                            label="수비 범위 지표 (RF9)"
                            subLabel={
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-gray-400">기준({effectiveBaselineStats?.rf9?.toFixed(2) ?? "3.85"})대비</span>
                                {renderDeltaBadge(fielderRf9 - (effectiveBaselineStats?.rf9 ?? 3.85), (v) => v.toFixed(2))}
                              </div>
                            }
                            unit="RF9"
                            value={fielderRf9}
                            onChange={setFielderRf9}
                            min={1.00}
                            max={6.00}
                            step={0.05}
                            digits={2}
                            themeColor="emerald"
                            ticks={[
                              { text: "2.00" },
                              { text: "3.85 (평균)" },
                              { text: "5.20 (특급)" },
                            ]}
                          />

                          <StatInputSlider
                            label="순수 장타율 (ISO)"
                            subLabel={
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-gray-400">기준({effectiveBaselineStats?.iso?.toFixed(3) ?? "0.165"})대비</span>
                                {renderDeltaBadge(fielderIso - (effectiveBaselineStats?.iso ?? 0.165), (v) => v.toFixed(3))}
                              </div>
                            }
                            unit="ISO"
                            value={fielderIso}
                            onChange={setFielderIso}
                            min={0.050}
                            max={0.350}
                            step={0.005}
                            digits={3}
                            themeColor="emerald"
                            ticks={[
                              { text: "0.100 (단타)" },
                              { text: "0.165 (중장)" },
                              { text: "0.260+ (거포)" },
                            ]}
                          />
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  /* 2. 투수 렌더링 분기: 좌측(기준 지표) vs 우측(비교 지표) 2분할 카드 레이아웃 */
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* [좌측 컬럼] 기준 지표 (Reference Stats) */}
                    <div className="bg-black/35 rounded-xl border border-white/10 p-4 flex flex-col justify-between gap-4 shadow-sm">
                      <div className="flex flex-col gap-3.5">
                        {/* 헤더 & 년도 드롭아웃 버튼 (샘플 선수는 연도 선택 버튼 제거, 수동 입력 모드 뱃지 표시) */}
                        <div className="flex items-center justify-between pb-3 border-b border-white/10 relative">
                          <div className="flex items-center gap-2">
                            <History className="w-4 h-4 text-gold shrink-0" />
                            <div>
                              <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                                기준 지표
                                <span className="text-[10px] font-normal text-gold">
                                  {isSamplePlayer ? "수동 설정" : "실적"}
                                </span>
                              </h4>
                            </div>
                          </div>

                          {!isSamplePlayer ? (
                            /* 일반 선수: 기준 연도 선택 드롭다운 */
                            <div className="relative" ref={yearDropdownRef}>
                              <button
                                type="button"
                                onClick={() => setIsYearDropdownOpen((prev) => !prev)}
                                className="px-2.5 py-1.5 rounded-lg bg-[#1a202c] hover:bg-[#252e3e] border border-gold/40 hover:border-gold text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                                title="기준 년도를 선택하여 해당 시즌의 DB 성적을 불러옵니다"
                              >
                                <Calendar className="w-3.5 h-3.5 text-gold shrink-0" />
                                <span>{baselineYear}년</span>
                                <ChevronDown
                                  className={`w-3.5 h-3.5 text-gold transition-transform duration-200 ${
                                    isYearDropdownOpen ? "rotate-180" : ""
                                  }`}
                                />
                              </button>

                              {/* 드롭아웃 메뉴 */}
                              {isYearDropdownOpen && (
                                <div className="absolute right-0 top-full mt-1.5 w-44 bg-[#161a24] border border-white/20 rounded-xl shadow-2xl z-50 py-1 overflow-hidden backdrop-blur-md">
                                  <div className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-white/10 flex items-center justify-between">
                                    <span>시즌 선택 (DB 연동)</span>
                                    <span className="text-gold font-mono text-[9px]">KBO</span>
                                  </div>
                                  <div className="max-h-52 overflow-y-auto py-1">
                                    {availableYears.map((yr) => {
                                      const isSelected = yr === baselineYear;
                                      const hasDb = playerDbRecords.some((r) => {
                                        const y = getValue(r, ["연도", "시즌", "year", "Year", "season"]);
                                        return Number(y) === yr;
                                      }) || selectedPlayer?.stats?.some((s) => s.year === yr);

                                      return (
                                        <button
                                          key={yr}
                                          type="button"
                                          onClick={() => {
                                            setBaselineYear(yr);
                                            setIsYearDropdownOpen(false);
                                          }}
                                          className={`w-full px-3 py-2 text-xs flex items-center justify-between text-left transition-all cursor-pointer ${
                                            isSelected
                                              ? "bg-gold/20 text-gold font-bold"
                                              : "text-gray-300 hover:bg-white/10 hover:text-white"
                                          }`}
                                        >
                                          <div className="flex items-center gap-1.5">
                                            <span>{yr} 시즌</span>
                                            {yr === 2025 && (
                                              <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300">최근</span>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-1.5">
                                            {hasDb && (
                                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-white/5 text-gray-400 font-mono">
                                                DB
                                              </span>
                                            )}
                                            {isSelected && <Check className="w-3.5 h-3.5 text-gold" />}
                                          </div>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            /* 샘플 선수: 연도 선택 버튼 제거 및 수동 모드 표시 */
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-gold/15 text-gold border border-gold/30">
                              기준 지표 수동 입력
                            </span>
                          )}
                        </div>

                        {!isSamplePlayer ? (
                          /* 일반 선수: DB 실적 카드형 렌더링 */
                          <>
                            {/* 시즌 안내 태그 & 로딩 인디케이터 */}
                            <div className="flex items-center justify-between text-[11px] bg-white/5 px-2.5 py-1.5 rounded-lg border border-white/5">
                              <div className="flex items-center gap-1.5 text-gray-300">
                                <span className="font-semibold text-white">{baselineYear}년 실제 기록</span>
                                {isBaselineLoading ? (
                                  <Loader2 className="w-3 h-3 animate-spin text-gold" />
                                ) : effectiveBaselineStats?.hasDbRecord ? (
                                  <span className="text-[10px] text-emerald-400 font-medium">● DB 연동완료</span>
                                ) : (
                                  <span className="text-[10px] text-gray-400">참고치</span>
                                )}
                              </div>
                            </div>

                            {/* [요구사항 1]: 기준 지표 카드에 연봉을 직접 입력할 수 있는 입력칸 추가 */}
                            <BaselineSalaryInput
                              year={baselineYear}
                              isSample={isSamplePlayer}
                              value={manualBaselineSalaryText}
                              onChange={setManualBaselineSalaryText}
                              salaryWon={effectiveBaselineSalaryWon}
                              isLoading={isBaselineLoading}
                            />

                            {/* 지표 리스트 (카드형 배치 4개) */}
                            <div className="flex flex-col gap-2.5">
                              {/* 1. 기준 WAR */}
                              <div className="bg-black/40 p-3 rounded-lg border border-white/5 flex items-center justify-between">
                                <div>
                                  <div className="text-[11px] text-gray-400 font-medium">기준 승리기여도</div>
                                  <div className="text-sm font-bold text-white flex items-baseline gap-1">
                                    <span>WAR</span>
                                    <span className="text-base text-gold font-mono">
                                      {effectiveBaselineStats ? effectiveBaselineStats.war.toFixed(2) : "0.00"}
                                    </span>
                                  </div>
                                </div>
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 text-gray-300 border border-white/10">
                                  {(effectiveBaselineStats?.war ?? 0) >= 4.5 ? "에이스/MVP급" : (effectiveBaselineStats?.war ?? 0) >= 3.0 ? "선발 로테이션/필승조" : (effectiveBaselineStats?.war ?? 0) >= 1.5 ? "1군 전력급" : "대체/불펜급"}
                                </span>
                              </div>

                              {/* 2. 기준 투구 이닝 (IP) */}
                              <div className="bg-black/40 p-3 rounded-lg border border-white/5 flex items-center justify-between">
                                <div>
                                  <div className="text-[11px] text-gray-400 font-medium">소화 이닝 (IP)</div>
                                  <div className="text-sm font-bold text-white flex items-baseline gap-1">
                                    <span>이닝</span>
                                    <span className="text-base text-sky-300 font-mono">
                                      {effectiveBaselineStats ? (effectiveBaselineStats.innings ?? 135) : 135} IP
                                    </span>
                                  </div>
                                </div>
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/10 text-sky-300 border border-sky-500/20">
                                  {(effectiveBaselineStats?.innings ?? 135) >= 170 ? "에이스 이닝이터" : (effectiveBaselineStats?.innings ?? 135) >= 130 ? "규정이닝 선발" : (effectiveBaselineStats?.innings ?? 135) >= 60 ? "핵심 불펜/계투" : "추격조/대체"}
                                </span>
                              </div>

                              {/* 3. 기준 평균자책점 (ERA) */}
                              <div className="bg-black/40 p-3 rounded-lg border border-white/5 flex items-center justify-between">
                                <div>
                                  <div className="text-[11px] text-gray-400 font-medium">평균자책점 (ERA)</div>
                                  <div className="text-sm font-bold text-white flex items-baseline gap-1">
                                    <span>ERA</span>
                                    <span className="text-base text-emerald-400 font-mono">
                                      {effectiveBaselineStats?.era !== undefined ? effectiveBaselineStats.era.toFixed(2) : "3.50"}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex flex-col items-end gap-1">
                                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                                    {(effectiveBaselineStats?.era ?? 3.50) <= 2.50 ? "특급 (상위 3%)" : (effectiveBaselineStats?.era ?? 3.50) <= 3.50 ? "리그 우수" : (effectiveBaselineStats?.era ?? 3.50) <= 4.50 ? "리그 평균" : "평균 이상 실점"}
                                  </span>
                                  <span className="text-[9px] text-gray-400">낮을수록 우수 ▼</span>
                                </div>
                              </div>

                              {/* 4. 기준 이닝당 출루허용률 (WHIP) */}
                              <div className="bg-black/40 p-3 rounded-lg border border-white/5 flex items-center justify-between">
                                <div>
                                  <div className="text-[11px] text-gray-400 font-medium">이닝당 출루허용률 (WHIP)</div>
                                  <div className="text-sm font-bold text-white flex items-baseline gap-1">
                                    <span>WHIP</span>
                                    <span className="text-base text-emerald-400 font-mono">
                                      {effectiveBaselineStats?.whip !== undefined ? effectiveBaselineStats.whip.toFixed(2) : "1.22"}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex flex-col items-end gap-1">
                                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                                    {(effectiveBaselineStats?.whip ?? 1.22) <= 1.05 ? "철벽 억제력" : (effectiveBaselineStats?.whip ?? 1.22) <= 1.25 ? "안정권" : "출루 허용률 보통"}
                                  </span>
                                  {effectiveBaselineStats?.wls && (
                                    <span className="text-[9px] text-gray-400 font-mono">{effectiveBaselineStats.wls}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </>
                        ) : (
                          /* 샘플 선수: 기준 지표 수동 입력 슬라이더 / 직접 입력 */
                          <div className="flex flex-col gap-3.5">
                            {/* [요구사항 1]: 기준 지표 카드에 연봉을 직접 입력할 수 있는 입력칸 추가 */}
                            <BaselineSalaryInput
                              year={baselineYear}
                              isSample={isSamplePlayer}
                              value={manualBaselineSalaryText}
                              onChange={setManualBaselineSalaryText}
                              salaryWon={effectiveBaselineSalaryWon}
                              isLoading={isBaselineLoading}
                            />

                            <div className="flex items-center justify-between text-[11px] bg-gold/10 px-2.5 py-1.5 rounded-lg border border-gold/20">
                              <span className="font-semibold text-gold">기준 실적 스탯 직접 조절</span>
                              <span className="text-[10px] text-gold/80">슬라이더 및 수치 조절</span>
                            </div>

                            {/* 기준 WAR */}
                            <StatInputSlider
                              label="기준 WAR (승리기여도)"
                              subLabel={<span className="text-[10px] text-gold/80">기준값</span>}
                              unit="WAR"
                              value={sampleBaselineWar}
                              onChange={setSampleBaselineWar}
                              min={-0.5}
                              max={10}
                              step={0.01}
                              digits={2}
                              allowNegative={true}
                              themeColor="gold"
                              ticks={[
                                { text: "-0.50" },
                                { text: "4.50 (에이스)" },
                                { text: "10.00 (MVP)" },
                              ]}
                            />

                            {/* 기준 투구 이닝 (IP) */}
                            <StatInputSlider
                              label="기준 투구 이닝 (IP)"
                              subLabel={<span className="text-[10px] text-sky-400/80">기준값</span>}
                              unit="이닝"
                              value={sampleBaselineInnings}
                              onChange={setSampleBaselineInnings}
                              min={30}
                              max={200}
                              step={5}
                              digits={0}
                              themeColor="sky"
                              ticks={[
                                { text: "50 (불펜)" },
                                { text: "135 (선발)" },
                                { text: "180 (이닝이터)" },
                              ]}
                            />

                            {/* 기준 평균자책점 (ERA) */}
                            <StatInputSlider
                              label="기준 평균자책점 (ERA)"
                              subLabel={
                                <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/15 px-1.5 py-0.5 rounded border border-emerald-500/30">
                                  낮을수록 우수 ▼
                                </span>
                              }
                              unit="ERA"
                              value={sampleBaselineEra}
                              onChange={setSampleBaselineEra}
                              min={1.50}
                              max={6.50}
                              step={0.05}
                              digits={2}
                              themeColor="sky"
                              ticks={[
                                { text: "1.50 (특급)", highlight: true },
                                { text: "3.50 (평균)" },
                                { text: "6.00" },
                              ]}
                            />

                            {/* 기준 출루허용률 (WHIP) */}
                            <StatInputSlider
                              label="기준 출루허용률 (WHIP)"
                              subLabel={
                                <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/15 px-1.5 py-0.5 rounded border border-emerald-500/30">
                                  낮을수록 우수 ▼
                                </span>
                              }
                              unit="WHIP"
                              value={sampleBaselineWhip}
                              onChange={setSampleBaselineWhip}
                              min={0.80}
                              max={1.80}
                              step={0.01}
                              digits={2}
                              themeColor="sky"
                              ticks={[
                                { text: "0.90 (최정상)", highlight: true },
                                { text: "1.22 (준수)" },
                                { text: "1.60" },
                              ]}
                            />
                          </div>
                        )}
                      </div>

                      {/* 하단: 기준 스탯을 비교 지표로 복사 버튼 */}
                      <button
                        type="button"
                        onClick={handleApplyBaselineToComparison}
                        className="w-full py-2 px-3 rounded-lg bg-gold/15 hover:bg-gold/25 border border-gold/30 text-gold text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm mt-1"
                        title="현재 설정된 기준 실적 스탯을 우측 비교 지표 슬라이더에 그대로 복사합니다"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>기준 스탯을 비교 지표로 가져오기</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* [우측 컬럼] 비교 지표 (Comparison Stats / Sliders) */}
                    <div className="bg-black/35 rounded-xl border border-white/10 p-4 flex flex-col gap-3.5 shadow-sm">
                      {/* 비교지표 연도 선택 버튼 (샘플 선수는 제외) */}
                      <div className="flex items-center justify-between pb-3 border-b border-white/10">
                        <div className="flex items-center gap-2">
                          <SlidersHorizontal className="w-4 h-4 text-sky-400 shrink-0" />
                          <div>
                            <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                              비교 지표
                              <span className="text-[10px] font-normal text-sky-400">
                                {isSamplePlayer ? "수동 설정" : "시뮬레이션"}
                              </span>
                            </h4>
                          </div>
                        </div>

                        {!isSamplePlayer ? (
                          /* 일반 선수: 비교 연도 선택 드롭다운 */
                          <div className="relative" ref={compYearDropdownRef}>
                            <button
                              type="button"
                              onClick={() => setIsCompYearDropdownOpen((prev) => !prev)}
                              className="px-2.5 py-1.5 rounded-lg bg-[#1a202c] hover:bg-[#252e3e] border border-sky-500/40 hover:border-sky-400 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                              title="비교할 KBO 시즌을 선택하면 해당 시즌의 실적 스탯이 슬라이더에 즉시 반영됩니다"
                            >
                              <Calendar className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                              <span>{comparisonYear}년</span>
                              <ChevronDown
                                className={`w-3.5 h-3.5 text-sky-400 transition-transform duration-200 ${
                                  isCompYearDropdownOpen ? "rotate-180" : ""
                                }`}
                              />
                            </button>

                            {/* 비교 연도 드롭아웃 메뉴 */}
                            {isCompYearDropdownOpen && (
                              <div className="absolute right-0 top-full mt-1.5 w-44 bg-[#161a24] border border-white/20 rounded-xl shadow-2xl z-50 py-1 overflow-hidden backdrop-blur-md">
                                <div className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-white/10 flex items-center justify-between">
                                  <span>비교 시즌 선택 (DB 연동)</span>
                                  <span className="text-sky-400 font-mono text-[9px]">KBO</span>
                                </div>
                                <div className="max-h-52 overflow-y-auto py-1">
                                  {availableYears.map((yr) => {
                                    const isSelected = yr === comparisonYear;
                                    const hasDb = playerDbRecords.some((r) => {
                                      const y = getValue(r, ["연도", "시즌", "year", "Year", "season"]);
                                      return Number(y) === yr;
                                    }) || selectedPlayer?.stats?.some((s) => s.year === yr);

                                    return (
                                      <button
                                        key={yr}
                                        type="button"
                                        onClick={() => handleSelectComparisonYear(yr)}
                                        className={`w-full px-3 py-2 text-xs flex items-center justify-between text-left transition-all cursor-pointer ${
                                          isSelected
                                            ? "bg-sky-500/20 text-sky-300 font-bold"
                                            : "text-gray-300 hover:bg-white/10 hover:text-white"
                                        }`}
                                      >
                                        <div className="flex items-center gap-1.5">
                                          <span>{yr} 시즌</span>
                                          {yr === 2025 && (
                                            <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300">최근</span>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                          {hasDb && (
                                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-white/5 text-gray-400 font-mono">
                                              DB
                                            </span>
                                          )}
                                          {isSelected && <Check className="w-3.5 h-3.5 text-sky-400" />}
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          /* 샘플 선수: 연도 선택 버튼 미표시, 수동 안내 뱃지 */
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-sky-500/10 text-sky-300 border border-sky-500/20 whitespace-nowrap">
                            비교 지표 수동 입력
                          </span>
                        )}
                      </div>

                      {/* 투수 슬라이더 1: 목표 WAR (소수점 2자리까지 정밀 설정 및 음수 -0.5까지 직접 입력 지원) */}
                      <StatInputSlider
                        label="목표 WAR (승리기여도)"
                        subLabel={
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-gray-400">기준({effectiveBaselineStats?.war.toFixed(2) ?? "0.00"})대비</span>
                            {renderDeltaBadge(targetWar - (effectiveBaselineStats?.war ?? 0), (v) => v.toFixed(2))}
                          </div>
                        }
                        unit="WAR"
                        value={targetWar}
                        onChange={setTargetWar}
                        min={-0.5}
                        max={10}
                        step={0.01}
                        digits={2}
                        allowNegative={true}
                        themeColor="gold"
                        ticks={[
                          { text: "-0.50" },
                          { text: "4.50 (에이스급)" },
                          { text: "8.00+ (MVP/골든글러브)" },
                        ]}
                      />

                      {/* 투수 슬라이더 2: 이닝 (IP) */}
                      <StatInputSlider
                        label="목표 투구 이닝 (IP)"
                        subLabel={
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-gray-400">기준({effectiveBaselineStats?.innings ?? 135}이닝)대비</span>
                            {renderDeltaBadge(pitcherInnings - (effectiveBaselineStats?.innings ?? 135), (v) => `${Math.round(v)}이닝`)}
                          </div>
                        }
                        unit="이닝"
                        value={pitcherInnings}
                        onChange={setPitcherInnings}
                        min={30}
                        max={200}
                        step={5}
                        digits={0}
                        themeColor="sky"
                        ticks={[
                          { text: "50 (핵심 불펜)" },
                          { text: "135 (선발 로테이션)" },
                          { text: "180 (에이스 이닝이터)" },
                        ]}
                      />

                      {/* 투수 슬라이더 3: ERA */}
                      <StatInputSlider
                        label="평균자책점 (ERA)"
                        subLabel={
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-gray-400">기준({effectiveBaselineStats?.era?.toFixed(2) ?? "3.50"})대비</span>
                            {renderDeltaBadge(pitcherEra - (effectiveBaselineStats?.era ?? 3.50), (v) => v.toFixed(2), true)}
                          </div>
                        }
                        unit="ERA"
                        value={pitcherEra}
                        onChange={setPitcherEra}
                        min={1.50}
                        max={6.50}
                        step={0.05}
                        digits={2}
                        themeColor="sky"
                        ticks={[
                          { text: "1.50 (특급 억제력)", highlight: true },
                          { text: "3.50 (안정권)" },
                          { text: "6.00" },
                        ]}
                      />

                      {/* 투수 슬라이더 4: WHIP */}
                      <StatInputSlider
                        label="이닝당 출루허용률 (WHIP)"
                        subLabel={
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-gray-400">기준({effectiveBaselineStats?.whip?.toFixed(2) ?? "1.22"})대비</span>
                            {renderDeltaBadge(pitcherWhip - (effectiveBaselineStats?.whip ?? 1.22), (v) => v.toFixed(2), true)}
                          </div>
                        }
                        unit="WHIP"
                        value={pitcherWhip}
                        onChange={setPitcherWhip}
                        min={0.80}
                        max={1.80}
                        step={0.01}
                        digits={2}
                        themeColor="sky"
                        ticks={[
                          { text: "0.90 (리그 최정상)", highlight: true },
                          { text: "1.22 (준수)" },
                          { text: "1.60" },
                        ]}
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-black/30 border border-dashed border-white/10 rounded-xl p-5 text-center text-xs text-gray-500 flex flex-col items-center justify-center gap-1.5">
                <Target className="w-5 h-5 text-gray-600 mb-1" />
                <span className="text-gray-400 font-medium">목표 스탯 파라미터</span>
                <span className="text-[11px] text-gray-600 max-w-xs leading-relaxed">
                  선수를 검색해 선택하면 해당 포지션에 맞는 세부 스탯 및 가치 모델링 슬라이더가 표시됩니다.
                </span>
              </div>
            )}
          </div>

          <button 
            onClick={runSimulation}
            disabled={loading || !selectedPlayer}
            className="w-full bg-gradient-to-r from-gold to-amber-500 hover:from-amber-400 hover:to-gold text-black px-4 py-3 rounded-xl text-xs font-bold transition-all shadow-lg shadow-gold/20 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin text-black" /> : <Sparkles className="w-4 h-4 stroke-[2.5]" />}
            <span>
              {loading
                ? "AI 시나리오 분석 중..."
                : selectedPlayer
                ? `AI 협상 논리 시뮬레이션 (${getSinglePositionName(selectedPlayer, positionCategory)})`
                : "선수를 먼저 검색해 주세요"}
            </span>
          </button>
        </div>

        {/* 우측: 연봉 범위 및 AI 브리핑 패널 */}
        <div className="col-span-1 xl:col-span-5 flex flex-col gap-6">
          {/* 우측 상단: 투트랙(Two-Track) 예상 연봉 결과 */}
          <div className="bg-[#131722] border border-white/10 rounded-2xl p-6 md:p-8 shadow-xl flex flex-col items-center justify-center text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-44 h-44 bg-gold/5 rounded-bl-full pointer-events-none" />
            
            {/* 선수 기본 정보 태그 */}
            <div className="flex items-center gap-2 mb-3 flex-wrap justify-center">
              <span className="text-base font-bold text-gray-300 flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-emerald-400" />
                {selectedPlayer ? `${selectedPlayer.name} (${selectedPlayer.team} • ${getSinglePositionName(selectedPlayer, positionCategory)})` : "선수 미선택"}
              </span>
              <span className="text-[13px] font-mono px-2 py-0.5 rounded-full bg-white/5 text-gray-300 border border-white/10">
                1군 등록일수: {selectedPlayer ? serviceTimeInfo.display : "-"}
              </span>
              <span className={`text-[13px] font-bold px-2 py-0.5 rounded-full border ${!selectedPlayer ? "bg-white/5 text-gray-400 border-white/10" : isNonFA ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-gold/15 text-gold border-gold/30"}`}>
                {!selectedPlayer ? "선수 미선택" : isNonFA ? "비FA (등록일수 미달)" : "FA 자격 충족"}
              </span>
              {selectedPlayer && draftInfo.display && (
                <span className="text-[13px] font-mono px-2 py-0.5 rounded-full bg-white/5 text-gray-400 border border-white/5">
                  {draftInfo.display} ({careerYears}년차)
                </span>
              )}
              {selectedPlayer && (samplePlayers.some(p => p.id === selectedPlayer.id) || (selectedPlayer as any).isSample) && (
                <button
                  type="button"
                  onClick={() => {
                    setSampleModalInitialPlayer(selectedPlayer);
                    setIsSampleModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 transition-all cursor-pointer font-bold shadow-sm"
                  title="샘플 선수 정보(연봉, 등록일수, 스탯 등) 수정"
                >
                  <Pencil className="w-3 h-3" />
                  <span>샘플 정보 수정</span>
                </button>
              )}
            </div>

            {/* 1. 최상단: [현실적 협상 목표액] (가장 크게 렌더링) */}
            <div className="w-full flex flex-col items-center">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[14px] font-extrabold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20 flex items-center gap-1">
                  <Target className="w-3 h-3" />
                  현실적 협상 목표액 {selectedPlayer ? `(${isNonFA ? "비FA 구단 고과 타겟" : "FA 협상 목표 타겟"})` : ""}
                </span>
              </div>
              
              <div className="flex items-baseline justify-center gap-2.5 my-2.5 flex-wrap">
                {selectedPlayer ? (
                  <>
                    <span className="text-3xl sm:text-4xl md:text-5xl font-black text-white font-mono tracking-tight">
                      {formatKoreanSalary(roundedMinPractical)}
                    </span>
                    <span className="text-2xl text-gray-500 font-bold">~</span>
                    <span className="text-3xl sm:text-4xl md:text-5xl font-black text-gold font-mono tracking-tight drop-shadow-sm">
                      {formatKoreanSalary(roundedMaxPractical)}
                    </span>
                  </>
                ) : (
                  <span className="text-3xl sm:text-4xl md:text-5xl font-black text-white font-mono tracking-tight">
                    0원
                  </span>
                )}
              </div>

              {/* 기준 지표 연봉 대비 인상률 비교 */}
              <div className="flex items-center gap-2 mt-1 text-xs text-gray-300 font-mono flex-wrap justify-center">
                <span className="text-[11px]">
                  기준 연봉:{" "}
                  <strong className="text-white">
                    {selectedPlayer
                      ? baselineBaseSalaryWon > 0
                        ? formatKoreanSalary(baselineBaseSalaryWon)
                        : "미입력"
                      : "0원"}
                  </strong>
                  {selectedPlayer && !isSamplePlayer && (
                    <span className="text-[10px] text-gray-400 ml-1">({baselineYear}년)</span>
                  )}
                </span>
                <span className="text-gray-600">•</span>
                {selectedPlayer ? (
                  baselineBaseSalaryWon > 0 ? (
                    isPureIncrease ? (
                      <span className="text-[13px] text-emerald-400 font-bold">
                        최대 +{formatKoreanSalary(maxIncreaseWon)} 인상 타겟 (+{maxIncreasePercent}%)
                      </span>
                    ) : isPureCut ? (
                      <span className="text-[13px] text-rose-400 font-bold">
                        최대 -{formatKoreanSalary(maxCutWon)} 삭감 예상 (-{maxCutPercent}%)
                      </span>
                    ) : isMixed ? (
                      <span className="text-[13px] text-amber-400 font-bold">
                        최대 -{formatKoreanSalary(maxCutWon)} 삭감 ~ +{formatKoreanSalary(maxIncreaseWon)} 인상 변동 구간
                      </span>
                    ) : (
                      <span className="text-[13px] text-amber-400 font-bold">기준 연봉 수준 유지 권고 (0%)</span>
                    )
                  ) : (
                    <span className="text-[12px] text-amber-300 font-medium">
                      기준 연봉을 입력하시면 정확한 예상 인상/삭감률이 표시됩니다
                    </span>
                  )
                ) : (
                  <span className="text-[13px] text-gray-400">선수 검색 대기 중</span>
                )}
              </div>

              {/* 요청된 안내 문구 */}
              <p className="text-xs text-gray-300 mt-2.5 font-medium flex items-center justify-center gap-1.5 bg-black/25 px-3 py-1.5 rounded-lg border border-white/5">
                <AlertCircle className="w-3.5 h-3.5 text-gold shrink-0" />
                <span className="text-[13px]">
                  {!selectedPlayer
                    ? "선수를 검색하거나 선택하면 데이터 기반 예상 연봉 및 고과 인상액이 계산됩니다."
                    : isNonFA
                    ? "1군 등록일수 기준 비FA 선수입니다. 시장 가치 대비 현실적인 구단 고과 인상률을 적용한 타겟 금액입니다."
                    : "1군 등록일수 기준 FA 자격 요건을 충족한 선수입니다. 시장 가치가 협상 목표액에 직접 반영됩니다."}
                </span>
              </p>
            </div>

            {/* 2. 그 바로 아래: [데이터 기반 FA 환산 가치] 카드/배지 */}
            <div className="w-full mt-5 pt-4 border-t border-white/10">
              <div className="bg-black/40 border border-gold/20 rounded-xl p-3.5 flex flex-col gap-2.5">
                {/* 상단 1행: 타이틀 및 환산 가치 금액 (1줄로 표시, 공간 좁을 시 ml-auto로 깔끔하게 줄바꿈) */}
                <div className="flex items-center justify-between gap-2.5 flex-wrap">
                  <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                    <Sparkles className="w-4 h-4 text-gold shrink-0" />
                    <span className="text-xs sm:text-sm font-bold text-white whitespace-nowrap">
                      데이터 기반 FA 환산 가치
                    </span>
                    <span className="text-[10px] sm:text-[11px] font-mono font-semibold text-gold px-1.5 py-0.5 rounded bg-gold/10 border border-gold/25 whitespace-nowrap">
                      Market Value
                    </span>
                    <span className="text-[11px] font-normal text-gray-400 whitespace-nowrap hidden 2xl:inline">
                      (WAR 1.0당 1.5억~2.0억원 기준)
                    </span>
                  </div>

                  <div className="text-right whitespace-nowrap ml-auto">
                    {selectedPlayer ? (
                      <div className="flex items-baseline gap-1 font-mono">
                        <span className="text-xs sm:text-sm font-bold text-gray-300 whitespace-nowrap">
                          {formatKoreanSalary(roundedMinFa)}
                        </span>
                        <span className="text-xs text-gray-500 font-bold mx-0.5">~</span>
                        <span className="text-sm sm:text-base font-black text-amber-300 whitespace-nowrap">
                          {formatKoreanSalary(roundedMaxFa)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-sm sm:text-base font-black font-mono text-gray-400 whitespace-nowrap">
                        0원
                      </span>
                    )}
                  </div>
                </div>

                {/* 하단 2행: 협상 앵커링 팁 & 기준 안내 (전체 너비 활용하여 1~2줄 깔끔 줄바꿈) */}
                <div className="flex items-center justify-between gap-2 text-[11px] text-gray-400 pt-1.5 border-t border-white/5 flex-wrap">
                  <span className="leading-normal break-keep">
                    구단 협상 시 상한 앵커링(Anchoring) 논리 근거 • 시장 대비 대폭 할인 설득 활용
                  </span>
                  <span className="text-[10px] text-gray-500 whitespace-nowrap 2xl:hidden">
                    (WAR 1.0당 1.5억~2.0억원 기준)
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 우측 하단: AI 협상 논리 */}
          <div className="bg-[#131722] border border-white/10 rounded-2xl p-6 shadow-xl flex-1 flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-gold" />
                AI 핵심 협상 브리핑 (Negotiation Logic)
              </h3>
              <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-gold/15 text-gold border border-gold/30">
                {selectedPlayer ? `${getSinglePositionName(selectedPlayer, positionCategory)} 맞춤 논리` : "선수 미선택"}
              </span>
            </div>
            
            <div className="bg-black/30 rounded-xl border border-white/5 p-5 flex-1 min-h-[260px]">
              {report ? (
                <div className="prose prose-sm prose-invert max-w-none font-sans text-gray-200 text-xs leading-relaxed space-y-2">
                  <div className="whitespace-pre-wrap">{report}</div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-gray-500 gap-3 py-10">
                  <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
                    <Calculator className="w-5 h-5 text-gray-500" />
                  </div>
                  <p className="text-xs text-center text-gray-400 max-w-xs leading-relaxed">
                    좌측 패널에서 <span className="text-gold font-bold">데이터베이스 선수 검색</span>으로 선수를 선택하고 목표 스탯을 설정한 후,<br/>
                    <span className="text-gold font-bold">[AI 협상 논리 시뮬레이션]</span> 버튼을 누르면 브리핑이 생성됩니다.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 샘플 / 가상 선수 수기 등록 모달 */}
      <SamplePlayerModal
        isOpen={isSampleModalOpen}
        onClose={() => setIsSampleModalOpen(false)}
        onApply={handleApplySamplePlayer}
        initialPlayer={sampleModalInitialPlayer}
      />

      {/* 샘플 선수 삭제 확인 경고 모달 */}
      {deleteConfirmPlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#181c28] border border-red-500/40 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl shadow-red-950/40 relative">
            <div className="p-5 border-b border-white/10 bg-red-950/30 flex items-center justify-between">
              <div className="flex items-center gap-2.5 text-red-400">
                <div className="w-8 h-8 rounded-lg bg-red-500/20 border border-red-500/30 flex items-center justify-center">
                  <Trash2 className="w-4 h-4 text-red-400" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">샘플 선수 삭제 확인</h3>
                  <p className="text-[11px] text-red-300/80">Sample_Player_DB 데이터 영구 삭제</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !isDeleting && setDeleteConfirmPlayer(null)}
                disabled={isDeleting}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="p-3.5 bg-black/40 border border-white/10 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">대상 선수명</span>
                  <span className="text-sm font-bold text-white">{deleteConfirmPlayer.name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">소속 / 포지션</span>
                  <span className="text-xs text-gray-300">{deleteConfirmPlayer.team} • {deleteConfirmPlayer.position}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">현재 연봉</span>
                  <span className="text-xs font-semibold text-gold">{formatKoreanSalary(deleteConfirmPlayer.salaryCurrent)}</span>
                </div>
              </div>

              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs leading-relaxed">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
                <p>
                  정말로 이 샘플 선수를 삭제하시겠습니까?<br />
                  화면뿐만 아니라 구글 시트의 <strong className="text-white">Sample_Player_DB</strong>에서도 데이터가 영구히 제거됩니다.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmPlayer(null)}
                  disabled={isDeleting}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-colors cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={isDeleting}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white shadow-lg shadow-red-900/30 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>DB 삭제 중...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>네, 삭제합니다</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


