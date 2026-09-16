export interface PlayerStat {
  year: number;
  avg?: number;
  ops?: number;
  war?: number | null;
  hr?: number;
  era?: number;
  whip?: number;
  wls?: string; // 승/홀/세 (예: "10승 5패 12홀", "3승 32세", "4승 2패")
  salary: number;
  csRate?: number;
  pb9?: number;
  rf9?: number;
  iso?: number;
  [key: string]: any;
}

export interface Player {
  id: string;
  name: string;
  team: string;
  position: string;
  age: number;
  salaryCurrent: number;
  draftYear: number;
  serviceTime: string;
  contractPeriod?: string; // 에이전트와의 계약기간 (예: "24년 01월 01일 ~ 26년 12월 31일")
  agent?: string; // 담당 에이전트 ("이세인" | "김승현")
  stats: PlayerStat[];
}

export const AVAILABLE_AGENTS = ["이세인", "김승현"] as const;
export type AgentName = typeof AVAILABLE_AGENTS[number];

/**
 * 에이전트별 차별화된 뱃지 스타일을 반환하는 함수
 * - 이세인: 따뜻하고 품격 있는 골드/앰버 톤
 * - 김승현: 시원하고 신뢰감 있는 스카이블루/청색 톤
 * - 미정: 차분한 뉴트럴 그레이 톤
 */
export function getAgentBadgeStyle(agentName?: string): {
  badgeClass: string;
  iconClass: string;
  dotClass: string;
} {
  const clean = (agentName || "").trim();
  if (clean === "이세인") {
    return {
      badgeClass: "bg-amber-500/15 border-amber-400/40 text-amber-300 shadow-amber-500/10",
      iconClass: "text-amber-400",
      dotClass: "bg-amber-400",
    };
  }
  if (clean === "김승현") {
    return {
      badgeClass: "bg-sky-500/15 border-sky-400/40 text-sky-300 shadow-sky-500/10",
      iconClass: "text-sky-400",
      dotClass: "bg-sky-400",
    };
  }
  if (!clean || clean === "미정" || clean === "-") {
    return {
      badgeClass: "bg-white/5 border-white/10 text-gray-400",
      iconClass: "text-gray-500",
      dotClass: "bg-gray-500",
    };
  }
  // 기타 예비 에이전트
  return {
    badgeClass: "bg-emerald-500/15 border-emerald-400/40 text-emerald-300 shadow-emerald-500/10",
    iconClass: "text-emerald-400",
    dotClass: "bg-emerald-400",
  };
}

export interface Team {
  id: string;
  name: string;
  salaryCap: number;
  currentPayroll: number;
  winNowMode: boolean;
  costPerWar: number;
  positionalSpending: {
    pitcher: number;
    catcher: number;
    infield: number;
    outfield: number;
  };
}

export const mockTeams: Team[] = [
  {
    id: "t1",
    name: "LG 트윈스",
    salaryCap: 14397230000,
    currentPayroll: 10500000000,
    winNowMode: true,
    costPerWar: 150000000,
    positionalSpending: { pitcher: 40, catcher: 10, infield: 30, outfield: 20 }
  },
  {
    id: "t2",
    name: "KT 위즈",
    salaryCap: 14397230000,
    currentPayroll: 9500000000,
    winNowMode: true,
    costPerWar: 130000000,
    positionalSpending: { pitcher: 45, catcher: 5, infield: 25, outfield: 25 }
  },
  {
    id: "t3",
    name: "SSG 랜더스",
    salaryCap: 14397230000,
    currentPayroll: 11000000000,
    winNowMode: true,
    costPerWar: 160000000,
    positionalSpending: { pitcher: 35, catcher: 10, infield: 35, outfield: 20 }
  },
  {
    id: "t4",
    name: "NC 다이노스",
    salaryCap: 14397230000,
    currentPayroll: 8500000000,
    winNowMode: false,
    costPerWar: 110000000,
    positionalSpending: { pitcher: 45, catcher: 10, infield: 25, outfield: 20 }
  },
  {
    id: "t5",
    name: "두산 베어스",
    salaryCap: 14397230000,
    currentPayroll: 9800000000,
    winNowMode: true,
    costPerWar: 140000000,
    positionalSpending: { pitcher: 40, catcher: 15, infield: 25, outfield: 20 }
  },
  {
    id: "t6",
    name: "KIA 타이거즈",
    salaryCap: 14397230000,
    currentPayroll: 10200000000,
    winNowMode: true,
    costPerWar: 145000000,
    positionalSpending: { pitcher: 38, catcher: 12, infield: 20, outfield: 30 }
  },
  {
    id: "t7",
    name: "롯데 자이언츠",
    salaryCap: 14397230000,
    currentPayroll: 9200000000,
    winNowMode: false,
    costPerWar: 125000000,
    positionalSpending: { pitcher: 40, catcher: 10, infield: 25, outfield: 25 }
  },
  {
    id: "t8",
    name: "삼성 라이온즈",
    salaryCap: 14397230000,
    currentPayroll: 8800000000,
    winNowMode: false,
    costPerWar: 115000000,
    positionalSpending: { pitcher: 35, catcher: 15, infield: 20, outfield: 30 }
  },
  {
    id: "t9",
    name: "한화 이글스",
    salaryCap: 14397230000,
    currentPayroll: 9500000000,
    winNowMode: true,
    costPerWar: 135000000,
    positionalSpending: { pitcher: 40, catcher: 10, infield: 30, outfield: 20 }
  },
  {
    id: "t10",
    name: "키움 히어로즈",
    salaryCap: 14397230000,
    currentPayroll: 6500000000,
    winNowMode: false,
    costPerWar: 95000000,
    positionalSpending: { pitcher: 45, catcher: 5, infield: 25, outfield: 25 }
  }
];

export const mockPlayers: Player[] = [];

export const PLAYERS_STORAGE_KEY = "kbo_agency_players";

/**
 * KBO 마스터 데이터베이스(Stat_Master_DB/구글 스프레드시트) 기준 등록 선수 메타데이터
 * - 하드코딩 2018년 또는 '1년 0일' 임의값 방지 및 DB 기준 정상 복원용
 */
export const KBO_AGENCY_DB_METADATA: Record<string, { draftYear: number; serviceTime: string }> = {
  "손성빈": { draftYear: 2021, serviceTime: "3년 133일 (568일)" }, // DB: '21롯데', 568일
  "나승엽": { draftYear: 2021, serviceTime: "3년 87일 (522일)" },   // DB: '21롯데', 522일
  "곽빈":   { draftYear: 2018, serviceTime: "7년 13일 (1,028일)" },  // DB: '18두산', 1028일
  "노시환": { draftYear: 2019, serviceTime: "9년 90일 (1,395일)" },  // DB: '19한화', 1395일
  "김도영": { draftYear: 2022, serviceTime: "5년 11일 (736일)" },   // DB: '22KIA', 736일
  "이이무라": { draftYear: 2026, serviceTime: "69일" },             // DB: '26롯데', 69일
  "박찬호": { draftYear: 2014, serviceTime: "11년 103일 (1,698일)" },// DB: '14KIA', 1698일
  "황성빈": { draftYear: 2022, serviceTime: "5년 71일 (796일)" },   // DB: '22롯데', 796일
  "정보근": { draftYear: 2019, serviceTime: "6년 10일 (880일)" },   // DB: '19롯데', 880일
  "윤동희": { draftYear: 2022, serviceTime: "4년 73일 (653일)" },   // DB: '22롯데', 653일
  "양의지": { draftYear: 2006, serviceTime: "20년 132일 (3,032일)" },// DB: '06두산', 3032일
  "손아섭": { draftYear: 2007, serviceTime: "22년 21일 (3,211일)" }, // DB: '07롯데', 3211일
};

/**
 * 선수 연봉 원(KRW) 단위 및 DB 메타데이터(입단연도, 등록일수, WAR) 정규화 헬퍼 함수
 * - 500억원 초과 비정상적인 값(과거 중복 10,000 곱셈 오류) 복원
 * - 500만 미만 값(만원 단위 입력: 예: 6000)은 원 단위(60,000,000)로 보정
 * - 2018년 일괄 적용 오류 복구: DB 기준 실제 입단연도 및 등록일수 적용
 */
export function sanitizePlayerSalary(player: Player): Player {
  if (!player || typeof player !== "object") return player;
  let sal = player.salaryCurrent || 0;
  while (sal > 50000000000) {
    sal = Math.round(sal / 10000);
  }
  if (sal > 0 && sal < 5000000) {
    sal = sal * 10000;
  }
  const cleanName = String(player.name || "").trim();
  const cleanStats = (player.stats || []).map(st => {
    let s = st.salary || 0;
    while (s > 50000000000) {
      s = Math.round(s / 10000);
    }
    if (s > 0 && s < 5000000) {
      s = s * 10000;
    }
    let warVal = typeof st.war === "number" ? Number(st.war.toFixed(2)) : (st.war ? Number(parseFloat(String(st.war)).toFixed(2)) : 0);
    return { ...st, salary: s, war: warVal };
  });

  // DB 기준 입단연도 및 등록일수 복원 (기존 2018 일괄 적용 및 1년 0일 오류 치유)
  let draftYear = player.draftYear;
  let serviceTime = player.serviceTime;
  if (KBO_AGENCY_DB_METADATA[cleanName]) {
    const meta = KBO_AGENCY_DB_METADATA[cleanName];
    if (!draftYear || (draftYear === 2018 && cleanName !== "곽빈")) {
      draftYear = meta.draftYear;
    }
    if (!serviceTime || serviceTime === "1년 0일" || serviceTime === "0일" || serviceTime === "-") {
      serviceTime = meta.serviceTime;
    }
  }

  // 괄호 속 일수가 1,000 이상이면 콤마 추가 (예: (1028일) -> (1,028일))
  if (serviceTime) {
    serviceTime = serviceTime.replace(/\(([\d,]+)\s*일\)/g, (_, digits) => {
      const num = parseInt(digits.replace(/,/g, ""), 10);
      return isNaN(num) ? `(${digits}일)` : `(${num.toLocaleString()}일)`;
    });
  }

  return {
    ...player,
    draftYear: draftYear || player.draftYear,
    serviceTime: serviceTime || player.serviceTime,
    salaryCurrent: sal,
    stats: cleanStats
  };
}

export function loadStoredPlayers(): Player[] {
  try {
    const saved = localStorage.getItem(PLAYERS_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return parsed.map(sanitizePlayerSalary);
      }
    }
  } catch (e) {
    console.error("Failed to load players from storage:", e);
  }
  return [];
}

export function saveStoredPlayers(players: Player[]): void {
  try {
    const sanitized = players.map(sanitizePlayerSalary);
    localStorage.setItem(PLAYERS_STORAGE_KEY, JSON.stringify(sanitized));
    window.dispatchEvent(new Event("kbo_players_updated"));
  } catch (e) {
    console.error("Failed to save players to storage:", e);
  }
}

