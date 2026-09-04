/**
 * 구글 스프레드시트 REST API 데이터베이스 서비스
 * Database URL (직접 하드코딩된 Apps Script Web App 엔드포인트):
 * https://script.google.com/macros/s/AKfycbzuv-TBMbIKSM0gUPrb3d99kG82BWvKTXrrdOyQhlYvWf1QKOG5dsNNC5xFM74c/exec
 */

import { Player, PlayerStat } from "../data";

// 환경변수(import.meta.env) 없이 직접 하드코딩된 구글 Apps Script Web App URL
export const GAS_DB_URL = "https://script.google.com/macros/s/AKfycbzuv-TBMbIKSM0gUPrb3d99kG82BWvKTXrrdOyQhlYvWf1QKOG5dsNNC5xFM74c/exec";

export interface DbRawPlayerRecord {
  playerId?: string | number;
  id?: string | number;
  선수명?: string;
  이름?: string;
  name?: string;
  팀?: string;
  구단?: string;
  소속?: string;
  team?: string;
  포지션?: string;
  position?: string;
  나이?: number | string;
  age?: number | string;
  연도?: number | string;
  시즌?: number | string;
  year?: number | string;
  연봉?: number | string;
  "현재 연봉"?: number | string;
  "현재연봉"?: number | string;
  salary?: number | string;
  "CS%"?: number | string;
  "BLK/9"?: number | string;
  OPS?: number | string;
  ops?: number | string;
  Ops?: number | string;
  "wRC+"?: number | string;
  WAR?: number | string;
  "핵심 스탯(WAR)"?: number | string;
  war?: number | string;
  팝타임?: number | string;
  타율?: number | string;
  AVG?: number | string;
  avg?: number | string;
  Avg?: number | string;
  홈런?: number | string;
  HR?: number | string;
  hr?: number | string;
  Hr?: number | string;
  입단연도?: number | string;
  "입단 연도"?: number | string;
  draftYear?: number | string;
  등록일수?: string | number;
  "총등록일수"?: string | number;
  serviceTime?: string | number;
  [key: string]: any;
}

export interface DbFetchResult {
  success: boolean;
  playerName: string;
  teamName?: string;
  records: DbRawPlayerRecord[];
  stat2024?: DbRawPlayerRecord | null;
  stat2025?: DbRawPlayerRecord | null;
  stat2026?: DbRawPlayerRecord | null;
  error?: string;
}

const ALL_KBO_TEAMS = [
  "LG 트윈스",
  "KT 위즈",
  "SSG 랜더스",
  "NC 다이노스",
  "두산 베어스",
  "KIA 타이거즈",
  "롯데 자이언츠",
  "삼성 라이온즈",
  "한화 이글스",
  "키움 히어로즈"
];

/**
 * 구글 시트 헤더의 보이지 않는 공백, 대소문자, 언더스코어 차이를 유연하게 매칭하여 값을 추출하는 Fuzzy Matching 헬퍼 함수
 */
export function getValue(obj: any, targetKeys: string | string[], fallback: any = undefined): any {
  if (!obj || typeof obj !== "object") return fallback;

  const targets = Array.isArray(targetKeys) ? targetKeys : [targetKeys];
  const normalizedTargets = targets.map((t) => String(t).trim().toUpperCase());
  const strippedTargets = normalizedTargets.map((t) => t.replace(/[\s_\-/]/g, ""));

  // 1. 직접 프로퍼티 키 매칭 확인 (가장 빠름)
  for (const t of targets) {
    const val = obj[t];
    if (val !== undefined && val !== null && val !== "" && val !== "-") {
      return val;
    }
  }

  // 2. 객체의 전체 키 순회 (.trim().toUpperCase() 및 공백/특수문자 제거 후 유연한 매칭)
  const keys = Object.keys(obj);
  for (const key of keys) {
    const cleanKey = key.trim().toUpperCase();
    const strippedKey = cleanKey.replace(/[\s_\-/]/g, "");

    for (let i = 0; i < normalizedTargets.length; i++) {
      if (cleanKey === normalizedTargets[i] || strippedKey === strippedTargets[i]) {
        const val = obj[key];
        if (val !== undefined && val !== null && val !== "" && val !== "-") {
          return val;
        }
      }
    }
  }

  // 3. 내부 부문별 서브 객체 (defenseRecord, batterRecord, pitcherRecord) 확인 (안전장치)
  if (obj.defenseRecord && typeof obj.defenseRecord === "object") {
    for (const t of targets) {
      const v = obj.defenseRecord[t];
      if (v !== undefined && v !== null && v !== "" && v !== "-") return v;
    }
  }

  return fallback;
}

/**
 * 도루저지율(CS%) 파서
 */
export function parsePlayerCsPercent(rawCs: any): number | undefined {
  if (rawCs === undefined || rawCs === null || rawCs === "" || rawCs === "-") return undefined;
  if (typeof rawCs === "number") {
    if (isNaN(rawCs) || rawCs < 0) return undefined;
    // 0.354 처럼 0과 1 사이 소수면 35.4%로 변환
    if (rawCs > 0 && rawCs <= 1) {
      return Number((rawCs * 100).toFixed(1));
    }
    return Number(rawCs.toFixed(1));
  }
  const clean = String(rawCs).replace(/%/g, "").trim();
  if (!clean || clean === "-") return undefined;
  const num = parseFloat(clean);
  if (isNaN(num) || num < 0) return undefined;
  if (num > 0 && num <= 1) {
    return Number((num * 100).toFixed(1));
  }
  return Number(num.toFixed(1));
}

/**
 * 임의의 객체에서 CS% (도루저지율) 값을 다양한 키 이름에서 추출 (공백 및 대소문자 무관 Fuzzy matching)
 */
export function extractCsFromObject(obj: any): number | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const val = getValue(obj, [
    "CS%",
    "도루저지율",
    "도루 저지율",
    "도루저지",
    "도루 저지",
    "CS",
    "cs%",
    "cs",
    "cs_percent",
    "csPercent",
    "CS_PCT",
    "도루저지(CS%)",
    "도루저지율(CS%)",
    "도루저지율(%)",
    "CS Rate",
    "csRate",
    "CS_pct",
    "cs_pct",
    "csPercentage"
  ]);
  return parsePlayerCsPercent(val);
}

/**
 * 타율(AVG) 파서
 */
export function parsePlayerAvg(rawAvg: any): number | undefined {
  if (rawAvg === undefined || rawAvg === null || rawAvg === "") return undefined;
  const num = typeof rawAvg === "number" ? rawAvg : parseFloat(String(rawAvg).replace(/[^0-9.-]/g, ""));
  if (isNaN(num) || num < 0) return undefined;
  // 타율이 3자리 정수 형태인 경우 (예: 312 -> 0.312)
  if (num > 1 && num < 1000) {
    return Number((num / 1000).toFixed(3));
  }
  return Number(num.toFixed(3));
}

/**
 * OPS 파서
 */
export function parsePlayerOps(rawOps: any): number | undefined {
  if (rawOps === undefined || rawOps === null || rawOps === "") return undefined;
  const num = typeof rawOps === "number" ? rawOps : parseFloat(String(rawOps).replace(/[^0-9.-]/g, ""));
  if (isNaN(num) || num < 0) return undefined;
  // OPS가 3~4자리 정수 형태인 경우 (예: 875 -> 0.875)
  if (num > 10 && num < 2000) {
    return Number((num / 1000).toFixed(3));
  }
  return Number(num.toFixed(3));
}

/**
 * 홈런(HR) 파서
 */
export function parsePlayerHr(rawHr: any): number | undefined {
  if (rawHr === undefined || rawHr === null || rawHr === "") return undefined;
  const num = typeof rawHr === "number" ? rawHr : parseInt(String(rawHr).replace(/[^0-9-]/g, ""), 10);
  if (isNaN(num) || num < 0) return undefined;
  return num;
}

/**
 * WAR 파서 (해당되는 값이 없으면 0 반환)
 */
export function parsePlayerWar(rawWar: any): number {
  if (rawWar === undefined || rawWar === null || rawWar === "") return 0;
  const num = typeof rawWar === "number" ? rawWar : parseFloat(String(rawWar).replace(/[^0-9.-]/g, ""));
  if (isNaN(num)) return 0;
  return Number(num.toFixed(2));
}

/**
 * 임의의 객체에서 타율/AVG 값을 대소문자 무관하게 추출
 */
export function extractAvgFromObject(obj: any): number | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const val = obj.AVG ?? obj.avg ?? obj.Avg ?? obj.타율 ?? obj["타율"] ?? obj["AVG (타율)"] ?? obj.BA ?? obj.ba;
  return parsePlayerAvg(val);
}

/**
 * 임의의 객체에서 홈런/HR 값을 대소문자 무관하게 추출
 */
export function extractHrFromObject(obj: any): number | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const val = obj.HR ?? obj.hr ?? obj.Hr ?? obj.홈런 ?? obj["홈런"] ?? obj["HR (홈런)"] ?? obj.HomeRun ?? obj.homeruns;
  return parsePlayerHr(val);
}

/**
 * 임의의 객체에서 OPS 값을 대소문자 무관하게 추출
 */
export function extractOpsFromObject(obj: any): number | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const val = obj.OPS ?? obj.ops ?? obj.Ops ?? obj["OPS"] ?? obj["출루율+장타율"];
  return parsePlayerOps(val);
}

/**
 * 임의의 객체에서 WAR 값을 대소문자 무관하게 추출
 */
export function extractWarFromObject(obj: any): number {
  if (!obj || typeof obj !== "object") return 0;
  const val = obj.WAR ?? obj.war ?? obj.War ?? obj["핵심 스탯(WAR)"] ?? obj["WAR"] ?? obj["기여도"];
  return parsePlayerWar(val);
}

/**
 * 평균자책점 (ERA) 파서
 */
export function parsePlayerEra(rawEra: any): number | undefined {
  if (rawEra === undefined || rawEra === null || rawEra === "" || rawEra === "-") return undefined;
  const num = typeof rawEra === "number" ? rawEra : parseFloat(String(rawEra).replace(/[^0-9.-]/g, ""));
  if (isNaN(num) || num < 0) return undefined;
  return Number(num.toFixed(2));
}

/**
 * WHIP 파서
 */
export function parsePlayerWhip(rawWhip: any): number | undefined {
  if (rawWhip === undefined || rawWhip === null || rawWhip === "" || rawWhip === "-") return undefined;
  const num = typeof rawWhip === "number" ? rawWhip : parseFloat(String(rawWhip).replace(/[^0-9.-]/g, ""));
  if (isNaN(num) || num < 0) return undefined;
  return Number(num.toFixed(2));
}

/**
 * 승/홀/세 파서
 */
export function parsePlayerWls(rawWls: any): string | undefined {
  if (rawWls === undefined || rawWls === null || rawWls === "" || rawWls === "-") return undefined;
  if (typeof rawWls === "string") return rawWls.trim();
  return String(rawWls);
}

/**
 * 임의의 객체에서 ERA 값 추출
 */
export function extractEraFromObject(obj: any): number | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const val = getValue(obj, ["ERA", "era", "평균자책점", "평균자책", "평자", "자책점"]);
  return parsePlayerEra(val);
}

/**
 * 임의의 객체에서 WHIP 값 추출
 */
export function extractWhipFromObject(obj: any): number | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const val = getValue(obj, ["WHIP", "whip", "Whip", "이닝당출루허용률"]);
  return parsePlayerWhip(val);
}

/**
 * 임의의 객체에서 승/홀/세 값 추출
 */
export function extractWlsFromObject(obj: any): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const directVal = getValue(obj, [
    "승/홀/세",
    "승/패/세",
    "승패세",
    "승홀세",
    "wls",
    "WLS",
    "기록",
    "성적",
    "W-L-S",
    "W-H-S"
  ]);
  if (directVal) return String(directVal).trim();

  // 개별 키 조합 시도
  const w = getValue(obj, ["승", "승리", "W", "wins", "win"]);
  const l = getValue(obj, ["패", "패전", "L", "losses", "loss"]);
  const h = getValue(obj, ["홀드", "홀", "H", "holds", "hold"]);
  const s = getValue(obj, ["세이브", "세", "S", "saves", "save"]);

  const parts: string[] = [];
  if (w !== undefined && w !== null && w !== "" && w !== "-") parts.push(`${w}승`);
  if (l !== undefined && l !== null && l !== "" && l !== "-") parts.push(`${l}패`);
  if (h !== undefined && h !== null && h !== "" && h !== "-") parts.push(`${h}홀`);
  if (s !== undefined && s !== null && s !== "" && s !== "-") parts.push(`${s}세`);

  if (parts.length > 0) return parts.join(" ");
  return undefined;
}

/**
 * API 응답 JSON으로부터 선수의 기록 및 history 배열을 추출하여 단일 레코드 목록으로 정규화
 */
function extractRecordsFromResponse(j: any, trimmedName: string, targetTeam?: string): {
  records: DbRawPlayerRecord[];
  resolvedTeam?: string;
  resolvedPosition?: string;
} {
  const records: DbRawPlayerRecord[] = [];
  let resolvedTeam: string | undefined = targetTeam;
  let resolvedPosition: string | undefined;

  const processItem = (item: any) => {
    if (!item || typeof item !== "object") return;
    const name = (item.선수명 || item.이름 || item.name || "").trim();
    
    // 이름 비교 (이름이 없는 객체면 통과, 있으면 일치 여부 확인)
    if (name && trimmedName && !name.includes(trimmedName) && !trimmedName.includes(name)) {
      return;
    }

    if (item.팀 || item.구단 || item.소속 || item.team) {
      resolvedTeam = item.팀 || item.구단 || item.소속 || item.team;
    }
    if (item.포지션 || item.position) {
      resolvedPosition = item.포지션 || item.position;
    }

    // 1. 객체 내부에 `history` 배열이 존재하는 경우 순회하여 연도별 기록 추출
    if (Array.isArray(item.history)) {
      item.history.forEach((h: any) => {
        if (h && typeof h === "object") {
          records.push({
            ...h,
            선수명: h.선수명 || h.이름 || h.name || name || trimmedName,
            팀: h.팀 || h.구단 || h.team || resolvedTeam,
            포지션: h.포지션 || h.position || resolvedPosition,
            "CS%": (h["CS%"] !== undefined && h["CS%"] !== null && h["CS%"] !== "") ? h["CS%"] : (extractCsFromObject(h) ?? extractCsFromObject(item)),
            OPS: (h["OPS"] !== undefined && h["OPS"] !== null && h["OPS"] !== "") ? h["OPS"] : (extractOpsFromObject(h) ?? extractOpsFromObject(item)),
            WAR: (h["WAR"] !== undefined && h["WAR"] !== null && h["WAR"] !== "") ? h["WAR"] : (extractWarFromObject(h) ?? extractWarFromObject(item)),
          });
        }
      });
    }

    // 2. 객체 자체에 연도 또는 스탯 정보가 포함된 경우 레코드로 추가
    const hasYear = item.연도 !== undefined || item.시즌 !== undefined || item.year !== undefined || item.Year !== undefined;
    const hasStat = item["CS%"] !== undefined || item["도루저지율"] !== undefined || item.OPS !== undefined || item.WAR !== undefined || item.타율 !== undefined;

    if (hasYear || hasStat) {
      records.push({
        ...item,
        선수명: name || trimmedName,
        팀: resolvedTeam,
        포지션: resolvedPosition,
        "CS%": (item["CS%"] !== undefined && item["CS%"] !== null && item["CS%"] !== "") ? item["CS%"] : extractCsFromObject(item),
        OPS: (item["OPS"] !== undefined && item["OPS"] !== null && item["OPS"] !== "") ? item["OPS"] : extractOpsFromObject(item),
        WAR: (item["WAR"] !== undefined && item["WAR"] !== null && item["WAR"] !== "") ? item["WAR"] : extractWarFromObject(item),
      });
    }
  };

  if (Array.isArray(j?.data)) {
    j.data.forEach(processItem);
  } else if (j?.data && typeof j.data === "object") {
    processItem(j.data);
  } else if (Array.isArray(j)) {
    j.forEach(processItem);
  } else if (j && typeof j === "object") {
    // 만약 루트에 history가 있는 경우
    if (Array.isArray(j.history)) {
      j.history.forEach((h: any) => {
        if (h && typeof h === "object") {
          records.push({
            ...h,
            선수명: h.선수명 || h.이름 || h.name || j.선수명 || j.이름 || j.name || trimmedName,
            팀: h.팀 || h.구단 || j.팀 || j.구단 || targetTeam,
            포지션: h.포지션 || j.포지션 || resolvedPosition,
            "CS%": (h["CS%"] !== undefined && h["CS%"] !== null && h["CS%"] !== "") ? h["CS%"] : (extractCsFromObject(h) ?? extractCsFromObject(j)),
            OPS: (h["OPS"] !== undefined && h["OPS"] !== null && h["OPS"] !== "") ? h["OPS"] : (extractOpsFromObject(h) ?? extractOpsFromObject(j)),
            WAR: (h["WAR"] !== undefined && h["WAR"] !== null && h["WAR"] !== "") ? h["WAR"] : (extractWarFromObject(h) ?? extractWarFromObject(j)),
          });
        }
      });
    }
    processItem(j);
  }

  return { records, resolvedTeam, resolvedPosition };
}

/**
 * 특정 연도의 여러 부문 레코드(타자, 수비, 주루, 투수 등)를 하나의 완전한 단일 레코드로 안전하게 병합
 */
export function mergeRawRecordsForYear(records: DbRawPlayerRecord[], year: number, name: string): DbRawPlayerRecord | null {
  const matchRecs = records.filter((r) => {
    const yRaw = getValue(r, ["연도", "시즌", "year", "Year", "season"]);
    const y = typeof yRaw === "number" ? yRaw : parseInt(String(yRaw).replace(/[^0-9]/g, ""), 10);
    return y === year;
  });

  if (matchRecs.length === 0) return null;

  const merged: DbRawPlayerRecord = {
    선수명: name,
    연도: year
  };

  matchRecs.forEach((r) => {
    const category = String(getValue(r, ["부문", "구분", "category", "type"]) || "").trim();

    // 3. 투수 IP vs 수비 IP 충돌 예외 처리
    if (category.includes("수비")) {
      merged.defenseRecord = r;
      const defIp = getValue(r, ["IP", "수비이닝", "수비 이닝", "이닝"]);
      if (defIp !== undefined && defIp !== null && defIp !== "" && defIp !== "-") {
        merged.DEF_IP = defIp;
        merged.IP = defIp; // 수비수/포수 기본 이닝
      }
      const cs = extractCsFromObject(r);
      if (cs !== undefined) {
        merged["CS%"] = cs;
      }
      const pb = getValue(r, ["PB/9", "Pass/9", "PASS/9", "BLK/9", "PB", "폭투포일"]);
      if (pb !== undefined && pb !== null && pb !== "" && pb !== "-") {
        merged["Pass/9"] = pb;
        merged["PB/9"] = pb;
      }
    } else if (category.includes("타자") || category.includes("타격")) {
      merged.batterRecord = r;
    } else if (category.includes("투수")) {
      merged.pitcherRecord = r;
      const pitIp = getValue(r, ["IP", "투수이닝", "투수 이닝", "이닝"]);
      if (pitIp !== undefined && pitIp !== null && pitIp !== "" && pitIp !== "-") {
        merged.PIT_IP = pitIp;
        if (!merged.DEF_IP) merged.IP = pitIp;
      }
    }

    // 모든 키를 순회하여 병합 (빈 값이 아닌 경우 보존)
    Object.keys(r).forEach((k) => {
      const v = r[k];
      if (v !== undefined && v !== null && v !== "" && v !== "-") {
        if (merged[k] === undefined || merged[k] === null || merged[k] === "" || merged[k] === "-") {
          merged[k] = v;
        } else if (category.includes("수비") && (k === "CS%" || k === "IP" || k === "PB" || k === "POS" || k === "PB/9" || k === "Pass/9")) {
          merged[k] = v;
        }
      }
    });
  });

  return merged;
}

/**
 * 선수의 이름 및 소속 구단을 기준으로 구글 스프레드시트 DB (Stat_Master_DB 및 구단 로스터 시트)에서 성적 및 프로필 조회
 */
export async function fetchPlayerFromDatabase(playerName: string, teamName?: string): Promise<DbFetchResult> {
  const trimmedName = playerName.trim();
  const targetTeam = teamName ? teamName.trim() : "";

  if (!trimmedName) {
    return {
      success: false,
      playerName: "",
      records: [],
      error: "선수 이름을 입력해주세요."
    };
  }

  // 1. 기본 API 호출 (이름 name 및 사용자가 선택한 소속 구단 team 파라미터 1순위 전송 + 타임스탬프 &t=)
  // 환경 변수 없이 직접 배포된 구글 Apps Script Web App URL 하드코딩 적용
  const GAS_URL = "https://script.google.com/macros/s/AKfycbzuv-TBMbIKSM0gUPrb3d99kG82BWvKTXrrdOyQhlYvWf1QKOG5dsNNC5xFM74c/exec";
  const timestamp = new Date().getTime();
  const candidateUrls = [
    // 소속 구단(team)이 선택되어 있다면 name과 team을 1순위로 함께 전송
    ...(targetTeam ? [`https://script.google.com/macros/s/AKfycbzuv-TBMbIKSM0gUPrb3d99kG82BWvKTXrrdOyQhlYvWf1QKOG5dsNNC5xFM74c/exec?name=${encodeURIComponent(trimmedName)}&team=${encodeURIComponent(targetTeam)}&t=${timestamp}`] : []),
    `https://script.google.com/macros/s/AKfycbzuv-TBMbIKSM0gUPrb3d99kG82BWvKTXrrdOyQhlYvWf1QKOG5dsNNC5xFM74c/exec?name=${encodeURIComponent(trimmedName)}&t=${timestamp}`,
    `https://script.google.com/macros/s/AKfycbzuv-TBMbIKSM0gUPrb3d99kG82BWvKTXrrdOyQhlYvWf1QKOG5dsNNC5xFM74c/exec?name=${encodeURIComponent(trimmedName)}&sheet=Stat_Master_DB&t=${timestamp}`,
    `https://script.google.com/macros/s/AKfycbzuv-TBMbIKSM0gUPrb3d99kG82BWvKTXrrdOyQhlYvWf1QKOG5dsNNC5xFM74c/exec?name=${encodeURIComponent(trimmedName)}&sheetName=Stat_Master_DB&t=${timestamp}`,
    `https://script.google.com/macros/s/AKfycbzuv-TBMbIKSM0gUPrb3d99kG82BWvKTXrrdOyQhlYvWf1QKOG5dsNNC5xFM74c/exec?team=Stat_Master_DB&name=${encodeURIComponent(trimmedName)}&t=${timestamp}`,
  ];

  let rawList: DbRawPlayerRecord[] = [];
  let foundTeamName = targetTeam;

  for (const url of candidateUrls) {
    try {
      console.log(`🌐 DB fetch 시도: ${url}`);
      const res = await fetch(url);
      if (res.ok) {
        const j = await res.json();
        const extracted = extractRecordsFromResponse(j, trimmedName, targetTeam);
        if (extracted.records.length > 0) {
          rawList = extracted.records;
          if (extracted.resolvedTeam) foundTeamName = extracted.resolvedTeam;
          break;
        }
      }
    } catch (e) {
      console.warn(`URL fetch 실패: ${url}`, e);
    }
  }

  // 만약 못 찾았으면 모든 KBO 구단별 파라미터로도 검색
  if (rawList.length === 0) {
    const teamsToSearch: string[] = targetTeam
      ? [targetTeam, ...ALL_KBO_TEAMS.filter((t) => t !== targetTeam)]
      : ALL_KBO_TEAMS;

    const searchPromises = teamsToSearch.map(async (t) => {
      try {
        const teamTimestamp = new Date().getTime();
        const res = await fetch(`https://script.google.com/macros/s/AKfycbzuv-TBMbIKSM0gUPrb3d99kG82BWvKTXrrdOyQhlYvWf1QKOG5dsNNC5xFM74c/exec?name=${encodeURIComponent(trimmedName)}&team=${encodeURIComponent(t)}&t=${teamTimestamp}`);
        if (!res.ok) return null;
        const j = await res.json();
        const extracted = extractRecordsFromResponse(j, trimmedName, t);
        if (extracted.records.length > 0) {
          return { team: extracted.resolvedTeam || t, list: extracted.records };
        }
        return null;
      } catch {
        return null;
      }
    });

    const results = await Promise.all(searchPromises);
    const found = results.find((r) => r !== null && r.list.length > 0);
    if (found) {
      rawList = found.list;
      foundTeamName = found.team;
    }
  }

  // 응답된 rawList에서 해당 선수와 일치하는 레코드 필터링
  const matchedRecords = rawList.filter((r) => {
    const rName = (r.선수명 || r.이름 || r.name || "").trim();
    if (!rName) return true;
    return rName === trimmedName || rName.includes(trimmedName) || trimmedName.includes(rName);
  });

  const finalRecords = matchedRecords.length > 0 ? matchedRecords : rawList;

  if (finalRecords.length > 0) {
    const d2024 = mergeRawRecordsForYear(finalRecords, 2024, trimmedName);
    const d2025 = mergeRawRecordsForYear(finalRecords, 2025, trimmedName);
    const d2026 = mergeRawRecordsForYear(finalRecords, 2026, trimmedName);

    const firstRec = finalRecords[0];
    const resolvedTeam = firstRec.팀 || firstRec.구단 || firstRec.소속 || firstRec.team || foundTeamName || "롯데 자이언츠";

    return {
      success: true,
      playerName: trimmedName,
      teamName: resolvedTeam,
      records: finalRecords,
      stat2024: d2024,
      stat2025: d2025,
      stat2026: d2026
    };
  }

  return {
    success: false,
    playerName: trimmedName,
    records: [],
    error: "DB에서 해당 선수를 찾을 수 없습니다."
  };
}

/**
 * DB 결과 레코드를 애플리케이션의 Player 모델 형태로 변환/병합
 */
export function convertDbToPlayer(
  dbResult: DbFetchResult,
  fallbackBase?: Partial<Player>
): Player | null {
  if (!dbResult.success || dbResult.records.length === 0) {
    return null;
  }

  const latestRecord = dbResult.stat2026 || dbResult.stat2025 || dbResult.stat2024 || dbResult.records[0];

  const name = latestRecord.선수명 || latestRecord.이름 || latestRecord.name || dbResult.playerName || fallbackBase?.name || "선수";
  const team = latestRecord.팀 || latestRecord.구단 || latestRecord.소속 || dbResult.teamName || fallbackBase?.team || "롯데 자이언츠";
  const position = cleanPosition(latestRecord.포지션 || fallbackBase?.position || "내야수");
  const age = parsePlayerAge(latestRecord.나이 ?? latestRecord.age ?? fallbackBase?.age);
  const draftInfo = parseDraftYear(latestRecord["입단 연도"] ?? latestRecord["입단연도"] ?? latestRecord.입단연도 ?? fallbackBase?.draftYear);
  const serviceTime = parseServiceTime(latestRecord["등록일수"] !== undefined ? latestRecord["등록일수"] : (latestRecord.등록일수 ?? fallbackBase?.serviceTime));
  const salaryCurrent = parsePlayerSalary(latestRecord["현재 연봉"] !== undefined ? latestRecord["현재 연봉"] : (latestRecord["현재연봉"] ?? latestRecord.연봉 ?? fallbackBase?.salaryCurrent));
  
  const latestAvg = parsePlayerAvg(latestRecord.타율 ?? latestRecord.AVG ?? latestRecord.avg ?? latestRecord.Avg) ?? 0;
  const latestOps = parsePlayerOps(latestRecord.OPS ?? latestRecord.ops ?? latestRecord.Ops) ?? 0;
  const latestHr = parsePlayerHr(latestRecord.홈런 ?? latestRecord.HR ?? latestRecord.hr ?? latestRecord.Hr) ?? 0;
  const latestWar = parsePlayerWar(latestRecord["핵심 스탯(WAR)"] !== undefined ? latestRecord["핵심 스탯(WAR)"] : (latestRecord.WAR !== undefined ? latestRecord.WAR : latestRecord.war));

  // 3개년 스탯 조립 (해당 연도 값이 없으면 0 반환)
  const stats: PlayerStat[] = [];
  
  [2024, 2025, 2026].forEach((year) => {
    const raw = (year === 2024 ? dbResult.stat2024 : year === 2025 ? dbResult.stat2025 : dbResult.stat2026);
    if (raw) {
      const yAvg = parsePlayerAvg(raw.타율 ?? raw.AVG ?? raw.avg ?? raw.Avg) ?? 0;
      const yOps = parsePlayerOps(raw.OPS ?? raw.ops ?? raw.Ops) ?? 0;
      const yHr = parsePlayerHr(raw.홈런 ?? raw.HR ?? raw.hr ?? raw.Hr) ?? 0;
      const yWar = parsePlayerWar(raw["핵심 스탯(WAR)"] !== undefined ? raw["핵심 스탯(WAR)"] : (raw.WAR !== undefined ? raw.WAR : raw.war));
      const ySalary = parsePlayerSalary(raw["현재 연봉"] ?? raw["현재연봉"] ?? raw.연봉 ?? raw.salary);
      const yEra = extractEraFromObject(raw);
      const yWhip = extractWhipFromObject(raw);
      const yWls = extractWlsFromObject(raw);

      stats.push({
        year,
        avg: yAvg,
        ops: yOps,
        war: yWar,
        hr: yHr,
        era: yEra,
        whip: yWhip,
        wls: yWls,
        salary: ySalary
      });
    } else {
      const existing = fallbackBase?.stats?.find((s) => s.year === year);
      if (existing) {
        stats.push(existing);
      } else {
        stats.push({
          year,
          avg: 0,
          ops: 0,
          war: 0,
          hr: 0,
          salary: 0
        });
      }
    }
  });

  return {
    id: fallbackBase?.id || `db_player_${Date.now()}`,
    name,
    team,
    position,
    age,
    salaryCurrent,
    draftYear: draftInfo.draftYear,
    serviceTime,
    contractPeriod: fallbackBase?.contractPeriod || "25년 01월 01일 ~ 27년 12월 31일",
    agent: fallbackBase?.agent || latestRecord["에이전트"] || latestRecord["담당 에이전트"] || "미정",
    stats: stats.length > 0 ? stats : (fallbackBase?.stats || [])
  };
}

export interface DbTeamPlayer {
  id?: string;
  playerId?: string | number;
  name: string;
  age: number | string;
  position: string;
  war: number;
  salary: number;
  draftYear: number | string;
  draftYearDisplay?: string;
  serviceTime: string;
  team: string;
  hitterStats?: any;
  pitcherStats?: any;
}

export interface DbTeamRosterResult {
  success: boolean;
  teamName: string;
  players: DbTeamPlayer[];
  error?: string;
}

/**
 * 나이 필드 파서 (생년월일 YYYY-MM-DD 또는 숫자 나이 대응, 없으면 0 반환)
 */
export function parsePlayerAge(rawAge: any): number {
  if (typeof rawAge === "number" && !isNaN(rawAge)) return rawAge;
  if (!rawAge) return 0;
  const str = String(rawAge).trim();
  // 생년월일 형식인 경우 (예: "2001-05-09..." 또는 "2001-05-09")
  const dateMatch = str.match(/^(\d{4})/);
  if (dateMatch) {
    const birthYear = parseInt(dateMatch[1], 10);
    const currentYear = new Date().getFullYear();
    const calculatedAge = currentYear - birthYear;
    return calculatedAge > 0 && calculatedAge < 80 ? calculatedAge : 0;
  }
  const num = parseInt(str, 10);
  return isNaN(num) ? 0 : num;
}

/**
 * 연봉 필드 파서 (해당되는 값이 없으면 0 반환)
 * 데이터베이스에는 연봉이 만원 단위 숫자(예: 9500 -> 9,500만원, 40000 -> 4억원, 100000 -> 10억원, 220000 -> 22억원)로 저장되어 있습니다.
 */
export function parsePlayerSalary(rawSalary: any): number {
  if (rawSalary === undefined || rawSalary === null || rawSalary === "") return 0;
  const num = typeof rawSalary === "number" ? rawSalary : parseFloat(String(rawSalary).replace(/[^0-9.-]/g, ""));
  if (isNaN(num) || num <= 0) return 0;
  // 1억 미만의 숫자는 만원 단위(예: 3000 -> 3천만원, 9500 -> 9,500만원, 40000 -> 4억원, 100000 -> 10억원, 220000 -> 22억원, 300000 -> 30억원)로 판단하여 10,000을 곱함
  if (num < 100000000) {
    return num * 10000;
  }
  return num;
}

/**
 * 포지션 정제 파서 (우투좌타 등 투타 정보를 제외하고 순수 포지션명만 추출)
 */
export function cleanPosition(rawPos: any): string {
  if (!rawPos) return "";
  let str = String(rawPos).trim();
  
  // 1. 괄호 안의 투타 정보 제거: (우투우타), (우투좌타), (좌투좌타), (우언우타), (우언좌타), (우사좌타), (우투양타) 등
  str = str.replace(/\([^\)]*(?:투|타|언|사|hand|bat|throw)[^\)]*\)/gi, '');
  str = str.replace(/\[[^\]]*(?:투|타|언|사|hand|bat|throw)[^\]]*\]/gi, '');
  
  // 2. 괄호 없는 투타 단어 제거: 우투우타, 우투좌타, 좌투좌타, 우투양타, 좌투우타, 좌투양타, 우언우타, 우언좌타, 우사우타, 우사좌타, 우투, 좌투, 우타, 좌타, 양타 등
  str = str.replace(/(?:우투우타|우투좌타|우투양타|좌투좌타|좌투우타|좌투양타|우언우타|우언좌타|우사우타|우사좌타)/g, '');
  str = str.replace(/\b(?:우투|좌투|우타|좌타|양타|우언|좌언|우사|좌사)\b/g, '');
  
  // 3. 특수문자 및 공백 정리
  str = str.replace(/[\/\-_,·]/g, ' ').replace(/\s+/g, ' ').trim();
  
  // 4. 주요 포지션 키워드 우선 매칭
  if (str.includes('투수')) return '투수';
  if (str.includes('포수')) return '포수';
  if (str.includes('1루수')) return '1루수';
  if (str.includes('2루수')) return '2루수';
  if (str.includes('3루수')) return '3루수';
  if (str.includes('유격수')) return '유격수';
  if (str.includes('좌익수')) return '좌익수';
  if (str.includes('중견수')) return '중견수';
  if (str.includes('우익수')) return '우익수';
  if (str.includes('내야수') || str.includes('내야')) return '내야수';
  if (str.includes('외야수') || str.includes('외야')) return '외야수';
  if (str.includes('지명타자')) return '지명타자';
  
  return str || '';
}

/**
 * 입단 연도 파서 (예: "22SSG", "2022", 2022, 없으면 0 반환)
 */
export function parseDraftYear(rawDraft: any): { draftYear: number; display: string } {
  if (!rawDraft) return { draftYear: 0, display: "0" };
  const str = String(rawDraft).trim();
  
  // 4자리 연도
  const y4Match = str.match(/\b(19\d{2}|20\d{2})\b/);
  if (y4Match) {
    const year = parseInt(y4Match[1], 10);
    return { draftYear: year, display: `${year}년` };
  }

  // "22SSG" 또는 "22년" 같은 2자리 연도 접두사
  const y2Match = str.match(/^(\d{2})/);
  if (y2Match) {
    const y2 = parseInt(y2Match[1], 10);
    const fullYear = y2 >= 70 ? 1900 + y2 : 2000 + y2;
    return { draftYear: fullYear, display: str.includes("년") ? str : `${str}` };
  }

  const parsed = parseInt(str, 10);
  if (!isNaN(parsed) && parsed > 1950 && parsed < 2050) {
    return { draftYear: parsed, display: `${parsed}년` };
  }

  return { draftYear: 0, display: str || "0" };
}

/**
 * 등록일수 파서 (예: 367 -> "2년 77일", 없으면 "0일" 반환)
 */
export function parseServiceTime(rawService: any): string {
  if (!rawService || rawService === "0" || rawService === 0) return "0일";
  if (typeof rawService === "number" || /^\d+$/.test(String(rawService).trim())) {
    const days = typeof rawService === "number" ? rawService : parseInt(String(rawService).trim(), 10);
    if (days >= 145) {
      const years = Math.floor(days / 145);
      const remainDays = days % 145;
      return `${years}년 ${remainDays}일`;
    }
    return `${days}일`;
  }
  return String(rawService);
}

/**
 * 구단명을 기준으로 구글 스프레드시트 5개 시트 JOIN DB에서 해당 구단 소속 선수 전체 로스터 조회
 */
export async function fetchTeamRosterFromDatabase(teamName: string): Promise<DbTeamRosterResult> {
  const trimmed = (teamName || "").trim();
  if (!trimmed) {
    return {
      success: false,
      teamName: "",
      players: [],
      error: "구단명을 입력해주세요."
    };
  }

  try {
    let rawList: any[] = [];
    let fetchSucceeded = false;

    // 1. 백엔드 프록시 캐시 우선 시도 (로컬 Node/Cloud Run 환경)
    try {
      const proxyRes = await fetch(`/api/db/team-roster?team=${encodeURIComponent(trimmed)}`);
      if (proxyRes.ok) {
        const proxyJson = await proxyRes.json();
        if (proxyJson && proxyJson.success && Array.isArray(proxyJson.data) && proxyJson.data.length > 0) {
          rawList = proxyJson.data;
          fetchSucceeded = true;
        }
      }
    } catch {
      // 프록시 호출 실패 시 직접 GAS URL로 진행
    }

    // 2. 프록시 실패 또는 미지원 환경일 때 구글 Apps Script Web App 직접 호출
    if (!fetchSucceeded) {
      const timestamp = new Date().getTime();
      const shortName = trimmed.replace(/(트윈스|위즈|랜더스|다이노스|베어스|타이거즈|라이온즈|히어로즈|이글스|자이언츠)/g, "").trim();
      const candidateNames = Array.from(new Set([shortName, trimmed])).filter(Boolean);

      for (const name of candidateNames) {
        try {
          const url = `https://script.google.com/macros/s/AKfycbzuv-TBMbIKSM0gUPrb3d99kG82BWvKTXrrdOyQhlYvWf1QKOG5dsNNC5xFM74c/exec?team=${encodeURIComponent(name)}&t=${timestamp}`;
          const response = await fetch(url);
          if (response.ok) {
            const json = await response.json();
            const list = Array.isArray(json?.data) ? json.data : (Array.isArray(json) ? json : []);
            if (list.length > 0) {
              rawList = list;
              fetchSucceeded = true;
              break;
            }
          }
        } catch (e: any) {
          console.log(`[DB] '${name}' 직접 조회 시도 안내:`, e?.message);
        }
      }
    }

    if (rawList.length > 0) {
      const parsedPlayers: DbTeamPlayer[] = rawList.map((r: any, idx: number) => {
        const pId = String(r.playerId || r.id || `p_${idx}`);
        
        // 나이 파싱
        const age = parsePlayerAge(r["나이"] || r.age);
        
        // WAR 파싱
        const warRaw = r["핵심 스탯(WAR)"] !== undefined ? r["핵심 스탯(WAR)"] : (r["WAR"] !== undefined ? r["WAR"] : (r.war !== undefined ? r.war : 0));
        const war = typeof warRaw === "number" ? warRaw : (parseFloat(String(warRaw)) || 0);

        // 연봉 파싱
        const salary = parsePlayerSalary(r["현재 연봉"] !== undefined ? r["현재 연봉"] : (r["현재연봉"] !== undefined ? r["현재연봉"] : (r["연봉"] !== undefined ? r["연봉"] : r.salary)));

        // 입단 연도 파싱
        const draftInfo = parseDraftYear(r["입단 연도"] !== undefined ? r["입단 연도"] : (r["입단연도"] !== undefined ? r["입단연도"] : r.draftYear));

        // 등록일수 파싱
        const serviceTime = parseServiceTime(r["등록일수"] !== undefined ? r["등록일수"] : (r["총등록일수"] !== undefined ? r["총등록일수"] : r.serviceTime));

        // 포지션 파싱 (투타 정보 제외)
        const position = cleanPosition(r["포지션"] || r.position || "내야수");

        return {
          id: pId,
          playerId: r.playerId || pId,
          name: r["선수명"] || r["이름"] || r.name || "선수",
          age: age,
          position: position,
          war: Number(war.toFixed(2)),
          salary: salary,
          draftYear: draftInfo.draftYear,
          draftYearDisplay: draftInfo.display,
          serviceTime: serviceTime,
          team: r["구단명"] || r["구단"] || r["팀"] || r.team || trimmed,
          hitterStats: r.hitterStats || null,
          pitcherStats: r.pitcherStats || null
        };
      });

      // 연봉 정보가 없는(salary <= 0) 선수는 제외하고, 연봉 높은 순(내림차순)으로 정렬
      const validPlayers = parsedPlayers
        .filter((p) => typeof p.salary === "number" && p.salary > 0)
        .sort((a, b) => (b.salary || 0) - (a.salary || 0));

      return {
        success: true,
        teamName: trimmed,
        players: validPlayers
      };
    } else {
      return {
        success: false,
        teamName: trimmed,
        players: [],
        error: `'${trimmed}' 구단의 선수 데이터가 DB에 등록되어 있지 않습니다.`
      };
    }
  } catch (err: any) {
    console.warn("DB Team Fetch Warning:", err?.message || err);
    return {
      success: false,
      teamName: trimmed,
      players: [],
      error: `DB 연결 실패: ${err?.message || "네트워크 상태를 확인해주세요."}`
    };
  }
}

export interface DbSavePlayerPayload {
  "선수명": string;
  "구단": string;
  "포지션": string;
  "나이": number;
  "타율"?: number;
  "OPS"?: number;
  "홈런"?: number;
  "ERA"?: number;
  "WHIP"?: number;
  "승/홀/세"?: string;
  "최근 WAR": number;
  "현재 연봉": number;
  "에이전트 계약기간 관리": string;
  "에이전트"?: string;
  "담당 에이전트"?: string;
  [key: string]: any;
}

/**
 * 선수 데이터 영구 저장 처리 (구글 스프레드시트 백엔드 연동 및 로컬 보관)
 * 단일 전송 원칙을 적용하여 중복 저장 방지
 */
export async function savePlayerToDatabase(payload: DbSavePlayerPayload): Promise<{ success: boolean; remoteSaved?: boolean; data?: any; error?: string }> {
  const GAS_URL = "https://script.google.com/macros/s/AKfycbzuv-TBMbIKSM0gUPrb3d99kG82BWvKTXrrdOyQhlYvWf1QKOG5dsNNC5xFM74c/exec";
  let remoteSaved = false;

  try {
    console.log('DB 전송 데이터:', payload);

    // 단일 POST 요청 전송
    await fetch(GAS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify(payload),
      mode: "no-cors",
    });
    remoteSaved = true;

    return {
      success: true,
      remoteSaved,
    };
  } catch (error: any) {
    console.error('DB 저장 실패:', error);
    return {
      success: true,
      remoteSaved: false,
      error: error?.message,
    };
  }
}
