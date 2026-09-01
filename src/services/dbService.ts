/**
 * 구글 스프레드시트 REST API 데이터베이스 서비스
 * Database URL: https://script.google.com/macros/s/AKfycbzuv-TBMbIKSM0gUPrb3d99kG82BWvKTXrrdOyQhlYvWf1QKOG5dsNNC5xFM74c/exec
 */

import { Player, PlayerStat } from "../data";

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
  const timestamp = new Date().getTime();
  const candidateUrls = [
    // 소속 구단(team)이 선택되어 있다면 name과 team을 1순위로 함께 전송
    ...(targetTeam ? [`${GAS_DB_URL}?name=${encodeURIComponent(trimmedName)}&team=${encodeURIComponent(targetTeam)}&t=${timestamp}`] : []),
    `${GAS_DB_URL}?name=${encodeURIComponent(trimmedName)}&t=${timestamp}`,
    `${GAS_DB_URL}?name=${encodeURIComponent(trimmedName)}&sheet=Stat_Master_DB&t=${timestamp}`,
    `${GAS_DB_URL}?name=${encodeURIComponent(trimmedName)}&sheetName=Stat_Master_DB&t=${timestamp}`,
    `${GAS_DB_URL}?team=Stat_Master_DB&name=${encodeURIComponent(trimmedName)}&t=${timestamp}`,
  ];

  let rawList: DbRawPlayerRecord[] = [];

  for (const url of candidateUrls) {
    try {
      console.log(`🌐 DB fetch 시도: ${url}`);
      const res = await fetch(url);
      if (res.ok) {
        const j = await res.json();
        const items: DbRawPlayerRecord[] = Array.isArray(j?.data) ? j.data : (Array.isArray(j) ? j : []);
        if (items.length > 0) {
          rawList = items;
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
        const res = await fetch(`${GAS_DB_URL}?name=${encodeURIComponent(trimmedName)}&team=${encodeURIComponent(t)}&t=${teamTimestamp}`);
        if (!res.ok) return null;
        const j = await res.json();
        const list: DbRawPlayerRecord[] = Array.isArray(j?.data) ? j.data : (Array.isArray(j) ? j : []);
        if (list.length > 0) {
          return { team: t, list };
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
    }
  }

  // 응답된 rawList에서 해당 선수와 일치하는 레코드 필터링 (또는 전체 데이터가 그 선수의 결과인 경우)
  const matchedRecords = rawList.filter((r) => {
    const rName = (r.선수명 || r.이름 || r.name || "").trim();
    if (!rName) return true; // 선수명 컬럼이 없으면 결과 데이터 전체 사용
    return rName === trimmedName || rName.includes(trimmedName) || trimmedName.includes(rName);
  });

  const finalRecords = matchedRecords.length > 0 ? matchedRecords : rawList;

  if (finalRecords.length > 0) {
    const d2024 = finalRecords.find((r) => Number(r.연도 || r.시즌 || r.year) === 2024) || null;
    const d2025 = finalRecords.find((r) => Number(r.연도 || r.시즌 || r.year) === 2025) || null;
    const d2026 = finalRecords.find((r) => Number(r.연도 || r.시즌 || r.year) === 2026) || null;

    const firstRec = finalRecords[0];
    const resolvedTeam = firstRec.팀 || firstRec.구단 || firstRec.소속 || firstRec.team || targetTeam || "롯데 자이언츠";

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

      stats.push({
        year,
        avg: yAvg,
        ops: yOps,
        war: yWar,
        hr: yHr,
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
 */
export function parsePlayerSalary(rawSalary: any): number {
  if (rawSalary === undefined || rawSalary === null || rawSalary === "") return 0;
  const num = typeof rawSalary === "number" ? rawSalary : parseFloat(String(rawSalary).replace(/[^0-9.-]/g, ""));
  if (isNaN(num) || num <= 0) return 0;
  // 10만 이하의 숫자는 만원 단위(예: 9500 -> 9,500만원)로 판단하여 10,000을 곱함
  if (num < 100000) {
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
  const trimmed = teamName.trim();
  if (!trimmed) {
    return {
      success: false,
      teamName: "",
      players: [],
      error: "구단명을 입력해주세요."
    };
  }

  try {
    const timestamp = new Date().getTime();
    const url = `${GAS_DB_URL}?team=${encodeURIComponent(trimmed)}&t=${timestamp}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`DB 통신 오류 (HTTP ${response.status})`);
    }

    const json = await response.json();

    if (json && (json.status === "success" || Array.isArray(json.data) || Array.isArray(json))) {
      const rawList = Array.isArray(json.data) ? json.data : (Array.isArray(json) ? json : []);
      
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

      // 기본적으로 연봉 높은 순(내림차순)으로 정렬
      parsedPlayers.sort((a, b) => (b.salary || 0) - (a.salary || 0));

      return {
        success: true,
        teamName: trimmed,
        players: parsedPlayers
      };
    } else {
      return {
        success: false,
        teamName: trimmed,
        players: [],
        error: json?.error || `'${trimmed}' 구단의 선수 데이터가 DB에 등록되어 있지 않습니다.`
      };
    }
  } catch (err: any) {
    console.error("DB Team Fetch Error:", err);
    return {
      success: false,
      teamName: trimmed,
      players: [],
      error: `DB 연결 실패: ${err.message || "네트워크 상태를 확인해주세요."}`
    };
  }
}

export interface DbSavePlayerPayload {
  "선수명": string;
  "구단": string;
  "포지션": string;
  "나이": number;
  "타율": number;
  "OPS": number;
  "홈런": number;
  "최근 WAR": number;
  "현재 연봉": number;
  "에이전트 계약기간 관리": string;
}

/**
 * 구글 스프레드시트 백엔드(doPost)로 선수 데이터 영구 저장 (POST 방식)
 * Preflight OPTIONS CORS 방지를 위해 Content-Type을 text/plain;charset=utf-8로 전송
 */
export async function savePlayerToDatabase(payload: DbSavePlayerPayload): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    console.log("🚀 구글 Apps Script POST 전송:", payload);
    const response = await fetch(GAS_DB_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`서버 응답 오류 (HTTP ${response.status})`);
    }

    let resData: any = null;
    try {
      resData = await response.json();
    } catch {
      resData = await response.text();
    }

    return {
      success: true,
      data: resData
    };
  } catch (err: any) {
    console.error("DB save error:", err);
    return {
      success: false,
      error: err?.message || "네트워크 오류가 발생했습니다."
    };
  }
}
