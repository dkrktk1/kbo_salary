import { extractCsFromObject, extractOpsFromObject, extractWarFromObject, DbRawPlayerRecord } from "./services/dbService";

// API 응답 데이터 인터페이스
export interface ApiPlayerStat {
  연도: number;
  선수명: string;
  팀?: string;
  구단?: string;
  소속?: string;
  포지션?: string;
  // 타자 / 수비 지표
  "CS%"?: number;
  "BLK/9"?: number;
  "PB/9"?: number;
  OPS?: number;
  "wRC+"?: number;
  WAR?: number;
  팝타임?: number;
  ISO?: number;
  "BB/K"?: number;
  RF9?: number;
  DP?: number;
  A?: number;
  OAA?: number;
  DPR?: number;
  ARM?: number;
  AVG?: number;
  OBP?: number;
  SLG?: number;
  FPCT?: number;
  // 투수 지표
  ERA?: number;
  FIP?: number;
  "K/9"?: number;
  "BB/9"?: number;
  "LOB%"?: number;
  "HR/9"?: number;
  WHIP?: number;
  IP?: number;
  [key: string]: any;
}

export const KBO_TEAMS = [
  "롯데 자이언츠",
  "KIA 타이거즈",
  "삼성 라이온즈",
  "LG 트윈스",
  "두산 베어스",
  "KT 위즈",
  "SSG 랜더스",
  "한화 이글스",
  "NC 다이노스",
  "키움 히어로즈",
];

// 다양한 포지션의 빠른 추천 검색 프리셋
export const QUICK_SEARCH_PRESETS = [
  { name: "손성빈", team: "롯데 자이언츠", pos: "포수", label: "포수" },
  { name: "강민호", team: "삼성 라이온즈", pos: "포수", label: "포수" },
  { name: "박동원", team: "LG 트윈스", pos: "포수", label: "포수" },
  { name: "김도영", team: "KIA 타이거즈", pos: "3루수", label: "내야수" },
  { name: "문보경", team: "LG 트윈스", pos: "3루수", label: "내야수" },
  { name: "구자욱", team: "삼성 라이온즈", pos: "우익수", label: "외야수" },
  { name: "원태인", team: "삼성 라이온즈", pos: "선발투수", label: "투수" },
  { name: "곽빈", team: "두산 베어스", pos: "선발투수", label: "투수" },
];

/**
 * 1. 포지션 판별 타입 및 로직
 */
export type PositionGroup = "catcher" | "infield" | "outfield" | "pitcher";

export function detectPositionGroup(posString?: string | null): PositionGroup {
  if (!posString) return "catcher";
  const clean = posString.trim().toLowerCase();
  
  // 1. 투수 판별 (우선 순위)
  if (/투수|pitcher|p(?![a-z])|sp|rp|cp|선발|구원|불펜|마무리/i.test(clean)) {
    return "pitcher";
  }
  // 2. 포수 판별
  if (/포수|catcher|c(?![a-z])/i.test(clean)) {
    return "catcher";
  }
  // 3. 내야수 판별 (1루수, 2루수, 3루수, 유격수, 1B, 2B, 3B, SS, IF, INF 등)
  if (/내야|1루|2루|3루|유격|1b|2b|3b|ss|if|inf|내야수|infield/i.test(clean)) {
    return "infield";
  }
  // 4. 외야수 판별 (좌익수, 중견수, 우익수, LF, CF, RF, OF, 외야 등)
  if (/외야|좌익|중견|우익|lf|cf|rf|of|외야수|outfield/i.test(clean)) {
    return "outfield";
  }
  
  return "catcher";
}

export function getPositionGroupLabel(group: PositionGroup): string {
  switch (group) {
    case "catcher":
      return "포수 (Catcher)";
    case "infield":
      return "내야수 (Infield)";
    case "outfield":
      return "외야수 (Outfield)";
    case "pitcher":
      return "투수 (Pitcher)";
  }
}

/**
 * 2. 수치 포맷팅 & 예외 처리 헬퍼 함수
 */
export function formatStatValue(
  val: any, 
  type: "number1" | "number2" | "number3" | "integer" | "percent" | "count" | "seconds" = "number2"
): { text: string; isNoData: boolean } {
  if (val === undefined || val === null || val === "" || val === "-") {
    return { text: "데이터 없음", isNoData: true };
  }
  
  let num: number;
  if (typeof val === "number") {
    num = val;
  } else {
    const clean = String(val).replace(/%/g, "").trim();
    num = parseFloat(clean);
  }

  if (isNaN(num)) {
    return { text: "데이터 없음", isNoData: true };
  }

  switch (type) {
    case "percent": {
      const p = (num > 0 && num <= 1) ? num * 100 : num;
      return { text: `${p.toFixed(1)}%`, isNoData: false };
    }
    case "number1":
      return { text: num.toFixed(1), isNoData: false };
    case "number2":
      return { text: num.toFixed(2), isNoData: false };
    case "number3":
      return { text: num.toFixed(3), isNoData: false };
    case "integer":
      return { text: `${Math.round(num)}`, isNoData: false };
    case "count":
      return { text: `${Math.round(num)}개`, isNoData: false };
    case "seconds":
      return { text: `${num.toFixed(2)}초`, isNoData: false };
    default:
      return { text: String(val), isNoData: false };
  }
}

/**
 * 3. 백분위수 색상 및 스타일 함수
 */
export function getPercentileStyle(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return {
      barGradient: "from-gray-800 to-gray-800",
      badgeBg: "bg-[#1B1E28] border-gray-700/60 text-gray-500 shadow-none",
      textClass: "text-gray-500 font-medium",
      label: "데이터 없음"
    };
  }
  if (value >= 75) {
    return {
      barGradient: "from-rose-700 via-rose-600 to-red-500",
      badgeBg: "bg-red-600 border-red-400 text-white shadow-rose-950/60 shadow-lg",
      textClass: "text-red-400 font-bold",
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

/**
 * 4. 포지션별 6개 동적 축 (Axes) 정의 & 정규화(스케일링 0~100) 규칙
 */
export interface AxisConfig {
  subject: string;
  key: string;
  maxStandard: number;
  formatRaw: (val: number | null | undefined) => string;
  calcScore: (val: number | null | undefined) => number;
}

export const POSITION_AXES: Record<PositionGroup, AxisConfig[]> = {
  catcher: [
    {
      subject: "타격 생산성 (wRC+)",
      key: "wRC+",
      maxStandard: 200,
      formatRaw: (v) => (v !== undefined && v !== null && !isNaN(v) ? `${Math.round(v)}` : "데이터 없음"),
      calcScore: (v) => (v !== undefined && v !== null && !isNaN(v) ? Math.min(100, Math.max(0, Math.round((v / 200) * 100))) : 50),
    },
    {
      subject: "장타력 (ISO)",
      key: "ISO",
      maxStandard: 0.400,
      formatRaw: (v) => (v !== undefined && v !== null && !isNaN(v) ? v.toFixed(3) : "데이터 없음"),
      calcScore: (v) => (v !== undefined && v !== null && !isNaN(v) ? Math.min(100, Math.max(0, Math.round((v / 0.400) * 100))) : 50),
    },
    {
      subject: "선구안 (BB/K)",
      key: "BB/K",
      maxStandard: 2.00,
      formatRaw: (v) => (v !== undefined && v !== null && !isNaN(v) ? v.toFixed(2) : "데이터 없음"),
      calcScore: (v) => (v !== undefined && v !== null && !isNaN(v) ? Math.min(100, Math.max(0, Math.round((v / 2.00) * 100))) : 50),
    },
    {
      subject: "도루 저지 (CS%)",
      key: "CS%",
      maxStandard: 60,
      formatRaw: (v) => {
        if (v === undefined || v === null || isNaN(v)) return "데이터 없음";
        const val = v > 1 ? v : v * 100;
        return `${val.toFixed(1)}%`;
      },
      calcScore: (v) => {
        if (v === undefined || v === null || isNaN(v)) return 0;
        const val = v > 1 ? v : v * 100;
        return Math.min(100, Math.max(0, Math.round((val / 60) * 100)));
      },
    },
    {
      subject: "블로킹 (PB/9)",
      key: "PB/9",
      maxStandard: 1.00,
      formatRaw: (v) => (v !== undefined && v !== null && !isNaN(v) ? v.toFixed(2) : "데이터 없음"),
      calcScore: (v) => {
        if (v === undefined || v === null || isNaN(v)) return 70;
        return Math.min(100, Math.max(0, Math.round((1 - Math.min(1, Math.max(0, v))) * 100)));
      },
    },
    {
      subject: "수비 이닝 (IP)",
      key: "IP",
      maxStandard: 1000,
      formatRaw: (v) => (v !== undefined && v !== null && !isNaN(v) ? `${v.toFixed(1)}이닝` : "데이터 없음"),
      calcScore: (v) => (v !== undefined && v !== null && !isNaN(v) ? Math.min(100, Math.max(0, Math.round((v / 1000) * 100))) : 75),
    },
  ],
  infield: [
    {
      subject: "타격 생산성 (wRC+)",
      key: "wRC+",
      maxStandard: 200,
      formatRaw: (v) => (v !== undefined && v !== null && !isNaN(v) ? `${Math.round(v)}` : "데이터 없음"),
      calcScore: (v) => (v !== undefined && v !== null && !isNaN(v) ? Math.min(100, Math.max(0, Math.round((v / 200) * 100))) : 50),
    },
    {
      subject: "장타력 (ISO)",
      key: "ISO",
      maxStandard: 0.400,
      formatRaw: (v) => (v !== undefined && v !== null && !isNaN(v) ? v.toFixed(3) : "데이터 없음"),
      calcScore: (v) => (v !== undefined && v !== null && !isNaN(v) ? Math.min(100, Math.max(0, Math.round((v / 0.400) * 100))) : 50),
    },
    {
      subject: "선구안 (BB/K)",
      key: "BB/K",
      maxStandard: 2.00,
      formatRaw: (v) => (v !== undefined && v !== null && !isNaN(v) ? v.toFixed(2) : "데이터 없음"),
      calcScore: (v) => (v !== undefined && v !== null && !isNaN(v) ? Math.min(100, Math.max(0, Math.round((v / 2.00) * 100))) : 50),
    },
    {
      subject: "수비 범위 (RF9)",
      key: "RF9",
      maxStandard: 6.00,
      formatRaw: (v) => (v !== undefined && v !== null && !isNaN(v) ? v.toFixed(2) : "데이터 없음"),
      calcScore: (v) => (v !== undefined && v !== null && !isNaN(v) ? Math.min(100, Math.max(0, Math.round((v / 6.00) * 100))) : 70),
    },
    {
      subject: "병살 처리 (DP)",
      key: "DP",
      maxStandard: 120,
      formatRaw: (v) => (v !== undefined && v !== null && !isNaN(v) ? `${Math.round(v)}개` : "데이터 없음"),
      calcScore: (v) => (v !== undefined && v !== null && !isNaN(v) ? Math.min(100, Math.max(0, Math.round((v / 120) * 100))) : 65),
    },
    {
      subject: "수비 이닝 (IP)",
      key: "IP",
      maxStandard: 1000,
      formatRaw: (v) => (v !== undefined && v !== null && !isNaN(v) ? `${v.toFixed(1)}이닝` : "데이터 없음"),
      calcScore: (v) => (v !== undefined && v !== null && !isNaN(v) ? Math.min(100, Math.max(0, Math.round((v / 1000) * 100))) : 75),
    },
  ],
  outfield: [
    {
      subject: "타격 생산성 (wRC+)",
      key: "wRC+",
      maxStandard: 200,
      formatRaw: (v) => (v !== undefined && v !== null && !isNaN(v) ? `${Math.round(v)}` : "데이터 없음"),
      calcScore: (v) => (v !== undefined && v !== null && !isNaN(v) ? Math.min(100, Math.max(0, Math.round((v / 200) * 100))) : 50),
    },
    {
      subject: "장타력 (ISO)",
      key: "ISO",
      maxStandard: 0.400,
      formatRaw: (v) => (v !== undefined && v !== null && !isNaN(v) ? v.toFixed(3) : "데이터 없음"),
      calcScore: (v) => (v !== undefined && v !== null && !isNaN(v) ? Math.min(100, Math.max(0, Math.round((v / 0.400) * 100))) : 50),
    },
    {
      subject: "선구안 (BB/K)",
      key: "BB/K",
      maxStandard: 2.00,
      formatRaw: (v) => (v !== undefined && v !== null && !isNaN(v) ? v.toFixed(2) : "데이터 없음"),
      calcScore: (v) => (v !== undefined && v !== null && !isNaN(v) ? Math.min(100, Math.max(0, Math.round((v / 2.00) * 100))) : 50),
    },
    {
      subject: "수비 범위 (RF9)",
      key: "RF9",
      maxStandard: 6.00,
      formatRaw: (v) => (v !== undefined && v !== null && !isNaN(v) ? v.toFixed(2) : "데이터 없음"),
      calcScore: (v) => (v !== undefined && v !== null && !isNaN(v) ? Math.min(100, Math.max(0, Math.round((v / 6.00) * 100))) : 70),
    },
    {
      subject: "외야 보살 (A)",
      key: "A",
      maxStandard: 15,
      formatRaw: (v) => (v !== undefined && v !== null && !isNaN(v) ? `${Math.round(v)}개` : "데이터 없음"),
      calcScore: (v) => (v !== undefined && v !== null && !isNaN(v) ? Math.min(100, Math.max(0, Math.round((v / 15) * 100))) : 60),
    },
    {
      subject: "수비 이닝 (IP)",
      key: "IP",
      maxStandard: 1000,
      formatRaw: (v) => (v !== undefined && v !== null && !isNaN(v) ? `${v.toFixed(1)}이닝` : "데이터 없음"),
      calcScore: (v) => (v !== undefined && v !== null && !isNaN(v) ? Math.min(100, Math.max(0, Math.round((v / 1000) * 100))) : 75),
    },
  ],
  pitcher: [
    {
      subject: "탈삼진율 (K/9)",
      key: "K/9",
      maxStandard: 12.0,
      formatRaw: (v) => (v !== undefined && v !== null && !isNaN(v) ? v.toFixed(2) : "데이터 없음"),
      calcScore: (v) => (v !== undefined && v !== null && !isNaN(v) ? Math.min(100, Math.max(0, Math.round((v / 12.0) * 100))) : 60),
    },
    {
      subject: "볼넷 억제 (BB/9)",
      key: "BB/9",
      maxStandard: 5.0,
      formatRaw: (v) => (v !== undefined && v !== null && !isNaN(v) ? v.toFixed(2) : "데이터 없음"),
      calcScore: (v) => {
        if (v === undefined || v === null || isNaN(v)) return 60;
        return Math.min(100, Math.max(0, Math.round((1 - (v - 1.0) / 4.0) * 100)));
      },
    },
    {
      subject: "평균자책점 (ERA)",
      key: "ERA",
      maxStandard: 7.0,
      formatRaw: (v) => (v !== undefined && v !== null && !isNaN(v) ? v.toFixed(2) : "데이터 없음"),
      calcScore: (v) => {
        if (v === undefined || v === null || isNaN(v)) return 55;
        return Math.min(100, Math.max(0, Math.round((1 - (v - 2.0) / 4.5) * 100)));
      },
    },
    {
      subject: "수비무관 (FIP)",
      key: "FIP",
      maxStandard: 7.0,
      formatRaw: (v) => (v !== undefined && v !== null && !isNaN(v) ? v.toFixed(2) : "데이터 없음"),
      calcScore: (v) => {
        if (v === undefined || v === null || isNaN(v)) return 55;
        return Math.min(100, Math.max(0, Math.round((1 - (v - 2.2) / 4.5) * 100)));
      },
    },
    {
      subject: "위기관리 (LOB%)",
      key: "LOB%",
      maxStandard: 100,
      formatRaw: (v) => {
        if (v === undefined || v === null || isNaN(v)) return "데이터 없음";
        const val = v > 1 ? v : v * 100;
        return `${val.toFixed(1)}%`;
      },
      calcScore: (v) => {
        if (v === undefined || v === null || isNaN(v)) return 65;
        const val = v > 1 ? v : v * 100;
        return Math.min(100, Math.max(0, Math.round(((val - 55) / 35) * 100)));
      },
    },
    {
      subject: "투구 이닝 (IP)",
      key: "IP",
      maxStandard: 180,
      formatRaw: (v) => (v !== undefined && v !== null && !isNaN(v) ? `${v.toFixed(1)}이닝` : "데이터 없음"),
      calcScore: (v) => (v !== undefined && v !== null && !isNaN(v) ? Math.min(100, Math.max(0, Math.round((v / 180) * 100))) : 65),
    },
  ]
};

export interface CompPlayerDef {
  id: string;
  name: string;
  team: string;
  positionGroup: PositionGroup;
  stats: Record<string, number>;
}

export const POSITION_COMP_PLAYERS: Record<PositionGroup, CompPlayerDef[]> = {
  catcher: [
    {
      id: "comp_kmh",
      name: "강민호",
      team: "삼성 라이온즈",
      positionGroup: "catcher",
      stats: {
        "wRC+": 128,
        ISO: 0.195,
        "BB/K": 0.92,
        "CS%": 34.8,
        "PB/9": 0.22,
        IP: 890.1,
      }
    },
    {
      id: "comp_pdw",
      name: "박동원",
      team: "LG 트윈스",
      positionGroup: "catcher",
      stats: {
        "wRC+": 132,
        ISO: 0.215,
        "BB/K": 0.88,
        "CS%": 38.5,
        "PB/9": 0.26,
        IP: 840.0,
      }
    },
    {
      id: "comp_yej",
      name: "양의지",
      team: "두산 베어스",
      positionGroup: "catcher",
      stats: {
        "wRC+": 145,
        ISO: 0.220,
        "BB/K": 1.15,
        "CS%": 31.2,
        "PB/9": 0.20,
        IP: 780.0,
      }
    },
    {
      id: "comp_ssb",
      name: "손성빈",
      team: "롯데 자이언츠",
      positionGroup: "catcher",
      stats: {
        "wRC+": 92,
        ISO: 0.135,
        "BB/K": 0.58,
        "CS%": 36.4,
        "PB/9": 0.35,
        IP: 620.0,
      }
    },
    {
      id: "comp_khj_c",
      name: "김형준",
      team: "NC 다이노스",
      positionGroup: "catcher",
      stats: {
        "wRC+": 115,
        ISO: 0.185,
        "BB/K": 0.65,
        "CS%": 37.0,
        "PB/9": 0.28,
        IP: 710.0,
      }
    },
    {
      id: "comp_jsw",
      name: "장성우",
      team: "KT 위즈",
      positionGroup: "catcher",
      stats: {
        "wRC+": 122,
        ISO: 0.170,
        "BB/K": 0.95,
        "CS%": 28.5,
        "PB/9": 0.30,
        IP: 850.0,
      }
    },
    {
      id: "comp_cjh",
      name: "최재훈",
      team: "한화 이글스",
      positionGroup: "catcher",
      stats: {
        "wRC+": 108,
        ISO: 0.110,
        "BB/K": 1.22,
        "CS%": 29.8,
        "PB/9": 0.25,
        IP: 760.0,
      }
    },
    {
      id: "comp_ejy",
      name: "이지영",
      team: "SSG 랜더스",
      positionGroup: "catcher",
      stats: {
        "wRC+": 98,
        ISO: 0.085,
        "BB/K": 0.85,
        "CS%": 33.0,
        "PB/9": 0.29,
        IP: 730.0,
      }
    }
  ],
  infield: [
    {
      id: "comp_kdy",
      name: "김도영",
      team: "KIA 타이거즈",
      positionGroup: "infield",
      stats: {
        "wRC+": 175,
        ISO: 0.315,
        "BB/K": 0.82,
        RF9: 4.85,
        DP: 95,
        IP: 960.0,
      }
    },
    {
      id: "comp_mbg",
      name: "문보경",
      team: "LG 트윈스",
      positionGroup: "infield",
      stats: {
        "wRC+": 138,
        ISO: 0.190,
        "BB/K": 0.96,
        RF9: 4.60,
        DP: 88,
        IP: 920.0,
      }
    },
    {
      id: "comp_pch",
      name: "박찬호",
      team: "KIA 타이거즈",
      positionGroup: "infield",
      stats: {
        "wRC+": 105,
        ISO: 0.095,
        "BB/K": 0.78,
        RF9: 5.30,
        DP: 104,
        IP: 980.0,
      }
    },
    {
      id: "comp_nsh",
      name: "노시환",
      team: "한화 이글스",
      positionGroup: "infield",
      stats: {
        "wRC+": 142,
        ISO: 0.245,
        "BB/K": 0.75,
        RF9: 4.45,
        DP: 82,
        IP: 940.0,
      }
    },
    {
      id: "comp_khs_if",
      name: "김혜성",
      team: "키움 히어로즈",
      positionGroup: "infield",
      stats: {
        "wRC+": 140,
        ISO: 0.160,
        "BB/K": 0.90,
        RF9: 5.15,
        DP: 98,
        IP: 950.0,
      }
    },
    {
      id: "comp_ssm",
      name: "송성문",
      team: "키움 히어로즈",
      positionGroup: "infield",
      stats: {
        "wRC+": 150,
        ISO: 0.210,
        "BB/K": 0.88,
        RF9: 4.70,
        DP: 85,
        IP: 930.0,
      }
    },
    {
      id: "comp_nsy",
      name: "나승엽",
      team: "롯데 자이언츠",
      positionGroup: "infield",
      stats: {
        "wRC+": 136,
        ISO: 0.185,
        "BB/K": 0.82,
        RF9: 4.30,
        DP: 78,
        IP: 890.0,
      }
    },
    {
      id: "comp_ojh",
      name: "오지환",
      team: "LG 트윈스",
      positionGroup: "infield",
      stats: {
        "wRC+": 118,
        ISO: 0.165,
        "BB/K": 0.85,
        RF9: 5.20,
        DP: 96,
        IP: 910.0,
      }
    },
    {
      id: "comp_cj",
      name: "최정",
      team: "SSG 랜더스",
      positionGroup: "infield",
      stats: {
        "wRC+": 155,
        ISO: 0.280,
        "BB/K": 0.95,
        RF9: 4.10,
        DP: 65,
        IP: 850.0,
      }
    }
  ],
  outfield: [
    {
      id: "comp_gjw",
      name: "구자욱",
      team: "삼성 라이온즈",
      positionGroup: "outfield",
      stats: {
        "wRC+": 168,
        ISO: 0.275,
        "BB/K": 0.98,
        RF9: 2.15,
        A: 8,
        IP: 910.0,
      }
    },
    {
      id: "comp_reyes",
      name: "빅터 레이예스",
      team: "롯데 자이언츠",
      positionGroup: "outfield",
      stats: {
        "wRC+": 152,
        ISO: 0.180,
        "BB/K": 0.72,
        RF9: 2.25,
        A: 10,
        IP: 940.0,
      }
    },
    {
      id: "comp_khs",
      name: "김현수",
      team: "LG 트윈스",
      positionGroup: "outfield",
      stats: {
        "wRC+": 130,
        ISO: 0.165,
        "BB/K": 1.10,
        RF9: 1.95,
        A: 6,
        IP: 820.0,
      }
    },
    {
      id: "comp_hcg",
      name: "홍창기",
      team: "LG 트윈스",
      positionGroup: "outfield",
      stats: {
        "wRC+": 148,
        ISO: 0.115,
        "BB/K": 1.45,
        RF9: 2.30,
        A: 9,
        IP: 950.0,
      }
    },
    {
      id: "comp_bgw",
      name: "박건우",
      team: "NC 다이노스",
      positionGroup: "outfield",
      stats: {
        "wRC+": 158,
        ISO: 0.210,
        "BB/K": 1.05,
        RF9: 2.20,
        A: 7,
        IP: 860.0,
      }
    },
    {
      id: "comp_soc",
      name: "소크라테스",
      team: "KIA 타이거즈",
      positionGroup: "outfield",
      stats: {
        "wRC+": 135,
        ISO: 0.215,
        "BB/K": 0.70,
        RF9: 2.10,
        A: 8,
        IP: 920.0,
      }
    },
    {
      id: "comp_hsb",
      name: "황성빈",
      team: "롯데 자이언츠",
      positionGroup: "outfield",
      stats: {
        "wRC+": 125,
        ISO: 0.120,
        "BB/K": 0.85,
        RF9: 2.35,
        A: 6,
        IP: 880.0,
      }
    },
    {
      id: "comp_heredia",
      name: "기예르모 에레디아",
      team: "SSG 랜더스",
      positionGroup: "outfield",
      stats: {
        "wRC+": 156,
        ISO: 0.200,
        "BB/K": 0.80,
        RF9: 2.18,
        A: 7,
        IP: 900.0,
      }
    }
  ],
  pitcher: [
    {
      id: "comp_wti",
      name: "원태인",
      team: "삼성 라이온즈",
      positionGroup: "pitcher",
      stats: {
        "K/9": 7.85,
        "BB/9": 2.15,
        ERA: 3.66,
        FIP: 3.82,
        "LOB%": 74.5,
        IP: 165.0,
      }
    },
    {
      id: "comp_gb",
      name: "곽빈",
      team: "두산 베어스",
      positionGroup: "pitcher",
      stats: {
        "K/9": 8.92,
        "BB/9": 3.45,
        ERA: 3.85,
        FIP: 3.95,
        "LOB%": 72.8,
        IP: 160.0,
      }
    },
    {
      id: "comp_yyj",
      name: "양현종",
      team: "KIA 타이거즈",
      positionGroup: "pitcher",
      stats: {
        "K/9": 7.20,
        "BB/9": 2.30,
        ERA: 3.90,
        FIP: 4.10,
        "LOB%": 71.0,
        IP: 171.1,
      }
    },
    {
      id: "comp_rhj",
      name: "류현진",
      team: "한화 이글스",
      positionGroup: "pitcher",
      stats: {
        "K/9": 8.10,
        "BB/9": 2.05,
        ERA: 3.75,
        FIP: 3.85,
        "LOB%": 73.0,
        IP: 158.0,
      }
    },
    {
      id: "comp_nail",
      name: "제임스 네일",
      team: "KIA 타이거즈",
      positionGroup: "pitcher",
      stats: {
        "K/9": 8.75,
        "BB/9": 2.20,
        ERA: 2.53,
        FIP: 2.80,
        "LOB%": 76.5,
        IP: 155.0,
      }
    },
    {
      id: "comp_lcg",
      name: "임찬규",
      team: "LG 트윈스",
      positionGroup: "pitcher",
      stats: {
        "K/9": 8.05,
        "BB/9": 2.65,
        ERA: 3.83,
        FIP: 3.92,
        "LOB%": 72.0,
        IP: 145.0,
      }
    },
    {
      id: "comp_kgh",
      name: "김광현",
      team: "SSG 랜더스",
      positionGroup: "pitcher",
      stats: {
        "K/9": 7.90,
        "BB/9": 2.85,
        ERA: 4.12,
        FIP: 4.25,
        "LOB%": 69.5,
        IP: 150.0,
      }
    },
    {
      id: "comp_gyp",
      name: "고영표",
      team: "KT 위즈",
      positionGroup: "pitcher",
      stats: {
        "K/9": 7.50,
        "BB/9": 1.45,
        ERA: 3.65,
        FIP: 3.70,
        "LOB%": 74.0,
        IP: 148.0,
      }
    }
  ]
};

/**
 * 전체 비교 가능 선수 리스트 (검색용 통합 풀)
 */
export const ALL_COMP_PLAYERS: CompPlayerDef[] = [
  ...POSITION_COMP_PLAYERS.catcher,
  ...POSITION_COMP_PLAYERS.infield,
  ...POSITION_COMP_PLAYERS.outfield,
  ...POSITION_COMP_PLAYERS.pitcher,
];

export function extractRawPlayerStatForAxis(stat: ApiPlayerStat | null | undefined, axisKey: string): number | null {
  if (!stat) return null;

  switch (axisKey) {
    case "wRC+":
      return stat["wRC+"] ?? (stat.OPS ? Math.round((stat.OPS - 0.72) * 200 + 100) : 105);
    case "ISO":
      return stat.ISO ?? (stat.OPS ? Math.max(0.05, Math.min(0.35, parseFloat((stat.OPS * 0.22).toFixed(3)))) : 0.165);
    case "BB/K":
      return stat["BB/K"] ?? (stat.WAR ? Math.max(0.4, Math.min(1.5, parseFloat((stat.WAR * 0.15 + 0.6).toFixed(2)))) : 0.78);
    case "CS%": {
      const val = stat["CS%"];
      if (val === undefined || val === null || isNaN(val)) return null;
      return val > 1 ? val : val * 100;
    }
    case "PB/9":
      return stat["PB/9"] ?? stat["BLK/9"] ?? 0.26;
    case "RF9":
      return stat.RF9 ?? stat["RF/9"] ?? (stat.WAR ? parseFloat(Math.min(5.5, stat.WAR * 0.3 + 3.8).toFixed(2)) : 4.25);
    case "DP":
      return stat.DP ?? (stat.WAR ? Math.round(stat.WAR * 12 + 65) : 78);
    case "A":
      return stat.A ?? (stat.WAR ? Math.round(stat.WAR * 1.5 + 5) : 7);
    case "K/9":
      return stat["K/9"] ?? (stat.WAR ? parseFloat((stat.WAR * 0.8 + 6.2).toFixed(2)) : 7.5);
    case "BB/9":
      return stat["BB/9"] ?? (stat.WAR ? parseFloat(Math.max(1.5, 4.0 - stat.WAR * 0.3).toFixed(2)) : 2.8);
    case "ERA":
      return stat.ERA ?? (stat.WAR ? parseFloat(Math.max(2.0, 5.2 - stat.WAR * 0.5).toFixed(2)) : 3.85);
    case "FIP":
      return stat.FIP ?? (stat.WAR ? parseFloat(Math.max(2.5, 5.0 - stat.WAR * 0.45).toFixed(2)) : 3.95);
    case "LOB%":
      return stat["LOB%"] ?? (stat.WAR ? Math.min(85, Math.round(stat.WAR * 2 + 68)) : 72);
    case "IP":
      return stat.IP ?? (stat.WAR ? Math.min(960, Math.round(stat.WAR * 120 + 450)) : 820);
    default:
      return (stat as any)[axisKey] ?? null;
  }
}

export function normalizeRawToApiStat(r: DbRawPlayerRecord | null | undefined, defaultName: string): ApiPlayerStat | null {
  if (!r || typeof r !== "object") return null;

  const rawYear = r.연도 ?? r.시즌 ?? r.year ?? r.Year ?? r.season ?? r.Season;
  let year = 2026;
  if (rawYear !== undefined && rawYear !== null && rawYear !== "") {
    const parsedYr = parseInt(String(rawYear).replace(/[^0-9]/g, ""), 10);
    if (!isNaN(parsedYr)) {
      year = parsedYr < 100 ? 2000 + parsedYr : parsedYr;
    }
  }

  const name = (r.선수명 || r.이름 || r.name || defaultName).trim();
  const cs = extractCsFromObject(r);

  const rawBlk = r["BLK/9"] ?? r["Blk/9"] ?? r["blk/9"] ?? r["PB/9"] ?? r["pb/9"] ?? r["블로킹"] ?? r["폭투포일"] ?? r["폭투/포일"];
  let blk: number | undefined;
  if (rawBlk !== undefined && rawBlk !== null && rawBlk !== "" && rawBlk !== "-") {
    const n = typeof rawBlk === "number" ? rawBlk : parseFloat(String(rawBlk).trim());
    if (!isNaN(n)) blk = n;
  }

  const ops = extractOpsFromObject(r);

  const rawWrc = r["wRC+"] ?? r["WRC+"] ?? r["wrc+"] ?? r["wRC"] ?? r["WRC"] ?? r["조정득점창출력"] ?? r["wRC_plus"];
  let wrc: number | undefined;
  if (rawWrc !== undefined && rawWrc !== null && rawWrc !== "" && rawWrc !== "-") {
    const n = typeof rawWrc === "number" ? rawWrc : parseFloat(String(rawWrc).trim());
    if (!isNaN(n)) wrc = Math.round(n);
  }

  const war = extractWarFromObject(r);

  const rawPop = r["팝타임"] ?? r["팝 타임"] ?? r["Pop Time"] ?? r["popTime"] ?? r["Pop_Time"] ?? r["pop_time"] ?? r["POPTIME"];
  let pop: number | undefined;
  if (rawPop !== undefined && rawPop !== null && rawPop !== "" && rawPop !== "-") {
    const n = typeof rawPop === "number" ? rawPop : parseFloat(String(rawPop).trim());
    if (!isNaN(n)) pop = n;
  }

  const rawIso = r["ISO"] ?? r["iso"] ?? r["순수장타율"];
  let iso: number | undefined;
  if (rawIso !== undefined && rawIso !== null && rawIso !== "" && rawIso !== "-") {
    const n = typeof rawIso === "number" ? rawIso : parseFloat(String(rawIso).trim());
    if (!isNaN(n)) iso = n;
  }

  const rawBbk = r["BB/K"] ?? r["bb/k"] ?? r["BB_K"] ?? r["선구안"];
  let bbk: number | undefined;
  if (rawBbk !== undefined && rawBbk !== null && rawBbk !== "" && rawBbk !== "-") {
    const n = typeof rawBbk === "number" ? rawBbk : parseFloat(String(rawBbk).trim());
    if (!isNaN(n)) bbk = n;
  }

  const rawRf9 = r["RF9"] ?? r["rf9"] ?? r["RF/9"] ?? r["수비범위"];
  let rf9: number | undefined;
  if (rawRf9 !== undefined && rawRf9 !== null && rawRf9 !== "" && rawRf9 !== "-") {
    const n = typeof rawRf9 === "number" ? rawRf9 : parseFloat(String(rawRf9).trim());
    if (!isNaN(n)) rf9 = n;
  }

  const rawDp = r["DP"] ?? r["dp"] ?? r["병살"] ?? r["병살처리"];
  let dp: number | undefined;
  if (rawDp !== undefined && rawDp !== null && rawDp !== "" && rawDp !== "-") {
    const n = typeof rawDp === "number" ? rawDp : parseFloat(String(rawDp).trim());
    if (!isNaN(n)) dp = Math.round(n);
  }

  const rawA = r["A"] ?? r["a"] ?? r["보살"] ?? r["어시스트"];
  let a: number | undefined;
  if (rawA !== undefined && rawA !== null && rawA !== "" && rawA !== "-") {
    const n = typeof rawA === "number" ? rawA : parseFloat(String(rawA).trim());
    if (!isNaN(n)) a = Math.round(n);
  }

  const rawOaa = r["OAA"] ?? r["oaa"] ?? r["평균대비아웃"];
  let oaa: number | undefined;
  if (rawOaa !== undefined && rawOaa !== null && rawOaa !== "" && rawOaa !== "-") {
    const n = typeof rawOaa === "number" ? rawOaa : parseFloat(String(rawOaa).trim());
    if (!isNaN(n)) oaa = Math.round(n);
  }

  const rawDpr = r["DPR"] ?? r["dpr"];
  let dpr: number | undefined;
  if (rawDpr !== undefined && rawDpr !== null && rawDpr !== "" && rawDpr !== "-") {
    const n = typeof rawDpr === "number" ? rawDpr : parseFloat(String(rawDpr).trim());
    if (!isNaN(n)) dpr = n;
  }

  const rawArm = r["ARM"] ?? r["arm"] ?? r["외야송구"];
  let arm: number | undefined;
  if (rawArm !== undefined && rawArm !== null && rawArm !== "" && rawArm !== "-") {
    const n = typeof rawArm === "number" ? rawArm : parseFloat(String(rawArm).trim());
    if (!isNaN(n)) arm = n;
  }

  const rawEra = r["ERA"] ?? r["era"] ?? r["평균자책점"] ?? r["자책점"];
  let era: number | undefined;
  if (rawEra !== undefined && rawEra !== null && rawEra !== "" && rawEra !== "-") {
    const n = typeof rawEra === "number" ? rawEra : parseFloat(String(rawEra).trim());
    if (!isNaN(n)) era = n;
  }

  const rawFip = r["FIP"] ?? r["fip"] ?? r["수비무관평자"];
  let fip: number | undefined;
  if (rawFip !== undefined && rawFip !== null && rawFip !== "" && rawFip !== "-") {
    const n = typeof rawFip === "number" ? rawFip : parseFloat(String(rawFip).trim());
    if (!isNaN(n)) fip = n;
  }

  const rawK9 = r["K/9"] ?? r["k/9"] ?? r["탈삼진/9"] ?? r["SO/9"];
  let k9: number | undefined;
  if (rawK9 !== undefined && rawK9 !== null && rawK9 !== "" && rawK9 !== "-") {
    const n = typeof rawK9 === "number" ? rawK9 : parseFloat(String(rawK9).trim());
    if (!isNaN(n)) k9 = n;
  }

  const rawBb9 = r["BB/9"] ?? r["bb/9"] ?? r["볼넷/9"];
  let bb9: number | undefined;
  if (rawBb9 !== undefined && rawBb9 !== null && rawBb9 !== "" && rawBb9 !== "-") {
    const n = typeof rawBb9 === "number" ? rawBb9 : parseFloat(String(rawBb9).trim());
    if (!isNaN(n)) bb9 = n;
  }

  const rawLob = r["LOB%"] ?? r["lob%"] ?? r["LOB"] ?? r["잔루율"];
  let lob: number | undefined;
  if (rawLob !== undefined && rawLob !== null && rawLob !== "" && rawLob !== "-") {
    const clean = String(rawLob).replace(/%/g, "").trim();
    const n = typeof rawLob === "number" ? rawLob : parseFloat(clean);
    if (!isNaN(n)) lob = n;
  }

  const rawHr9 = r["HR/9"] ?? r["hr/9"] ?? r["피홈런/9"];
  let hr9: number | undefined;
  if (rawHr9 !== undefined && rawHr9 !== null && rawHr9 !== "" && rawHr9 !== "-") {
    const n = typeof rawHr9 === "number" ? rawHr9 : parseFloat(String(rawHr9).trim());
    if (!isNaN(n)) hr9 = n;
  }

  const rawIp = r["IP"] ?? r["ip"] ?? r["이닝"] ?? r["수비이닝"];
  let ip: number | undefined;
  if (rawIp !== undefined && rawIp !== null && rawIp !== "" && rawIp !== "-") {
    const n = typeof rawIp === "number" ? rawIp : parseFloat(String(rawIp).trim());
    if (!isNaN(n)) ip = n;
  }

  return {
    연도: year,
    선수명: name,
    "CS%": cs !== undefined && !isNaN(cs) ? cs : undefined,
    "BLK/9": blk !== undefined && !isNaN(blk) ? blk : undefined,
    "PB/9": blk !== undefined && !isNaN(blk) ? blk : undefined,
    OPS: ops !== undefined && !isNaN(ops) ? ops : undefined,
    "wRC+": wrc !== undefined && !isNaN(wrc) ? wrc : undefined,
    WAR: war !== undefined && !isNaN(war) ? war : undefined,
    "팝타임": pop !== undefined && !isNaN(pop) ? pop : undefined,
    ISO: iso,
    "BB/K": bbk,
    RF9: rf9,
    DP: dp,
    A: a,
    OAA: oaa,
    DPR: dpr,
    ARM: arm,
    ERA: era,
    FIP: fip,
    "K/9": k9,
    "BB/9": bb9,
    "LOB%": lob,
    "HR/9": hr9,
    IP: ip,
    팀: r.팀 || r.구단 || r.소속 || r.team,
    포지션: r.포지션 || r.position
  };
}

export function extractHistoryFromRawItems(items: any[], defaultName: string): {
  stat2024: ApiPlayerStat | null;
  stat2025: ApiPlayerStat | null;
  stat2026: ApiPlayerStat | null;
  resolvedTeam?: string;
  resolvedPosition?: string;
} {
  const gathered: ApiPlayerStat[] = [];
  let resolvedTeam: string | undefined;
  let resolvedPosition: string | undefined;

  items.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const name = (item.선수명 || item.이름 || item.name || defaultName).trim();
    if (item.팀 || item.구단 || item.소속 || item.team) {
      resolvedTeam = item.팀 || item.구단 || item.소속 || item.team;
    }
    if (item.포지션 || item.position) {
      resolvedPosition = item.포지션 || item.position;
    }

    if (Array.isArray(item.history)) {
      item.history.forEach((h: any) => {
        const norm = normalizeRawToApiStat({
          ...h,
          선수명: h.선수명 || h.이름 || h.name || name,
          팀: h.팀 || h.구단 || item.팀 || item.구단 || resolvedTeam,
          포지션: h.포지션 || item.포지션 || resolvedPosition,
        }, name);
        if (norm) gathered.push(norm);
      });
    }

    const normSelf = normalizeRawToApiStat(item, name);
    if (normSelf) gathered.push(normSelf);
  });

  const s2024 = gathered.find((s) => s.연도 === 2024) || null;
  const s2025 = gathered.find((s) => s.연도 === 2025) || null;
  const s2026 = gathered.find((s) => s.연도 === 2026) || null;

  return {
    stat2024: s2024,
    stat2025: s2025,
    stat2026: s2026,
    resolvedTeam,
    resolvedPosition
  };
}
