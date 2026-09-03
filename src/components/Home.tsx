import React, { useState, useEffect } from "react";
import { mockPlayers, mockTeams, loadStoredPlayers, saveStoredPlayers, Player, PlayerStat } from "../data";
import {
  fetchPlayerFromDatabase,
  fetchTeamRosterFromDatabase,
  convertDbToPlayer,
  cleanPosition,
  parsePlayerAge,
  parsePlayerSalary,
  parseDraftYear,
  parseServiceTime
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
 * 원시 데이터(Raw Record)를 대시보드 Player 객체 규격으로 안전하게 변환하는 헬퍼 함수
 */
function mapRawToPlayer(raw: any, index: number): Player | null {
  if (!raw || typeof raw !== "object") return null;

  // 이미 완성된 Player 규격을 갖춘 경우
  if (raw.id && raw.name && raw.team && Array.isArray(raw.stats) && raw.stats.length > 0) {
    return {
      id: String(raw.id),
      name: String(raw.name),
      team: String(raw.team),
      position: cleanPosition(raw.position || "외야수"),
      age: parsePlayerAge(raw.age),
      salaryCurrent: parsePlayerSalary(raw.salaryCurrent),
      draftYear: parseDraftYear(raw.draftYear).draftYear,
      serviceTime: parseServiceTime(raw.serviceTime),
      contractPeriod: raw.contractPeriod || "24년 01월 01일 ~ 26년 12월 31일",
      agent: raw.agent || "이세인",
      stats: raw.stats
    };
  }

  const name = raw.name || raw["선수명"] || raw["이름"] || "";
  if (!name || name === "선수" || name === "선수명") return null;

  const team = raw.team || raw["구단"] || raw["팀"] || raw["소속"] || raw["팀명"] || "롯데 자이언츠";
  const position = cleanPosition(raw.position || raw["포지션"] || "외야수");
  const age = parsePlayerAge(raw.age ?? raw["나이"] ?? 27);
  const salaryCurrent = parsePlayerSalary(raw.salaryCurrent ?? raw["현재 연봉"] ?? raw["현재연봉"] ?? raw["연봉"] ?? raw.salary);
  const draftInfo = parseDraftYear(raw.draftYear ?? raw["입단 연도"] ?? raw["입단연도"]);
  const serviceTime = parseServiceTime(raw.serviceTime ?? raw["등록일수"] ?? raw["총등록일수"] ?? "");
  const contractPeriod = raw.contractPeriod || raw["에이전트 계약기간 관리"] || raw["계약기간"] || "24년 01월 01일 ~ 26년 12월 31일";
  const agent = raw.agent || raw["담당 에이전트"] || raw["에이전트"] || "이세인";

  // stats 추출
  let stats: PlayerStat[] = [];
  if (Array.isArray(raw.stats) && raw.stats.length > 0) {
    stats = raw.stats;
  } else {
    const rawWar = raw["핵심 스탯(WAR)"] ?? raw["WAR"] ?? raw.war ?? raw["최근 WAR"] ?? 0;
    const war = typeof rawWar === "number" ? rawWar : (parseFloat(String(rawWar)) || null);
    const rawAvg = raw["타율"] ?? raw["AVG"] ?? raw.avg ?? 0;
    const avg = typeof rawAvg === "number" ? rawAvg : (parseFloat(String(rawAvg)) || undefined);
    const rawOps = raw["OPS"] ?? raw.ops ?? 0;
    const ops = typeof rawOps === "number" ? rawOps : (parseFloat(String(rawOps)) || undefined);
    const rawHr = raw["홈런"] ?? raw["HR"] ?? raw.hr ?? 0;
    const hr = typeof rawHr === "number" ? rawHr : (parseInt(String(rawHr), 10) || undefined);

    stats = [
      {
        year: 2026,
        avg: avg !== undefined && !isNaN(avg) ? avg : undefined,
        ops: ops !== undefined && !isNaN(ops) ? ops : undefined,
        hr: hr !== undefined && !isNaN(hr) ? hr : undefined,
        war: war !== null && !isNaN(war) ? Number(war.toFixed(2)) : null,
        salary: salaryCurrent
      }
    ];
  }

  return {
    id: String(raw.id || raw.playerId || `gas_player_${index}_${Date.now()}`),
    name,
    team,
    position,
    age,
    salaryCurrent,
    draftYear: draftInfo.draftYear > 0 ? draftInfo.draftYear : 2018,
    serviceTime: serviceTime || "1년 0일",
    contractPeriod,
    agent,
    stats
  };
}

export default function Home() {
  const [players, setPlayers] = useState<Player[]>(loadStoredPlayers);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [deleteTargetPlayer, setDeleteTargetPlayer] = useState<Player | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // DB 실시간 동기화 상태
  const [isBatchSyncing, setIsBatchSyncing] = useState(false);
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
          setPlayers(mappedPlayers);
          saveStoredPlayers(mappedPlayers);
        } else {
          // 로컬 스토리지에 기존 저장된 에이전시 선수가 있다면 유지
          const localStored = loadStoredPlayers();
          if (localStored.length > 0) {
            setPlayers(localStored);
          }
        }
      } catch (error) {
        console.error('대시보드 데이터 로드 실패:', error);
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
        return sum + (lastStat?.war || 0);
      }, 0) / players.length).toFixed(1)
    : "0.0";

  // 1. 신규 선수 등록
  const handleRegisterPlayer = (newPlayer: Player) => {
    const updated = [newPlayer, ...players];
    setPlayers(updated);
    saveStoredPlayers(updated);
    setIsAddModalOpen(false);

    const latest = newPlayer.stats?.[newPlayer.stats.length - 1];
    const avgText = latest?.avg !== undefined ? latest.avg.toFixed(3) : "-";
    const opsText = latest?.ops !== undefined ? latest.ops.toFixed(3) : "-";
    const hrText = latest?.hr !== undefined ? `${latest.hr}개` : "-";

    showToast(`'${newPlayer.name}' 선수(타율 ${avgText}, OPS ${opsText}, 홈런 ${hrText}, WAR ${latest?.war?.toFixed(1) ?? "-"})가 등록되었습니다.`);
  };

  // 2. 선수 정보 수정
  const handleSaveEditPlayer = (updatedPlayer: Player) => {
    const updated = players.map((p) => (p.id === updatedPlayer.id ? updatedPlayer : p));
    setPlayers(updated);
    saveStoredPlayers(updated);
    setEditingPlayer(null);
    showToast(`'${updatedPlayer.name}' 선수의 정보와 성적이 성공적으로 수정되었습니다.`);
  };

  // 3. 선수 삭제
  const handleConfirmDelete = () => {
    if (!deleteTargetPlayer) return;
    const updated = players.filter((p) => p.id !== deleteTargetPlayer.id);
    setPlayers(updated);
    saveStoredPlayers(updated);
    showToast(`'${deleteTargetPlayer.name}' 선수가 소속 명단에서 삭제되었습니다.`);
    setDeleteTargetPlayer(null);
  };

  // 4. 개별 선수 실시간 DB 동기화
  const handleSyncSinglePlayer = async (player: Player) => {
    setSyncingPlayerId(player.id);
    try {
      const dbResult = await fetchPlayerFromDatabase(player.name, player.team);
      if (dbResult.success && dbResult.records.length > 0) {
        const converted = convertDbToPlayer(dbResult, player);
        if (converted) {
          const updated = players.map((p) => (p.id === player.id ? converted : p));
          setPlayers(updated);
          saveStoredPlayers(updated);
          showToast(`'${player.name}' 선수의 최신 DB 성적 및 연봉 정보가 동기화되었습니다.`);
        } else {
          showToast(`'${player.name}' 선수의 데이터 변환에 실패했습니다.`);
        }
      } else {
        showToast(`구글 DB에서 '${player.name}' 선수의 기록을 찾지 못했습니다.`);
      }
    } catch (e: any) {
      showToast(`동기화 오류: ${e.message}`);
    } finally {
      setSyncingPlayerId(null);
    }
  };

  // 5. 전체 선수 일괄 DB 동기화
  const handleSyncAllPlayers = async () => {
    if (players.length === 0) return;
    setIsBatchSyncing(true);
    let updatedCount = 0;

    try {
      const updatedList = [...players];
      for (let i = 0; i < updatedList.length; i++) {
        const p = updatedList[i];
        const res = await fetchPlayerFromDatabase(p.name, p.team);
        if (res.success && res.records.length > 0) {
          const conv = convertDbToPlayer(res, p);
          if (conv) {
            updatedList[i] = conv;
            updatedCount++;
          }
        }
      }
      setPlayers(updatedList);
      saveStoredPlayers(updatedList);
      showToast(`전체 ${players.length}명 중 ${updatedCount}명의 선수가 구글 DB와 실시간 동기화되었습니다.`);
    } catch (e: any) {
      showToast(`일괄 동기화 중 오류가 발생했습니다: ${e.message}`);
    } finally {
      setIsBatchSyncing(false);
    }
  };

  const formatSalaryText = (salary: number) => {
    if (salary >= 100000000) {
      const uk = salary / 100000000;
      return `₩${uk.toFixed(uk % 1 === 0 ? 0 : 1)}억`;
    }
    const man = Math.round(salary / 10000);
    return `₩${man.toLocaleString()}만`;
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
            <span>{isBatchSyncing ? "DB 동기화 중..." : "전체 DB 동기화"}</span>
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
                    {count}명 {count >= 3 && "(한도 도달)"}
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
          subText={`선수 1인당 평균 ${players.length ? formatSalaryText(Math.round(totalPayroll / players.length)) : "₩0"}`}
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

      {/* 소속 선수 기록/정보 테이블 */}
      <div className="bg-[#131722] border border-white/10 rounded-2xl p-5 md:p-6 shadow-xl flex flex-col gap-4">
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gold/15 border border-gold/30 flex items-center justify-center text-gold">
              <Database className="w-3.5 h-3.5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                소속 선수 기록 및 연봉 관리
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gold/15 text-gold border border-gold/30">
                  {players.length}명
                </span>
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2">
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
            <thead className="text-[13px] text-center text-gray-400 uppercase tracking-wider bg-black/50 border-b border-white/10 font-bold whitespace-nowrap">
              <tr>
                <th className="px-3 py-3 font-bold text-center text-white whitespace-nowrap text-[13px]">선수명</th>
                <th className="px-2 py-3 font-bold text-white whitespace-nowrap text-[13px]">구단</th>
                <th className="px-2.5 py-3 font-bold text-white whitespace-nowrap text-[13px]">포지션</th>
                <th className="px-2 py-3 font-bold text-white whitespace-nowrap text-[13px]">나이</th>
                <th className="px-2.5 py-3 font-bold text-gray-200 whitespace-nowrap text-[13px]">타율</th>
                <th className="px-2.5 py-3 font-bold text-gray-200 whitespace-nowrap text-[13px]">OPS</th>
                <th className="px-2 py-3 font-bold text-white whitespace-nowrap text-[13px]">홈런</th>
                <th className="px-2.5 py-3 font-bold text-gold whitespace-nowrap text-[13px]">최근 WAR</th>
                <th className="px-3 py-3 font-bold text-white whitespace-nowrap text-[13px]">현재 연봉</th>
                <th className="px-3 py-3 font-bold text-white whitespace-nowrap text-[13px]">
                  <div className="flex items-center justify-center gap-1 whitespace-nowrap">
                    <Calendar className="w-3 h-3 text-gold" />
                    <span className="text-white text-[13px]">에이전트 계약기간</span>
                  </div>
                </th>
                <th className="px-2.5 py-3 font-bold text-white whitespace-nowrap text-[13px]">
                  <div className="flex items-center justify-center gap-1 whitespace-nowrap">
                    <UserCheck className="w-3 h-3 text-gold" />
                    <span className="text-white text-[13px]">에이전트</span>
                  </div>
                </th>
                <th className="px-3 py-3 font-bold text-white whitespace-nowrap text-[13px]">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 whitespace-nowrap">
              {players.map((player) => {
                const latestStat = player.stats?.[player.stats.length - 1];
                const war = latestStat?.war ?? 0;
                const avg = latestStat?.avg !== undefined ? latestStat.avg.toFixed(3) : "-";
                const ops = latestStat?.ops !== undefined ? latestStat.ops.toFixed(3) : "-";
                const hr = latestStat?.hr !== undefined ? `${latestStat.hr}개` : "-";
                const period = player.contractPeriod || "25년 01월 01일 ~ 27년 12월 31일";
                const isSyncingThis = syncingPlayerId === player.id;
                const agentName = player.agent || "이세인";

                return (
                  <tr
                    key={player.id}
                    className="hover:bg-white/5 transition-colors text-center text-xs font-sans group"
                  >
                    <td className="px-3 py-2.5 font-semibold text-white text-left pl-5 whitespace-nowrap">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-gold/15 border border-gold/30 text-gold text-xs font-black flex items-center justify-center shadow-sm flex-shrink-0">
                          {player.name.charAt(0)}
                        </div>
                        <div className="whitespace-nowrap text-left">
                          <span className="font-bold text-white text-sm block leading-snug text-left">{player.name}</span>
                          <span className="text-xs text-white font-medium whitespace-nowrap text-left block">입단 {player.draftYear}년</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2.5 whitespace-nowrap">
                      <span className="px-2.5 py-1 rounded-lg bg-black/40 border border-white/10 text-white text-xs font-semibold whitespace-nowrap inline-block">
                        {player.team}
                      </span>
                    </td>
                    <td className="px-2.5 py-2.5 text-white font-semibold text-xs whitespace-nowrap">{player.position}</td>
                    <td className="px-2.5 py-2.5 text-white font-medium text-xs whitespace-nowrap">{player.age || 24}세</td>
                    <td className="px-2.5 py-2.5 text-white font-bold text-xs tracking-wide whitespace-nowrap">{avg}</td>
                    <td className="px-2.5 py-2.5 text-white font-bold text-xs tracking-wide whitespace-nowrap">{ops}</td>
                    <td className="px-2.5 py-2.5 text-white font-bold text-xs tracking-wide whitespace-nowrap">{hr}</td>
                    <td className="px-2.5 py-2.5 text-gold font-bold text-sm whitespace-nowrap">
                      {war.toFixed(1)}
                    </td>
                    <td className="px-3 py-2.5 text-emerald-400 font-bold text-xs whitespace-nowrap">
                      {formatSalaryText(player.salaryCurrent)}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/40 border border-white/10 text-xs font-medium text-white whitespace-nowrap">
                        <Clock className="w-3.5 h-3.5 text-gold opacity-90 flex-shrink-0" />
                        <span className="whitespace-nowrap text-white">{period}</span>
                      </span>
                    </td>
                    <td className="px-2.5 py-2.5 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap shadow-sm border ${
                        agentName === "이세인"
                          ? "bg-gold/15 border-gold/35 text-gold"
                          : "bg-amber-400/10 border-amber-400/30 text-amber-200"
                      }`}>
                        <UserCheck className="w-3 h-3 opacity-80 flex-shrink-0" />
                        <span className="whitespace-nowrap">{agentName}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1.5 whitespace-nowrap">
                        <button
                          onClick={() => setEditingPlayer(player)}
                          className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-gold/20 hover:text-gold border border-white/10 text-gray-300 text-[11px] font-semibold transition-all flex items-center gap-1 cursor-pointer whitespace-nowrap"
                          title="선수 정보 및 성적 수정"
                        >
                          <Pencil className="w-3 h-3 text-gold flex-shrink-0" />
                          <span className="whitespace-nowrap">수정</span>
                        </button>
                        <button
                          onClick={() => handleSyncSinglePlayer(player)}
                          disabled={isSyncingThis}
                          className="px-2 py-1 rounded-lg bg-white/5 hover:bg-gold/20 hover:text-gold border border-white/10 text-gray-300 text-[11px] font-semibold transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                          title="구글 스프레드시트 DB에서 최신 기록 동기화"
                        >
                          <RefreshCw className={`w-3 h-3 flex-shrink-0 ${isSyncingThis ? "animate-spin text-gold" : ""}`} />
                          <span className="whitespace-nowrap">{isSyncingThis ? "..." : "DB"}</span>
                        </button>
                        <button
                          onClick={() => setDeleteTargetPlayer(player)}
                          className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all cursor-pointer whitespace-nowrap"
                          title="선수 삭제"
                        >
                          <Trash2 className="w-3.5 h-3.5 flex-shrink-0" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {players.length === 0 && (
                <tr>
                  <td colSpan={12} className="text-center py-12 text-gray-500 font-sans">
                    <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm font-semibold mb-2">등록된 선수가 없습니다.</p>
                    <button
                      onClick={() => setIsAddModalOpen(true)}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-gold to-amber-500 text-black text-xs font-bold shadow-md hover:from-amber-400 hover:to-gold cursor-pointer"
                    >
                      첫 번째 선수 추가하기
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
