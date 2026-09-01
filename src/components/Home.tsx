import React, { useState, useEffect } from "react";
import { mockPlayers, mockTeams, loadStoredPlayers, saveStoredPlayers, Player } from "../data";
import {
  fetchPlayerFromDatabase,
  convertDbToPlayer
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
  Sparkles
} from "lucide-react";
import { AddPlayerModal } from "./AddPlayerModal";
import { EditPlayerModal } from "./EditPlayerModal";
import { DeletePlayerModal } from "./DeletePlayerModal";

export default function Home() {
  const [players, setPlayers] = useState<Player[]>(loadStoredPlayers);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [deleteTargetPlayer, setDeleteTargetPlayer] = useState<Player | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // DB 실시간 동기화 상태
  const [isBatchSyncing, setIsBatchSyncing] = useState(false);
  const [syncingPlayerId, setSyncingPlayerId] = useState<string | null>(null);

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-2xl font-sans font-bold tracking-tight text-white">대시보드</h2>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              <Database className="w-3.5 h-3.5" />
              구글 DB 실시간 연동
            </span>
          </div>
          <p className="text-[14px] text-gray-400 tracking-tight mt-1">
            나우아이원 매니지먼트 그룹 소속 선수 프로필 및 실시간 DB 기록 관리
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSyncAllPlayers}
            disabled={isBatchSyncing || players.length === 0}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 text-sm font-semibold border border-white/10 transition-all cursor-pointer disabled:opacity-50"
            title="구글 스프레드시트 DB에서 모든 선수 기록 실시간 갱신"
          >
            <RefreshCw className={`w-4 h-4 ${isBatchSyncing ? "animate-spin text-gold" : "text-gray-400"}`} />
            <span>{isBatchSyncing ? "DB 동기화 중..." : "전체 DB 동기화"}</span>
          </button>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gold hover:bg-yellow-400 text-black text-sm font-bold shadow-lg shadow-gold/20 active:scale-95 transition-all cursor-pointer"
          >
            <UserPlus className="w-4 h-4 stroke-[2.5]" />
            <span>선수 추가 (DB 조회/직접입력)</span>
          </button>
        </div>
      </div>

      {/* 상단 통계 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="glass-card p-5 rounded-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[13px] text-gray-400 uppercase font-bold tracking-wider">소속 선수 및 구단 분포</p>
              <Users className="w-4 h-4 text-gold" />
            </div>
            <div className="flex flex-col items-center justify-center py-3 my-1">
              <p className="text-3xl font-bold tracking-tight text-white">{players.length}명</p>
              <p className="text-[13px] text-gray-400 mt-0.5">({activeTeamsCount}개 구단)</p>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 mt-2 max-h-[140px] overflow-y-auto pr-1">
            {(Object.entries(teamCounts) as [string, number][])
              .sort((a, b) => b[1] - a[1])
              .map(([team, count]) => (
                <div key={team} className="flex justify-between items-center text-[12px] bg-white/5 rounded px-2.5 py-1">
                  <span className="text-gray-300">{team}</span>
                  <span className={`font-bold ${count >= 3 ? "text-red-400" : "text-gray-400"}`}>
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
          color="text-blue-400"
        />
      </div>

      {/* 소속 선수 기록/정보 테이블 */}
      <div className="glass-card rounded-xl p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="text-[15px] font-bold uppercase tracking-widest text-gold flex items-center gap-2">
              <Database className="w-4 h-4 text-gold" />
              소속 선수 기록 / 정보 관리
            </h3>
            <span className="px-2 py-0.5 rounded-full bg-gold/15 border border-gold/30 text-gold text-xs font-bold">
              총 {players.length}명
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-1.5 text-xs font-bold text-gold hover:text-yellow-300 transition-colors cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>새 선수 등록</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-white/5">
          <table className="w-full text-sm text-left">
            <thead className="text-[12.5px] text-center text-gray-400 uppercase tracking-widest bg-white/5 border-b border-white/10">
              <tr>
                <th className="px-4 py-3.5 rounded-tl-lg font-bold text-left pl-6">선수명</th>
                <th className="px-3 py-3.5 font-bold">구단</th>
                <th className="px-3 py-3.5 font-bold">포지션</th>
                <th className="px-3 py-3.5 font-bold">나이</th>
                <th className="px-3 py-3.5 font-bold text-white">타율</th>
                <th className="px-3 py-3.5 font-bold text-white">OPS</th>
                <th className="px-3 py-3.5 font-bold text-white">홈런</th>
                <th className="px-3 py-3.5 font-bold text-gold">최근 WAR</th>
                <th className="px-4 py-3.5 font-bold">현재 연봉</th>
                <th className="px-4 py-3.5 font-bold text-gray-300">
                  <div className="flex items-center justify-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-gold" />
                    <span>에이전트 계약기간</span>
                  </div>
                </th>
                <th className="px-4 py-3.5 rounded-tr-lg font-bold">관리</th>
              </tr>
            </thead>
            <tbody>
              {players.map((player) => {
                const latestStat = player.stats?.[player.stats.length - 1];
                const war = latestStat?.war ?? 0;
                const avg = latestStat?.avg !== undefined ? latestStat.avg.toFixed(3) : "-";
                const ops = latestStat?.ops !== undefined ? latestStat.ops.toFixed(3) : "-";
                const hr = latestStat?.hr !== undefined ? `${latestStat.hr}개` : "-";
                const period = player.contractPeriod || "25년 01월 01일 ~ 27년 12월 31일";
                const isSyncingThis = syncingPlayerId === player.id;

                return (
                  <tr
                    key={player.id}
                    className="border-b border-white/5 hover:bg-white/5 transition-colors text-center text-[13px] font-sans group"
                  >
                    <td className="px-4 py-3.5 font-semibold text-white text-left pl-6">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-gray-800 border border-gold/30 text-gold text-xs font-black flex items-center justify-center">
                          {player.name.charAt(0)}
                        </div>
                        <div>
                          <span className="font-bold text-gray-100">{player.name}</span>
                          <span className="block text-[11px] text-gray-400">입단 {player.draftYear}년</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3.5">
                      <span className="px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-gray-300 text-xs font-medium">
                        {player.team}
                      </span>
                    </td>
                    <td className="px-3 py-3.5 text-gray-300">{player.position}</td>
                    <td className="px-3 py-3.5 text-gray-400">{player.age || 24}세</td>
                    <td className="px-3 py-3.5 text-white font-mono font-semibold">{avg}</td>
                    <td className="px-3 py-3.5 text-white font-mono font-semibold">{ops}</td>
                    <td className="px-3 py-3.5 text-white font-mono font-semibold">{hr}</td>
                    <td className="px-3 py-3.5 text-gold font-bold text-[14px]">
                      {war.toFixed(1)}
                    </td>
                    <td className="px-4 py-3.5 text-gray-200 font-semibold">
                      {formatSalaryText(player.salaryCurrent)}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-black/40 border border-white/10 text-xs font-mono text-gray-300">
                        <Clock className="w-3 h-3 text-gold opacity-75" />
                        {period}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => setEditingPlayer(player)}
                          className="px-2 py-1 rounded bg-white/5 hover:bg-gold/20 hover:text-gold border border-white/10 text-gray-300 text-xs font-medium transition-all flex items-center gap-1 cursor-pointer"
                          title="선수 정보 및 성적 수정"
                        >
                          <Pencil className="w-3 h-3 text-gold" />
                          <span>수정</span>
                        </button>
                        <button
                          onClick={() => handleSyncSinglePlayer(player)}
                          disabled={isSyncingThis}
                          className="px-2 py-1 rounded bg-white/5 hover:bg-gold/20 hover:text-gold border border-white/10 text-gray-300 text-xs font-medium transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          title="구글 스프레드시트 DB에서 최신 기록 동기화"
                        >
                          <RefreshCw className={`w-3 h-3 ${isSyncingThis ? "animate-spin text-gold" : ""}`} />
                          <span>{isSyncingThis ? "..." : "DB"}</span>
                        </button>
                        <button
                          onClick={() => setDeleteTargetPlayer(player)}
                          className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all cursor-pointer"
                          title="선수 삭제"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {players.length === 0 && (
                <tr>
                  <td colSpan={11} className="text-center py-12 text-gray-500 font-sans">
                    <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm font-semibold mb-2">등록된 선수가 없습니다.</p>
                    <button
                      onClick={() => setIsAddModalOpen(true)}
                      className="px-4 py-1.5 rounded bg-gold text-black text-xs font-bold hover:bg-yellow-400 cursor-pointer"
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
    <div className="glass-card p-5 rounded-xl flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[13px] text-gray-400 uppercase font-bold tracking-wider">{title}</p>
          <Icon className={`w-4 h-4 ${color}`} />
        </div>
        <div className="flex flex-col items-center justify-center py-3 my-1">
          <p className="text-3xl font-bold tracking-tight text-white">{value}</p>
        </div>
      </div>
      {subText && <p className="text-xs text-gray-400 text-center mt-3 pt-2 border-t border-white/5">{subText}</p>}
    </div>
  );
}
