import React, { useState, useEffect, useMemo } from "react";
import { mockPlayers, mockTeams, loadStoredPlayers, saveStoredPlayers, Player, PlayerStat, getAgentBadgeStyle, KBO_AGENCY_DB_METADATA } from "../data";
import {
  fetchPlayerFromDatabase,
  fetchTeamRosterFromDatabase,
  convertDbToPlayer,
  cleanPosition,
  parsePlayerAge,
  parsePlayerSalary,
  parseDraftYear,
  parseServiceTime,
  formatServiceTimeWithComma,
  extractEraFromObject,
  extractWhipFromObject,
  extractWlsFromObject,
  convertPlayerToAppDbPayload,
  savePlayerToDatabase,
  deletePlayerFromDatabase
} from "../services/dbService";
import {
  Users,
  DollarSign,
  Activity,
  UserPlus,
  Trash2,
  CheckCircle2,
  Database,
  Calendar,
  Clock,
  RefreshCw,
  Pencil,
  Flame,
  Sparkles,
  UserCheck
} from "lucide-react";
import { AddPlayerModal } from "./AddPlayerModal";
import { EditPlayerModal } from "./EditPlayerModal";
import { DeletePlayerModal } from "./DeletePlayerModal";

/**
 * 에이전트 계약기간 안전 추출 헬퍼 함수
 * 구글 시트의 '에이전트 계약기간', '에이전트 계약기간 관리', '계약기간' 등 모든 형태의 키를 안전하게 탐색하고 공백 제거
 */
export function extractContractPeriod(raw: any): string {
  if (!raw || typeof raw !== "object") return "-";

  // 1. 직접 키 접근
  const val =
    raw["에이전트 계약기간"] ??
    raw["에이전트 계약기간 관리"] ??
    raw["에이전트계약기간"] ??
    raw["계약기간"] ??
    raw.contractPeriod;

  if (val !== undefined && val !== null) {
    const str = String(val).trim();
    if (str !== "" && str !== "undefined" && str !== "null" && str !== "-") {
      return str;
    }
  }

  // 2. 키 앞뒤 공백 및 띄어쓰기 무시하고 전체 검색 (구글 시트 헤더 공백 오류 방어)
  for (const key of Object.keys(raw)) {
    const cleanKey = key.trim().replace(/\s+/g, "");
    if (
      cleanKey === "에이전트계약기간" ||
      cleanKey === "에이전트계약기간관리" ||
      cleanKey === "계약기간" ||
      cleanKey.toLowerCase() === "contractperiod"
    ) {
      const kVal = raw[key];
      if (kVal !== undefined && kVal !== null) {
        const str = String(kVal).trim();
        if (str !== "" && str !== "undefined" && str !== "null" && str !== "-") {
          return str;
        }
      }
    }
  }

  return "-";
}

/**
 * 담당 에이전트 이름 안전 추출 헬퍼 함수
 * '에이전트', '에이전트 ', '담당 에이전트' 등 키 공백 및 값 공백을 철저히 제거하여 '미정' 오표기 방지
 */
export function extractAgentName(raw: any): string {
  if (!raw || typeof raw !== "object") return "미정";

  // 1. 직접 키 접근
  const val =
    raw["에이전트"] ??
    raw["담당 에이전트"] ??
    raw["담당에이전트"] ??
    raw.agent ??
    raw["에이전트 "] ??
    raw[" 에이전트"] ??
    raw["담당자"];

  if (val !== undefined && val !== null) {
    const str = String(val).trim();
    if (str !== "" && str !== "undefined" && str !== "null" && str !== "미정") {
      return str;
    }
  }

  // 2. 키 앞뒤 공백 및 띄어쓰기 무시하고 전체 검색 (구글 시트 컬럼 헤더 공백 대응: 곽빈 선수 등)
  for (const key of Object.keys(raw)) {
    const cleanKey = key.trim().replace(/\s+/g, "");
    if (
      cleanKey === "에이전트" ||
      cleanKey === "담당에이전트" ||
      cleanKey.toLowerCase() === "agent"
    ) {
      const kVal = raw[key];
      if (kVal !== undefined && kVal !== null) {
        const str = String(kVal).trim();
        if (str !== "" && str !== "undefined" && str !== "null" && str !== "미정") {
          return str;
        }
      }
    }
  }

  return "미정";
}

/**
 * 원시 데이터(Raw Record)를 대시보드 Player 객체 규격으로 안전하게 변환하는 헬퍼 함수
 */
function mapRawToPlayer(raw: any, index: number): Player | null {
  if (!raw || typeof raw !== "object") return null;

  const contractPeriod = extractContractPeriod(raw);
  const agent = extractAgentName(raw);

  // 이미 완성된 Player 규격을 갖춘 경우
  if (raw.id && raw.name && raw.team && Array.isArray(raw.stats) && raw.stats.length > 0) {
    const cleanName = String(raw.name).trim();
    const cleanStats = (raw.stats as PlayerStat[]).map(st => ({
      ...st,
      war: typeof st.war === "number" ? Number(st.war.toFixed(2)) : (st.war ? Number(parseFloat(String(st.war)).toFixed(2)) : 0)
    }));
    const meta = KBO_AGENCY_DB_METADATA[cleanName];
    let dYear = parseDraftYear(raw.draftYear).draftYear;
    if (!dYear || (dYear === 2018 && cleanName !== "곽빈")) {
      dYear = meta?.draftYear || dYear || 0;
    }
    let sTime = parseServiceTime(raw.serviceTime);
    if (!sTime || sTime === "0일" || sTime === "1년 0일" || sTime === "-") {
      sTime = meta?.serviceTime || sTime || "-";
    }

    return {
      id: String(raw.id),
      name: cleanName,
      team: String(raw.team).trim(),
      position: cleanPosition(raw.position || "외야수"),
      age: parsePlayerAge(raw.age),
      salaryCurrent: parsePlayerSalary(raw.salaryCurrent),
      draftYear: dYear,
      serviceTime: sTime,
      contractPeriod,
      agent,
      stats: cleanStats
    };
  }

  const name = raw.name || raw["선수명"] || raw["이름"] || "";
  if (!name || name === "선수" || name === "선수명") return null;

  const cleanName = String(name).trim();
  const team = raw.team || raw["구단"] || raw["팀"] || raw["소속"] || raw["팀명"] || "롯데 자이언츠";
  const position = cleanPosition(raw.position || raw["포지션"] || "외야수");
  const age = parsePlayerAge(raw.age ?? raw["나이"] ?? 27);
  const salaryCurrent = parsePlayerSalary(raw.salaryCurrent ?? raw["현재 연봉"] ?? raw["현재연봉"] ?? raw["연봉"] ?? raw.salary);
  const draftInfo = parseDraftYear(raw.draftYear ?? raw["입단 연도"] ?? raw["입단연도"]);
  const rawService = raw.serviceTime ?? raw["등록일수"] ?? raw["총등록일수"] ?? "";
  const serviceTime = parseServiceTime(rawService);

  // DB 메타데이터 및 실제 파싱값 기반 정상 매핑 (하드코딩 2018년 및 1년 0일 제거)
  const meta = KBO_AGENCY_DB_METADATA[cleanName];
  let finalDraftYear = draftInfo.draftYear > 0 ? draftInfo.draftYear : (meta?.draftYear || 0);
  let finalServiceTime = (serviceTime && serviceTime !== "0일" && serviceTime !== "1년 0일" && serviceTime !== "-")
    ? serviceTime
    : (meta?.serviceTime || serviceTime || "-");

  // stats 추출
  let stats: PlayerStat[] = [];
  if (Array.isArray(raw.stats) && raw.stats.length > 0) {
    stats = raw.stats.map((st: any) => ({
      ...st,
      war: typeof st.war === "number" ? Number(st.war.toFixed(2)) : (st.war ? Number(parseFloat(String(st.war)).toFixed(2)) : 0)
    }));
  } else {
    const rawWar =
      raw["핵심 스탯(WAR)"] ??
      raw["핵심스탯(WAR)"] ??
      raw["최근 WAR"] ??
      raw["최근WAR"] ??
      raw["WAR"] ??
      raw.WAR ??
      raw.war ??
      raw.War ??
      raw["기여도"];
    let war: number = 0;
    if (rawWar !== undefined && rawWar !== null && rawWar !== "" && rawWar !== "-") {
      const parsed = typeof rawWar === "number" ? rawWar : parseFloat(String(rawWar).replace(/[^0-9.-]/g, ""));
      if (!isNaN(parsed)) {
        war = Number(parsed.toFixed(2));
      }
    }
    const rawAvg = raw["타율"] ?? raw["AVG"] ?? raw.avg ?? 0;
    const avg = typeof rawAvg === "number" ? rawAvg : (parseFloat(String(rawAvg)) || undefined);
    const rawOps = raw["OPS"] ?? raw.ops ?? 0;
    const ops = typeof rawOps === "number" ? rawOps : (parseFloat(String(rawOps)) || undefined);
    const rawHr = raw["홈런"] ?? raw["HR"] ?? raw.hr ?? 0;
    const hr = typeof rawHr === "number" ? rawHr : (parseInt(String(rawHr), 10) || undefined);

    const era = extractEraFromObject(raw);
    const whip = extractWhipFromObject(raw);
    const wls = extractWlsFromObject(raw);

    stats = [
      {
        year: 2026,
        avg: avg !== undefined && !isNaN(avg) ? avg : undefined,
        ops: ops !== undefined && !isNaN(ops) ? ops : undefined,
        hr: hr !== undefined && !isNaN(hr) ? hr : undefined,
        era: era !== undefined && !isNaN(era) ? era : undefined,
        whip: whip !== undefined && !isNaN(whip) ? whip : undefined,
        wls: wls || undefined,
        war: Number(war.toFixed(2)),
        salary: salaryCurrent
      }
    ];
  }

  return {
    id: String(raw.id || raw.playerId || `gas_player_${index}_${Date.now()}`),
    name: cleanName,
    team: String(team).trim(),
    position,
    age,
    salaryCurrent,
    draftYear: finalDraftYear,
    serviceTime: finalServiceTime,
    contractPeriod,
    agent,
    stats
  };
}

export default function Home() {
  const [players, setPlayers] = useState<Player[]>(loadStoredPlayers);
  const [activeTab, setActiveTab] = useState<"batter" | "pitcher">("batter");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [deleteTargetPlayer, setDeleteTargetPlayer] = useState<Player | null>(null);
  const [isDeletingPlayer, setIsDeletingPlayer] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // DB 실시간 동기화 상태
  const [isBatchSyncing, setIsBatchSyncing] = useState(false);
  const [batchSyncProgress, setBatchSyncProgress] = useState<string>("");
  const [syncingPlayerId, setSyncingPlayerId] = useState<string | null>(null);

  // 구글 Apps Script Web App 직접 하드코딩 엔드포인트 주소
  const GAS_DB_URL = "https://script.google.com/macros/s/AKfycbzuv-TBMbIKSM0gUPrb3d99kG82BWvKTXrrdOyQhlYvWf1QKOG5dsNNC5xFM74c/exec";

  // 1. 초기 데이터 로드: 메인 대시보드가 처음 렌더링될 때 App_data_DB(에이전시 소속 선수) 탭 데이터를 구글 Apps Script에서 fetch
  useEffect(() => {
    const fetchDashboardPlayers = async () => {
      try {
        const timestamp = new Date().getTime();
        // 쿼리 파라미터로 sheetName=App_data_DB 및 type=agency 명시
        const fetchUrl = `${GAS_DB_URL}?sheetName=App_data_DB&type=agency&t=${timestamp}`;
        const response = await fetch(fetchUrl);

        if (!response.ok) {
          throw new Error(`DB 통신 오류 (HTTP ${response.status})`);
        }

        const data = await response.json();
        console.log('대시보드 데이터 로드 성공:', data);

        // 방어 로직: 데이터 구조가 배열이 아니라면 안전하게 배열로 매핑
        let rawList: any[] = [];
        if (Array.isArray(data)) {
          rawList = data;
        } else if (Array.isArray(data?.data)) {
          rawList = data.data;
        } else if (Array.isArray(data?.players)) {
          rawList = data.players;
        } else if (Array.isArray(data?.records)) {
          rawList = data.records;
        } else if (Array.isArray(data?.items)) {
          rawList = data.items;
        } else if (Array.isArray(data?.result)) {
          rawList = data.result;
        } else if (data && typeof data === "object") {
          const values = Object.values(data);
          if (values.length > 0 && typeof values[0] === "object") {
            rawList = values as any[];
          }
        }

        // 객체 배열을 Player 인터페이스 규격으로 변환
        const mappedPlayers = rawList
          .map((item, idx) => mapRawToPlayer(item, idx))
          .filter((p): p is Player => p !== null);

        if (mappedPlayers.length > 0) {
          // 구글 시트 마스터 DB에서 최신 구단 로스터를 조회하여 입단 연도 및 등록일수 실시간 보강
          const uniqueTeams = Array.from(new Set(mappedPlayers.map(p => p.team))).filter(Boolean);
          await Promise.all(uniqueTeams.map(async (tName) => {
            try {
              const rosterRes = await fetchTeamRosterFromDatabase(tName);
              if (rosterRes.success && Array.isArray(rosterRes.players) && rosterRes.players.length > 0) {
                for (const p of mappedPlayers) {
                  if (p.team === tName) {
                    const match = rosterRes.players.find(rp => rp.name.trim() === p.name.trim());
                    if (match) {
                      if (match.draftYear) {
                        const parsedD = parseDraftYear(match.draftYear);
                        if (parsedD.draftYear > 0) {
                          p.draftYear = parsedD.draftYear;
                        }
                      }
                      if (match.serviceTime && match.serviceTime !== "0일" && match.serviceTime !== "1년 0일") {
                        p.serviceTime = match.serviceTime;
                      }
                    }
                  }
                }
              }
            } catch (err) {
              console.log(`구단 [${tName}] DB 실시간 보강 안내:`, err);
            }
          }));

          // 구글 시트에서 불러온 데이터와 로컬 신규 등록 선수를 안전하게 병합 (샘플/가상 선수는 분리 제외)
          const currentStored = loadStoredPlayers();
          const localOnlyPlayers = currentStored.filter(
            (sp) => !mappedPlayers.some((mp) => mp.name.trim() === sp.name.trim()) &&
                    !(sp as any).isSample &&
                    !sp.id.startsWith("sample-") &&
                    sp.agent !== "가상 시뮬레이터"
          );
          const finalPlayers = [...mappedPlayers, ...localOnlyPlayers];
          setPlayers(finalPlayers);
          saveStoredPlayers(finalPlayers);
        } else {
          // 로컬 스토리지에 기존 저장된 에이전시 선수가 있다면 유지 (샘플 선수 제외)
          const localStored = loadStoredPlayers().filter(
            (sp) => !(sp as any).isSample && !sp.id.startsWith("sample-") && sp.agent !== "가상 시뮬레이터"
          );
          if (localStored.length > 0) {
            setPlayers(localStored);
          }
        }
      } catch (error) {
        console.warn('대시보드 데이터 로드 안내 (로컬 저장소 유지):', error);
      }
    };

    fetchDashboardPlayers();
  }, []);

  // 2. 다른 컴포넌트나 탭에서 선수가 등록/수정/삭제되었을 때 이벤트 수신
  useEffect(() => {
    const handleUpdate = () => {
      setPlayers(loadStoredPlayers());
    };
    window.addEventListener("kbo_players_updated", handleUpdate);
    return () => window.removeEventListener("kbo_players_updated", handleUpdate);
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Metrics calculation
  const totalPayroll = players.reduce((sum, p) => sum + (p.salaryCurrent || 0), 0);

  const teamCounts = players.reduce((acc, p) => {
    acc[p.team] = (acc[p.team] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const activeTeamsCount = Object.keys(teamCounts).length;

  const avgWar = players.length > 0
    ? (players.reduce((sum, p) => {
        const lastStat = p.stats?.[p.stats.length - 1];
        const pWar = lastStat?.war || 0;
        return sum + pWar;
      }, 0) / players.length).toFixed(2)
    : "0.00";

  // 포지션별 선수 데이터 분리 (투수 vs 타자)
  const isPitcher = (p: Player) => (p.position || "").includes("투수");
  const pitcherPlayers = useMemo(() => players.filter(isPitcher), [players]);
  const batterPlayers = useMemo(() => players.filter((p) => !isPitcher(p)), [players]);
  const displayedPlayers = activeTab === "pitcher" ? pitcherPlayers : batterPlayers;

  // 1. 신규 선수 등록
  const handleRegisterPlayer = (newPlayer: Player) => {
    const updated = [newPlayer, ...players];
    setPlayers(updated);
    saveStoredPlayers(updated);
    setIsAddModalOpen(false);

    const latest = newPlayer.stats?.[newPlayer.stats.length - 1];
    const isRegPitcher = (newPlayer.position || "").includes("투수");

    if (isRegPitcher) {
      const eraText = latest?.era !== undefined ? latest.era.toFixed(2) : "-";
      const whipText = latest?.whip !== undefined ? latest.whip.toFixed(2) : "-";
      const wlsText = latest?.wls || "-";
      showToast(`'${newPlayer.name}' 투수(ERA ${eraText}, WHIP ${whipText}, ${wlsText}, WAR ${latest?.war?.toFixed(1) ?? "-"})가 등록되었습니다.`);
    } else {
      const avgText = latest?.avg !== undefined ? latest.avg.toFixed(3) : "-";
      const opsText = latest?.ops !== undefined ? latest.ops.toFixed(3) : "-";
      const hrText = latest?.hr !== undefined ? `${latest.hr}개` : "-";
      showToast(`'${newPlayer.name}' 타자(타율 ${avgText}, OPS ${opsText}, 홈런 ${hrText}, WAR ${latest?.war?.toFixed(1) ?? "-"})가 등록되었습니다.`);
    }
  };

  // 2. 선수 정보 수정
  const handleSaveEditPlayer = (updatedPlayer: Player) => {
    const updated = players.map((p) => (p.id === updatedPlayer.id ? updatedPlayer : p));
    setPlayers(updated);
    saveStoredPlayers(updated);
    setEditingPlayer(null);
    showToast(`'${updatedPlayer.name}' 선수의 정보와 성적이 성공적으로 수정되었습니다.`);
  };

  // 3. 선수 삭제 (로컬 상태 + 구글 스프레드시트 App_data_DB 원격 삭제 연동)
  const handleConfirmDelete = async () => {
    if (!deleteTargetPlayer || isDeletingPlayer) return;
    const target = deleteTargetPlayer;
    setIsDeletingPlayer(true);

    try {
      // 1) 구글 스프레드시트 App_data_DB에서 해당 선수 영구 삭제 요청
      const delRes = await deletePlayerFromDatabase({
        id: target.id,
        name: target.name,
        team: target.team,
      });

      // 2) 로컬 상태 및 localStorage에서 제거
      const updated = players.filter((p) => p.id !== target.id);
      setPlayers(updated);
      saveStoredPlayers(updated);

      if (delRes.remoteDeleted || delRes.success) {
        showToast(`'${target.name}' 선수가 App_data_DB 데이터베이스 및 소속 명단에서 완전히 삭제되었습니다.`);
      } else {
        showToast(`'${target.name}' 선수가 소속 명단에서 삭제되었습니다.`);
      }
    } catch (err: any) {
      console.error("DB 선수 삭제 오류:", err);
      // 오류 발생 시에도 로컬 상태는 삭제 반영
      const updated = players.filter((p) => p.id !== target.id);
      setPlayers(updated);
      saveStoredPlayers(updated);
      showToast(`'${target.name}' 선수가 소속 명단에서 삭제되었습니다.`);
    } finally {
      setIsDeletingPlayer(false);
      setDeleteTargetPlayer(null);
    }
  };

  // 4. 개별 선수 실시간 DB 동기화 및 App_data_DB 자동 덮어쓰기 저장
  const handleSyncSinglePlayer = async (player: Player) => {
    setSyncingPlayerId(player.id);
    try {
      // 1) App_data_DB (에이전시 DB)에서 최신 등록 정보 조회
      let appDataPlayer: Player | null = null;
      try {
        const timestamp = new Date().getTime();
        const appDataUrl = `${GAS_DB_URL}?sheetName=App_data_DB&type=agency&t=${timestamp}`;
        const appRes = await fetch(appDataUrl);
        if (appRes.ok) {
          const appJson = await appRes.json();
          const list: any[] = Array.isArray(appJson) ? appJson : (appJson?.data || appJson?.players || appJson?.records || []);
          const rawMatch = list.find((item: any) => {
            const iName = String(item["선수명"] || item.name || item.이름 || "").trim();
            return iName === player.name.trim();
          });
          if (rawMatch) {
            appDataPlayer = mapRawToPlayer(rawMatch, 0);
          }
        }
      } catch (err) {
        console.warn("App_data_DB fetch error during single sync:", err);
      }

      // 2) Stat_Master_DB 및 구단 로스터에서 연도별 상세 기록 조회
      const dbResult = await fetchPlayerFromDatabase(player.name, player.team);
      const baseToUse = appDataPlayer || player;

      let finalPlayerToSave: Player | null = null;

      if (dbResult.success && dbResult.records.length > 0) {
        const converted = convertDbToPlayer(dbResult, baseToUse);
        if (converted) {
          finalPlayerToSave = { ...converted, id: player.id };
        }
      } else if (appDataPlayer) {
        finalPlayerToSave = { ...player, ...appDataPlayer, id: player.id };
      }

      if (finalPlayerToSave) {
        // 프론트엔드 상태 및 로컬 스토리지 즉시 반영
        const updated = players.map((p) => (p.id === player.id ? finalPlayerToSave! : p));
        setPlayers(updated);
        saveStoredPlayers(updated);

        // 구글 시트 App_data_DB에 변경된 최신 정보 자동 덮어쓰기 저장 (백엔드 프록시 연동, action: 'update')
        const dbPayload = convertPlayerToAppDbPayload(finalPlayerToSave, "update");
        const saveResult = await savePlayerToDatabase(dbPayload);

        if (saveResult.success) {
          showToast(`'${player.name}' 선수의 최신 성적 및 연봉 정보가 App_data_DB에 자동 덮어쓰기 저장되었습니다.`);
        } else {
          showToast(`'${player.name}' 선수의 정보가 로컬에 갱신되었습니다.`);
        }
        return;
      }

      showToast(`구글 DB에서 '${player.name}' 선수의 기록을 찾지 못했습니다.`);
    } catch (e: any) {
      showToast(`동기화 오류: ${e.message}`);
    } finally {
      setSyncingPlayerId(null);
    }
  };

  // 5. 전체 선수 일괄 DB 동기화 및 App_data_DB 자동 덮어쓰기 저장
  const handleSyncAllPlayers = async () => {
    if (players.length === 0) return;
    setIsBatchSyncing(true);
    setBatchSyncProgress("최신 DB 기록 조회 중...");
    let updatedCount = 0;
    let savedDbCount = 0;

    try {
      // 1) App_data_DB (에이전시 소속 선수 DB) 최신 데이터 일괄 fetch
      const appDataMap = new Map<string, Player>();
      try {
        const timestamp = new Date().getTime();
        const appDataUrl = `${GAS_DB_URL}?sheetName=App_data_DB&type=agency&t=${timestamp}`;
        const appRes = await fetch(appDataUrl);
        if (appRes.ok) {
          const appJson = await appRes.json();
          const list: any[] = Array.isArray(appJson) ? appJson : (appJson?.data || appJson?.players || appJson?.records || []);
          list.forEach((item, idx) => {
            const iName = String(item["선수명"] || item.name || item.이름 || "").trim();
            if (iName) {
              const mapped = mapRawToPlayer(item, idx);
              if (mapped) appDataMap.set(iName, mapped);
            }
          });
        }
      } catch (err) {
        console.warn("App_data_DB batch sync warning:", err);
      }

      // 2) 전체 소속 선수에 대해 최신 KBO 통계 기록 조회 및 로컬 리스트 갱신
      const updatedList = [...players];
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

        // Stat_Master_DB 조회가 없더라도 App_data_DB에 갱신된 정보가 있으면 반영
        if (appPlayer) {
          updatedList[i] = basePlayer;
          updatedCount++;
        }
      }

      // 로컬 상태 및 localStorage 즉시 업데이트
      setPlayers(updatedList);
      saveStoredPlayers(updatedList);

      // 3) 갱신된 모든 선수 정보를 구글 시트 App_data_DB에 순차적으로 자동 덮어쓰기 저장
      for (let i = 0; i < updatedList.length; i++) {
        const p = updatedList[i];
        setBatchSyncProgress(`App_data_DB 저장 중... (${i + 1}/${updatedList.length} ${p.name})`);
        
        try {
          const payload = convertPlayerToAppDbPayload(p, "update");
          const saveRes = await savePlayerToDatabase(payload);
          if (saveRes.success) {
            savedDbCount++;
          }
        } catch (saveErr) {
          console.warn(`[handleSyncAllPlayers] '${p.name}' DB 저장 경고:`, saveErr);
        }

        // Google Apps Script 동시성 충돌 방지를 위한 안전 딜레이 (200ms)
        if (i < updatedList.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }

      showToast(`전체 ${players.length}명 중 ${updatedCount}명의 최신 기록이 화면에 반영되고, ${savedDbCount}명이 App_data_DB에 성공적으로 자동 덮어쓰기 저장되었습니다.`);
    } catch (e: any) {
      showToast(`일괄 동기화 중 오류가 발생했습니다: ${e.message}`);
    } finally {
      setIsBatchSyncing(false);
      setBatchSyncProgress("");
    }
  };

  const formatSalaryText = (salary: number) => {
    if (!salary || isNaN(salary) || salary <= 0) return "0만";
    let won = salary;
    while (won > 50000000000) {
      won = Math.round(won / 10000);
    }
    if (won < 5000000) {
      won = won * 10000;
    }

    if (won >= 100000000) {
      const uk = Math.floor(won / 100000000);
      const man = Math.round((won % 100000000) / 10000);
      if (man > 0) {
        return `${uk.toLocaleString()}억 ${man.toLocaleString()}만`;
      }
      return `${uk.toLocaleString()}억`;
    }
    const man = Math.round(won / 10000);
    return `${man.toLocaleString()}만`;
  };

  return (
    <div className="p-8 h-full overflow-y-auto bg-dark-main text-gray-200 flex flex-col gap-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-2 bg-emerald-950/90 border border-emerald-500/50 text-emerald-200 px-4 py-3 rounded-xl shadow-2xl shadow-black/80 backdrop-blur-md transition-all animate-bounce">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          <span className="text-sm font-semibold">{toastMessage}</span>
        </div>
      )}

      {/* 헤더 및 컨트롤 버튼 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gold/15 border border-gold/30 flex items-center justify-center text-gold shadow-md shadow-gold/10">
              <Database className="w-4 h-4" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              NOWIWON 계약 선수 관리 대시보드
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-gold/15 text-gold border border-gold/30">
                v2.5 Live
              </span>
            </h2>
          </div>
          <p className="text-[14px] text-gray-400 mt-1 pl-10.5">
            NOWIWON 소속 선수 프로필 및 기록 관리
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleSyncAllPlayers}
            disabled={isBatchSyncing || players.length === 0}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-xs font-semibold border border-white/10 transition-all cursor-pointer disabled:opacity-50 shadow-sm"
            title="DB에서 모든 선수 기록 실시간 갱신"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isBatchSyncing ? "animate-spin text-gold" : "text-gray-400"}`} />
            <span>{isBatchSyncing ? (batchSyncProgress || "DB 동기화 중...") : "전체 DB 동기화"}</span>
          </button>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-gold to-amber-500 hover:from-amber-400 hover:to-gold text-black text-xs font-bold shadow-lg shadow-gold/20 active:scale-95 transition-all cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>선수 추가 (DB 조회/직접입력)</span>
          </button>
        </div>
      </div>

      {/* 상단 통계 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-[#131722] border border-white/10 p-5 rounded-2xl shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-white/10 mb-3">
              <p className="text-[16px] text-white font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-gold" />
                소속 선수 및 구단 분포
              </p>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-gold/15 text-gold border border-gold/30">
                {players.length}명 등록
              </span>
            </div>
            <div className="flex flex-col items-center justify-center py-2 my-1">
              <p className="text-3xl font-black tracking-tight text-white">{players.length}<span className="text-base font-normal text-gray-400 ml-1">명</span></p>
              <p className="text-[14px] text-gray-400 mt-0.5">총 {activeTeamsCount}개 KBO 구단 소속</p>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 mt-2 max-h-[120px] overflow-y-auto pr-1">
            {(Object.entries(teamCounts) as [string, number][])
              .sort((a, b) => b[1] - a[1])
              .map(([team, count]) => (
                <div key={team} className="flex justify-between items-center text-xs bg-black/40 border border-white/5 rounded-lg px-2.5 py-1.5">
                  <span className="text-gray-300 font-medium">{team}</span>
                  <span className={`font-bold ${count >= 3 ? "text-amber-400" : "text-gray-400"}`}>
                    {count}명 {count >= 3 && "(한도 초과)"}
                  </span>
                </div>
              ))}
            {players.length === 0 && (
              <p className="text-xs text-gray-500 py-2 text-center">등록된 선수가 없습니다.</p>
            )}
          </div>
        </div>

        <StatCard
          title="총 연봉 (보장액 합계)"
          value={formatSalaryText(totalPayroll)}
          subText={`선수 1인당 평균 ${players.length ? formatSalaryText(Math.round(totalPayroll / players.length)) : "0만"}`}
          icon={DollarSign}
          color="text-emerald-400"
        />

        <StatCard
          title="평균 WAR (종합 기여도)"
          value={avgWar}
          subText="소속 선수 평균 승리 기여도"
          icon={Activity}
          color="text-gold"
        />
      </div>

      {/* 소속 선수 기록/정보 테이블 (타자/투수 탭 분리 관리) */}
      <div className="bg-[#131722] border border-white/10 rounded-2xl p-4 md:p-5 shadow-xl flex flex-col gap-3.5">
        <div className="flex items-center justify-between pb-3 border-b border-white/10 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-gold/15 border border-gold/30 flex items-center justify-center text-gold">
              <Database className="w-3.5 h-3.5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                소속 선수 기록 및 연봉 관리
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gold/15 text-gold border border-gold/30">
                  총 {players.length}명
                </span>
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* 타자 / 투수 선택 탭 (Tab UI) */}
            <div className="flex items-center p-1 bg-black/60 border border-white/10 rounded-xl shadow-inner">
              <button
                type="button"
                onClick={() => setActiveTab("batter")}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeTab === "batter"
                    ? "bg-gradient-to-r from-gold to-amber-500 text-black shadow-md shadow-gold/25 font-extrabold"
                    : "text-gray-400 hover:text-white hover:bg-white/5 font-semibold"
                }`}
              >
                타자 ({batterPlayers.length}명)
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("pitcher")}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeTab === "pitcher"
                    ? "bg-gradient-to-r from-gold to-amber-500 text-black shadow-md shadow-gold/25 font-extrabold"
                    : "text-gray-400 hover:text-white hover:bg-white/5 font-semibold"
                }`}
              >
                투수 ({pitcherPlayers.length}명)
              </button>
            </div>

            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gold/15 hover:bg-gold/25 border border-gold/30 text-gold text-xs font-bold transition-all cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>새 선수 등록</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/30">
          <table className="w-full text-xs text-left whitespace-nowrap">
            <thead className="text-xs text-center text-gray-400 uppercase tracking-wider bg-black/50 border-b border-white/10 font-bold whitespace-nowrap">
              {activeTab === "batter" ? (
                /* 타자 테이블 헤더: 선수명, 구단, 포지션, 나이, 타율, OPS, 홈런, WAR, 현재 연봉, 계약기간, 에이전트, 관리 */
                <tr>
                  <th className="px-2 py-2.5 font-bold text-center text-white whitespace-nowrap text-xs">선수명</th>
                  <th className="px-1.5 py-2.5 font-bold text-white whitespace-nowrap text-xs">구단</th>
                  <th className="px-1.5 py-2.5 font-bold text-white whitespace-nowrap text-xs">포지션</th>
                  <th className="px-1 py-2.5 font-bold text-white whitespace-nowrap text-xs">나이</th>
                  <th className="px-1.5 py-2.5 font-bold text-gray-200 whitespace-nowrap text-xs">타율</th>
                  <th className="px-1.5 py-2.5 font-bold text-gray-200 whitespace-nowrap text-xs">OPS</th>
                  <th className="px-1.5 py-2.5 font-bold text-white whitespace-nowrap text-xs">홈런</th>
                  <th className="px-1.5 py-2.5 font-bold text-gold whitespace-nowrap text-xs">WAR</th>
                  <th className="px-2 py-2.5 font-bold text-white whitespace-nowrap text-xs">현재 연봉</th>
                  <th className="px-1.5 py-2.5 font-bold text-white whitespace-nowrap text-xs">
                    <div className="flex items-center justify-center gap-1 whitespace-nowrap">
                      <Calendar className="w-3 h-3 text-gold" />
                      <span className="text-white text-xs">계약기간</span>
                    </div>
                  </th>
                  <th className="px-1.5 py-2.5 font-bold text-white whitespace-nowrap text-xs">
                    <div className="flex items-center justify-center gap-1 whitespace-nowrap">
                      <UserCheck className="w-3 h-3 text-gold" />
                      <span className="text-white text-xs">에이전트</span>
                    </div>
                  </th>
                  <th className="px-2 py-2.5 font-bold text-white whitespace-nowrap text-xs">관리</th>
                </tr>
              ) : (
                /* 투수 테이블 헤더: 선수명, 구단, 포지션, 나이, ERA, WHIP, 승/홀/세, WAR, 현재 연봉, 계약기간, 에이전트, 관리 */
                <tr>
                  <th className="px-2 py-2.5 font-bold text-center text-white whitespace-nowrap text-xs">선수명</th>
                  <th className="px-1.5 py-2.5 font-bold text-white whitespace-nowrap text-xs">구단</th>
                  <th className="px-1.5 py-2.5 font-bold text-white whitespace-nowrap text-xs">포지션</th>
                  <th className="px-1 py-2.5 font-bold text-white whitespace-nowrap text-xs">나이</th>
                  <th className="px-1.5 py-2.5 font-bold text-gray-200 whitespace-nowrap text-xs">ERA</th>
                  <th className="px-1.5 py-2.5 font-bold text-gray-200 whitespace-nowrap text-xs">WHIP</th>
                  <th className="px-1.5 py-2.5 font-bold text-white whitespace-nowrap text-xs">승/홀/세</th>
                  <th className="px-1.5 py-2.5 font-bold text-gold whitespace-nowrap text-xs">WAR</th>
                  <th className="px-2 py-2.5 font-bold text-white whitespace-nowrap text-xs">현재 연봉</th>
                  <th className="px-1.5 py-2.5 font-bold text-white whitespace-nowrap text-xs">
                    <div className="flex items-center justify-center gap-1 whitespace-nowrap">
                      <Calendar className="w-3 h-3 text-gold" />
                      <span className="text-white text-xs">계약기간</span>
                    </div>
                  </th>
                  <th className="px-1.5 py-2.5 font-bold text-white whitespace-nowrap text-xs">
                    <div className="flex items-center justify-center gap-1 whitespace-nowrap">
                      <UserCheck className="w-3 h-3 text-gold" />
                      <span className="text-white text-xs">에이전트</span>
                    </div>
                  </th>
                  <th className="px-2 py-2.5 font-bold text-white whitespace-nowrap text-xs">관리</th>
                </tr>
              )}
            </thead>
            <tbody className="divide-y divide-white/5 whitespace-nowrap">
              {displayedPlayers.map((player) => {
                const pName = (player.name || "").trim();
                const latestStat = player.stats?.[player.stats.length - 1];
                const war = latestStat?.war ?? 0;
                const period = extractContractPeriod(player);
                const isSyncingThis = syncingPlayerId === player.id;
                const agentName = extractAgentName(player);
                const agentStyle = getAgentBadgeStyle(agentName);

                // 성적 표시 분기 (타자 vs 투수)
                const avg = latestStat?.avg !== undefined ? latestStat.avg.toFixed(3) : "-";
                const ops = latestStat?.ops !== undefined ? latestStat.ops.toFixed(3) : "-";
                const hr = latestStat?.hr !== undefined ? `${latestStat.hr}개` : "-";

                const era = latestStat?.era !== undefined ? latestStat.era.toFixed(2) : "-";
                const whip = latestStat?.whip !== undefined ? latestStat.whip.toFixed(2) : "-";
                const wls = latestStat?.wls || "-";

                return (
                  <tr
                    key={player.id}
                    className="hover:bg-white/5 transition-colors text-center text-xs font-sans group"
                  >
                    <td className="px-2.5 py-2 font-semibold text-white text-left whitespace-nowrap">
                      <div className="whitespace-nowrap text-left">
                        <span className="font-bold text-white text-[13px] block leading-snug text-left">{player.name}</span>
                        <span className="text-[11px] text-gray-400 font-normal whitespace-nowrap text-left block">
                          {player.draftYear > 0 ? `입단 ${player.draftYear}년` : "입단연도 미상"}
                        </span>
                        <span className="text-[10px] text-gray-300 font-medium whitespace-nowrap text-left block">
                          {player.serviceTime && player.serviceTime !== "-" && player.serviceTime !== "0일"
                            ? formatServiceTimeWithComma(player.serviceTime)
                            : "기록 없음"}
                        </span>
                      </div>
                    </td>
                    <td className="px-1.5 py-2 whitespace-nowrap">
                      <span className="px-1.5 py-0.5 rounded-md bg-black/40 border border-white/10 text-white text-[11px] font-semibold whitespace-nowrap inline-block">
                        {player.team}
                      </span>
                    </td>
                    <td className="px-1.5 py-2 text-white font-semibold text-xs whitespace-nowrap">{player.position}</td>
                    <td className="px-1 py-2 text-white font-medium text-xs whitespace-nowrap">{player.age || 24}세</td>

                    {/* 포지션별 전용 스탯 3열 */}
                    {activeTab === "batter" ? (
                      <>
                        <td className="px-1.5 py-2 text-white font-bold text-xs tracking-wide whitespace-nowrap">{avg}</td>
                        <td className="px-1.5 py-2 text-white font-bold text-xs tracking-wide whitespace-nowrap">{ops}</td>
                        <td className="px-1.5 py-2 text-white font-bold text-xs tracking-wide whitespace-nowrap">{hr}</td>
                      </>
                    ) : (
                      <>
                        <td className="px-1.5 py-2 text-white font-bold text-xs tracking-wide whitespace-nowrap">{era}</td>
                        <td className="px-1.5 py-2 text-white font-bold text-xs tracking-wide whitespace-nowrap">{whip}</td>
                        <td className="px-1.5 py-2 text-white font-bold text-xs tracking-wide whitespace-nowrap">{wls}</td>
                      </>
                    )}

                    <td className="px-1.5 py-2 text-gold font-bold text-xs whitespace-nowrap">
                      {typeof war === "number" ? war.toFixed(2) : "0.00"}
                    </td>
                    <td className="px-2 py-2 text-emerald-400 font-bold text-xs whitespace-nowrap">
                      {formatSalaryText(player.salaryCurrent)}
                    </td>
                    <td className="px-1.5 py-2 whitespace-nowrap">
                      {period && period !== "-" ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/40 border border-white/10 text-[11px] font-medium text-white whitespace-nowrap">
                          <Clock className="w-3 h-3 text-gold opacity-90 flex-shrink-0" />
                          <span className="whitespace-nowrap text-white">{period}</span>
                        </span>
                      ) : (
                        <span className="text-gray-500 font-medium text-xs whitespace-nowrap">-</span>
                      )}
                    </td>
                    <td className="px-1.5 py-2 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-bold whitespace-nowrap shadow-sm border transition-colors ${agentStyle.badgeClass}`}>
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${agentStyle.dotClass}`} />
                        <UserCheck className={`w-2.5 h-2.5 flex-shrink-0 ${agentStyle.iconClass}`} />
                        <span className="whitespace-nowrap">{agentName}</span>
                      </span>
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1 whitespace-nowrap">
                        <button
                          onClick={() => setEditingPlayer(player)}
                          className="px-2 py-0.5 rounded-md bg-white/5 hover:bg-gold/20 hover:text-gold border border-white/10 text-gray-300 text-[11px] font-semibold transition-all flex items-center gap-0.5 cursor-pointer whitespace-nowrap"
                          title="선수 정보 및 성적 수정"
                        >
                          <Pencil className="w-2.5 h-2.5 text-gold flex-shrink-0" />
                          <span className="whitespace-nowrap">수정</span>
                        </button>
                        <button
                          onClick={() => handleSyncSinglePlayer(player)}
                          disabled={isSyncingThis}
                          className="px-1.5 py-0.5 rounded-md bg-white/5 hover:bg-gold/20 hover:text-gold border border-white/10 text-gray-300 text-[11px] font-semibold transition-all flex items-center gap-0.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                          title="최신 DB 기록 조회 및 App_data_DB 자동 덮어쓰기 저장"
                        >
                          <RefreshCw className={`w-2.5 h-2.5 flex-shrink-0 ${isSyncingThis ? "animate-spin text-gold" : ""}`} />
                          <span className="whitespace-nowrap">{isSyncingThis ? "..." : "DB"}</span>
                        </button>
                        <button
                          onClick={() => setDeleteTargetPlayer(player)}
                          className="p-1 rounded-md text-gray-500 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all cursor-pointer whitespace-nowrap"
                          title="선수 삭제"
                        >
                          <Trash2 className="w-3 h-3 flex-shrink-0" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {displayedPlayers.length === 0 && (
                <tr>
                  <td colSpan={12} className="text-center py-12 text-gray-500 font-sans">
                    <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm font-semibold mb-2">등록된 {activeTab === "pitcher" ? "투수" : "타자"}가 없습니다.</p>
                    <button
                      onClick={() => setIsAddModalOpen(true)}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-gold to-amber-500 text-black text-xs font-bold shadow-md hover:from-amber-400 hover:to-gold cursor-pointer"
                    >
                      {activeTab === "pitcher" ? "투수" : "타자"} 추가하기
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 1. 신규 등록 모달 */}
      <AddPlayerModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onRegister={handleRegisterPlayer}
        existingPlayers={players}
      />

      {/* 2. 정보 수정 모달 */}
      <EditPlayerModal
        player={editingPlayer}
        isOpen={!!editingPlayer}
        onClose={() => setEditingPlayer(null)}
        onSave={handleSaveEditPlayer}
      />

      {/* 3. 삭제 확인 모달 */}
      <DeletePlayerModal
        player={deleteTargetPlayer}
        isOpen={!!deleteTargetPlayer}
        isDeleting={isDeletingPlayer}
        onClose={() => setDeleteTargetPlayer(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}

function StatCard({
  title,
  value,
  subText,
  icon: Icon,
  color,
}: {
  title: string;
  value: string | number;
  subText?: string;
  icon: any;
  color: string;
}) {
  return (
    <div className="bg-[#131722] border border-white/10 p-5 rounded-2xl shadow-xl flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between pb-2 border-b border-white/10 mb-3">
          <p className="text-[16px] text-white uppercase font-bold tracking-wider">{title}</p>
          <div className="w-6 h-6 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center">
            <Icon className={`w-3.5 h-3.5 ${color}`} />
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-4 my-1">
          <p className="text-3xl font-black tracking-tight text-white">{value}</p>
        </div>
      </div>
      {subText && <p className="text-[14px] text-gray-400 text-center mt-2 pt-2 border-t border-white/5">{subText}</p>}
    </div>
  );
}
