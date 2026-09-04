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

export function loadStoredPlayers(): Player[] {
  try {
    const saved = localStorage.getItem(PLAYERS_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (e) {
    console.error("Failed to load players from storage:", e);
  }
  return [];
}

export function saveStoredPlayers(players: Player[]): void {
  try {
    localStorage.setItem(PLAYERS_STORAGE_KEY, JSON.stringify(players));
    window.dispatchEvent(new Event("kbo_players_updated"));
  } catch (e) {
    console.error("Failed to save players to storage:", e);
  }
}

