import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, Cell, ComposedChart, Line } from 'recharts';
import { mockTeams, loadStoredPlayers, saveStoredPlayers, Team, Player } from '../data';
import { fetchTeamRosterFromDatabase, DbTeamPlayer, cleanPosition } from '../services/dbService';
import { Loader2, TrendingUp, AlertTriangle, Calculator, Sparkles, Database, RefreshCw, AlertCircle, ArrowUpDown, ArrowUp, ArrowDown, Filter } from 'lucide-react';

interface StatWeight {
  stat: string;
  weight: number;
}

interface AnalysisResult {
  stat_weights: {
    batter: StatWeight[];
    pitcher: StatWeight[];
  };
  overvalued_stat: {
    stat: string;
    reason: string;
  };
  outliers: {
    name: string;
    isOverpaid: boolean;
    reason: string;
  }[];
  player_evaluations: {
    player_name: string;
    calculated_salary: number;
    status: string;
  }[];
}

const formatCurrency = (value: number) => {
  const roundedValue = Math.round(value / 10000) * 10000;
  if (roundedValue >= 100000000) {
    const uk = Math.floor(roundedValue / 100000000);
    const man = Math.floor((roundedValue % 100000000) / 10000);
    if (man > 0) {
      return `${uk}억 ${man.toLocaleString()}만`;
    }
    return `${uk}억`;
  }
  return `${(roundedValue / 10000).toLocaleString()}만`;
};

export default function ReverseEngineering() {
  const [selectedTeam, setSelectedTeam] = useState<Team>(mockTeams[0]);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPlayerForSim, setSelectedPlayerForSim] = useState<Player | null>(null);
  const [selectedScatterPlayer, setSelectedScatterPlayer] = useState<string | null>(null);
  const [players, setPlayers] = useState<Player[]>(loadStoredPlayers);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);

  // 구글 스프레드시트 DB 팀 로스터 상태 및 프론트엔드 캐시
  const [teamDataCache, setTeamDataCache] = useState<Record<string, DbTeamPlayer[]>>({});
  const teamDataCacheRef = useRef<Record<string, DbTeamPlayer[]>>({});
  const [teamRoster, setTeamRoster] = useState<DbTeamPlayer[]>([]);
  const [isRosterLoading, setIsRosterLoading] = useState<boolean>(false);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [isDbLoaded, setIsDbLoaded] = useState<boolean>(false);
  const [teamPayrollMap, setTeamPayrollMap] = useState<Record<string, number>>({});

  // 테이블 정렬 및 필터 상태
  type SortField = 'name' | 'age' | 'position' | 'war' | 'salary' | 'draftYear' | 'serviceTime';
  type SortDirection = 'asc' | 'desc';
  const [sortField, setSortField] = useState<SortField | null>('salary');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [positionFilter, setPositionFilter] = useState<string>('ALL');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortDirection === 'desc') {
        setSortDirection('asc');
      } else {
        setSortField(null);
        setSortDirection('desc');
      }
    } else {
      setSortField(field);
      if (field === 'name' || field === 'position') {
        setSortDirection('asc');
      } else {
        setSortDirection('desc');
      }
    }
  };

  // 정렬 및 필터 적용된 로스터 목록
  const displayedRoster = useMemo(() => {
    let list = [...teamRoster];

    if (positionFilter !== 'ALL') {
      list = list.filter((p) => {
        const clean = cleanPosition(p.position);
        return clean.includes(positionFilter);
      });
    }

    if (sortField) {
      list.sort((a, b) => {
        let valA: any = a[sortField];
        let valB: any = b[sortField];

        if (sortField === 'position') {
          valA = cleanPosition(a.position);
          valB = cleanPosition(b.position);
        } else if (sortField === 'draftYear') {
          valA = typeof a.draftYear === 'number' ? a.draftYear : parseInt(String(a.draftYear)) || 0;
          valB = typeof b.draftYear === 'number' ? b.draftYear : parseInt(String(b.draftYear)) || 0;
        } else if (sortField === 'serviceTime') {
          const matchA = String(a.serviceTime).match(/(\d+)\s*일/);
          const daysA = matchA ? parseInt(matchA[1], 10) : parseInt(String(a.serviceTime).replace(/[^0-9]/g, '')) || 0;
          const matchB = String(b.serviceTime).match(/(\d+)\s*일/);
          const daysB = matchB ? parseInt(matchB[1], 10) : parseInt(String(b.serviceTime).replace(/[^0-9]/g, '')) || 0;
          valA = daysA;
          valB = daysB;
        } else if (sortField === 'age') {
          valA = typeof a.age === 'number' ? a.age : parseInt(String(a.age)) || 0;
          valB = typeof b.age === 'number' ? b.age : parseInt(String(b.age)) || 0;
        }

        if (typeof valA === 'string' && typeof valB === 'string') {
          return sortDirection === 'asc' ? valA.localeCompare(valB, 'ko') : valB.localeCompare(valA, 'ko');
        }

        const numA = Number(valA) || 0;
        const numB = Number(valB) || 0;
        return sortDirection === 'asc' ? numA - numB : numB - numA;
      });
    }

    return list;
  }, [teamRoster, sortField, sortDirection, positionFilter]);

  // 현재 테이블에 표시된 선수들의 연봉 총합 및 평균 연봉 계산
  const rosterTotalSalary = useMemo(() => {
    return displayedRoster.reduce((sum, p) => sum + (p.salary || 0), 0);
  }, [displayedRoster]);

  const rosterPlayerCount = displayedRoster.length;
  const rosterAvgSalary = rosterPlayerCount > 0 ? Math.round(rosterTotalSalary / rosterPlayerCount) : 0;
  const rosterAvgWar = rosterPlayerCount > 0 ? (displayedRoster.reduce((sum, p) => sum + (p.war || 0), 0) / rosterPlayerCount).toFixed(2) : '0.00';

  useEffect(() => {
    const handleUpdate = () => {
      setPlayers(loadStoredPlayers());
    };
    window.addEventListener("kbo_players_updated", handleUpdate);
    return () => window.removeEventListener("kbo_players_updated", handleUpdate);
  }, []);

  // 10개 구단 전체의 로스터 총 연봉 비동기 로드 및 프론트엔드 캐시 사전 구축
  useEffect(() => {
    let isMounted = true;
    const loadAllTeamPayrolls = async () => {
      try {
        const payrolls: Record<string, number> = {};
        const preloaded: Record<string, DbTeamPlayer[]> = {};
        await Promise.all(
          mockTeams.map(async (team) => {
            try {
              const res = await fetchTeamRosterFromDatabase(team.name);
              if (res.success && res.players && res.players.length > 0) {
                const total = res.players.reduce((sum, p) => sum + (p.salary || 0), 0);
                payrolls[team.name] = total;
                preloaded[team.name] = res.players;
              } else if (team.currentPayroll) {
                payrolls[team.name] = team.currentPayroll;
              }
            } catch {
              if (team.currentPayroll) {
                payrolls[team.name] = team.currentPayroll;
              }
            }
          })
        );
        if (isMounted) {
          setTeamPayrollMap((prev) => ({ ...prev, ...payrolls }));
          teamDataCacheRef.current = { ...preloaded, ...teamDataCacheRef.current };
          setTeamDataCache((prev) => ({ ...preloaded, ...prev }));
        }
      } catch (e) {
        console.error("전체 구단 연봉 및 캐시 로드 실패:", e);
      }
    };

    loadAllTeamPayrolls();
    return () => {
      isMounted = false;
    };
  }, []);

  // 현재 활성화된 팀의 로스터가 로드되거나 변경되면 teamPayrollMap에 실시간 반영
  useEffect(() => {
    if (teamRoster.length > 0 && selectedTeam?.name) {
      const currentTeamTotal = teamRoster.reduce((sum, p) => sum + (p.salary || 0), 0);
      setTeamPayrollMap((prev) => {
        if (prev[selectedTeam.name] === currentTeamTotal) return prev;
        return {
          ...prev,
          [selectedTeam.name]: currentTeamTotal
        };
      });
    }
  }, [teamRoster, selectedTeam]);

  /**
   * 좌측 구단 리스트 클릭 또는 새로고침 시 실행되는 로스터 조회 함수
   * @param teamName 조회할 구단명
   * @param forceRefresh true인 경우 캐시를 무시하고 구글 DB에서 실시간 강제 fetch 수행
   */
  const loadTeamRoster = async (teamName: string, forceRefresh = false) => {
    // 1. 캐시 검사 (강제 새로고침이 아닐 때 캐시 데이터가 있으면 fetch 생략하고 즉시 렌더링)
    const cachedPlayers = teamDataCacheRef.current[teamName] || teamDataCache[teamName];
    if (!forceRefresh && cachedPlayers && cachedPlayers.length > 0) {
      console.log(`⚡ [Cache Hit] '${teamName}' 구단 데이터 캐시 즉시 렌더링 (${cachedPlayers.length}명)`);
      setTeamRoster(cachedPlayers);
      setIsDbLoaded(true);
      setIsRosterLoading(false);
      setRosterError(null);
      return;
    }

    // 2. 캐시 미스 또는 강제 새로고침인 경우: fetch 통신 실행
    console.log(`🌐 [DB Fetch] '${teamName}' 구단 데이터 서버 요청 (강제 새로고침: ${forceRefresh})`);
    setIsRosterLoading(true);
    setRosterError(null);
    try {
      const res = await fetchTeamRosterFromDatabase(teamName);
      if (res.success && res.players && res.players.length > 0) {
        // React 상태 및 프론트엔드 캐시 업데이트
        teamDataCacheRef.current[teamName] = res.players;
        setTeamDataCache((prev) => ({
          ...prev,
          [teamName]: res.players
        }));
        setTeamRoster(res.players);
        setIsDbLoaded(true);

        const currentTotal = res.players.reduce((sum, p) => sum + (p.salary || 0), 0);
        setTeamPayrollMap((prev) => ({
          ...prev,
          [teamName]: currentTotal
        }));
      } else {
        // DB에 없을 경우 로컬 플레이어 데이터셋에서 필터링하여 폴백 제공
        const localTeamPlayers = players.filter((p) => p.team === teamName || p.team.includes(teamName.replace(/^[A-Z\s]+/, '')));
        if (localTeamPlayers.length > 0) {
          const convertedLocal: DbTeamPlayer[] = localTeamPlayers.map((p) => ({
            id: p.id,
            name: p.name,
            age: p.age,
            position: p.position,
            war: p.stats[p.stats.length - 1]?.war ?? 0,
            salary: p.salaryCurrent,
            draftYear: p.draftYear,
            serviceTime: p.serviceTime || "3년 0일",
            team: p.team
          }));
          teamDataCacheRef.current[teamName] = convertedLocal;
          setTeamDataCache((prev) => ({
            ...prev,
            [teamName]: convertedLocal
          }));
          setTeamRoster(convertedLocal);
          setIsDbLoaded(false);
        } else {
          setTeamRoster([]);
          setIsDbLoaded(false);
          setRosterError(res.error || `'${teamName}' 구단에 등록된 선수가 구글 DB에 없습니다.`);
        }
      }
    } catch (err: any) {
      console.error(err);
      setRosterError(`DB 로스터 조회 오류: ${err.message}`);
      setTeamRoster([]);
      setIsDbLoaded(false);
    } finally {
      setIsRosterLoading(false);
    }
  };

  // 선택된 구단이 변경될 때 자동으로 로스터 호출 (캐시 우선 확인)
  useEffect(() => {
    loadTeamRoster(selectedTeam.name, false);
    setAnalysisResult(null);
    setSelectedScatterPlayer(null);
  }, [selectedTeam.name]);

  useEffect(() => {
    if (players.length > 0) {
      setSelectedPlayerForSim(players[0]);
    }
  }, [players]);

  const handleDeletePlayer = (id?: string) => {
    if (!id) return;
    if (confirm('이 선수를 로스터에서 삭제하시겠습니까?')) {
      const updated = players.filter(p => p.id !== id);
      setPlayers(updated);
      saveStoredPlayers(updated);
      setTeamRoster(prev => {
        const nextList = prev.filter(p => p.id !== id);
        teamDataCacheRef.current[selectedTeam.name] = nextList;
        setTeamDataCache(cache => ({ ...cache, [selectedTeam.name]: nextList }));
        return nextList;
      });
      if (selectedPlayerForSim?.id === id) setSelectedPlayerForSim(null);
    }
  };

  const handleEditPlayer = (player: DbTeamPlayer) => {
    const matched = players.find(p => p.name === player.name) || {
      id: player.id || `temp_${Date.now()}`,
      name: player.name,
      team: selectedTeam.name,
      position: player.position,
      age: player.age,
      salaryCurrent: player.salary,
      draftYear: player.draftYear,
      serviceTime: player.serviceTime,
      stats: [{ year: 2026, war: player.war, salary: player.salary }]
    };
    setEditingPlayer({ ...matched });
  };

  const handleSavePlayer = (updatedPlayer: Player) => {
    const updated = players.map(p => p.id === updatedPlayer.id ? updatedPlayer : p);
    setPlayers(updated);
    saveStoredPlayers(updated);
    
    // 로스터 테이블 및 캐시에도 실시간 반영
    setTeamRoster(prev => {
      const nextList = prev.map(p => {
        if (p.name === updatedPlayer.name || p.id === updatedPlayer.id) {
          return {
            ...p,
            name: updatedPlayer.name,
            age: updatedPlayer.age,
            position: updatedPlayer.position,
            war: updatedPlayer.stats[updatedPlayer.stats.length - 1]?.war ?? p.war,
            salary: updatedPlayer.salaryCurrent,
            draftYear: updatedPlayer.draftYear,
            serviceTime: updatedPlayer.serviceTime
          };
        }
        return p;
      });
      teamDataCacheRef.current[selectedTeam.name] = nextList;
      setTeamDataCache(cache => ({ ...cache, [selectedTeam.name]: nextList }));
      return nextList;
    });

    setEditingPlayer(null);
    if (selectedPlayerForSim?.id === updatedPlayer.id) {
      setSelectedPlayerForSim(updatedPlayer);
    }
  };

  const fetchAnalysis = async (team: Team) => {
    setIsLoading(true);
    try {
      const teamPlayers = teamRoster.length > 0
        ? teamRoster.map(p => ({
            id: p.id || p.name,
            name: p.name,
            team: team.name,
            position: p.position,
            age: p.age,
            salaryCurrent: p.salary,
            draftYear: p.draftYear,
            serviceTime: p.serviceTime,
            stats: [{ year: 2026, war: p.war, salary: p.salary }]
          }))
        : players.filter(p => p.team === team.name) || players;
      
      const response = await fetch('/api/gemini/reverse-engineer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          teamName: team.name,
          batterData: teamPlayers,
          pitcherData: []
        })
      });
      
      if (!response.ok) throw new Error('Failed to fetch analysis');
      const data = await response.json();
      setAnalysisResult(data.result);
    } catch (error) {
      console.error(error);
      setAnalysisResult({
        stat_weights: {
          batter: [
            { stat: 'wRC+', weight: 45 },
            { stat: 'WAR', weight: 35 },
            { stat: 'OPS', weight: 20 },
          ],
          pitcher: [
            { stat: 'WAR', weight: 50 },
            { stat: 'ERA+', weight: 30 },
            { stat: 'FIP', weight: 20 },
          ]
        },
        overvalued_stat: {
          stat: '불펜 홀드/세이브',
          reason: '최근 3년간 불펜 과부하로 인해 필승조에 프리미엄을 부여하는 경향이 강함.'
        },
        outliers: [
          { name: '노시환', isOverpaid: false, reason: '스탯 대비 연차 보상(서비스 타임) 한계로 인해 리그 평균보다 적은 연봉 수령 중.' },
          { name: '최정', isOverpaid: true, reason: '프랜차이즈 스타 프리미엄 및 장기 FA 계약의 영향으로 스탯 대비 연봉이 높게 책정됨.' }
        ],
        player_evaluations: teamRoster.map(p => ({
          player_name: p.name,
          calculated_salary: p.war * 130000000,
          status: p.salary > p.war * 130000000 * 1.2 ? 'Premium' : p.salary < p.war * 130000000 * 0.8 ? 'Underpaid' : 'Fair'
        }))
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Scatter plot data mapping
  const scatterData = teamRoster.length > 0
    ? teamRoster.map(p => ({
        name: p.name,
        war: p.war,
        salary: p.salary
      }))
    : players.filter(p => p.team === selectedTeam.name).map(p => ({
        name: p.name,
        war: p.stats[p.stats.length - 1]?.war ?? 0,
        salary: p.salaryCurrent
      }));

  const handleScatterClick = (data: any) => {
    if (data && data.name) {
      setSelectedScatterPlayer(data.name);
      const row = document.getElementById(`player-row-${data.name}`);
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  };

  const sortedTeams = useMemo(() => {
    return mockTeams.map((team) => {
      const isSelected = selectedTeam.id === team.id;
      // 선택된 팀인 경우 현재 로스터 테이블의 실제 총 연봉을 최우선 연동
      let totalPayroll: number;
      if (isSelected && teamRoster.length > 0) {
        totalPayroll = teamRoster.reduce((sum, p) => sum + (p.salary || 0), 0);
      } else if (teamPayrollMap[team.name] !== undefined) {
        totalPayroll = teamPayrollMap[team.name];
      } else {
        totalPayroll = team.currentPayroll || 0;
      }
      return { ...team, calculatedPayroll: totalPayroll };
    });
  }, [teamPayrollMap, selectedTeam.id, selectedTeam.name, teamRoster]);

  return (
    <div className="flex h-full w-full bg-dark-main overflow-hidden text-gray-200">
      {/* 좌측 25%: 구단 선택 패널 */}
      <div className="w-1/4 min-w-[250px] border-r border-white/5 bg-dark-aside flex flex-col">
        <div className="p-5 border-b border-white/5">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-gold" />
            구단 연봉 산정 역산
          </h2>
          <p className="text-xs text-gray-400 mt-2 tracking-tight leading-relaxed">
            AI가 구단의 연봉 협상 기준을 역추적하여 가장 가중치가 높은 스탯을 분석합니다.
          </p>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {sortedTeams.map((team) => {
            const isSelected = selectedTeam.id === team.id;
            return (
              <button
                key={team.id}
                onClick={() => setSelectedTeam(team)}
                className={`w-full text-left px-4 py-3 rounded-xl transition-all duration-300 ${
                  isSelected
                    ? 'bg-gold/10 border border-gold/30 text-white shadow-sm'
                    : 'bg-black/20 border border-white/5 text-gray-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="font-bold">{team.name}</div>
                  {isSelected && (
                    <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse" />
                  )}
                </div>
                <div className="text-xs mt-1 font-medium flex items-center justify-between">
                  <span className="opacity-70">총 연봉:</span>
                  <span className={`font-mono ${isSelected ? 'text-gold font-bold' : 'text-gray-300'}`}>
                    {team.calculatedPayroll > 0 ? formatCurrency(team.calculatedPayroll) : '조회 중...'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 우측 75%: 대시보드 */}
      <div className="w-3/4 flex flex-col h-full overflow-y-auto p-6 gap-6 bg-dark-bg">
        {/* 최상단: 인터랙티브 로스터 테이블 */}
        <div className="min-h-[350px] bg-black/40 border border-white/5 rounded-2xl flex flex-col overflow-hidden shrink-0">
          <div className="p-5 border-b border-white/5 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">인터랙티브 로스터 테이블 ({selectedTeam.name})</h3>
                {isDbLoaded ? (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-semibold font-mono flex items-center gap-1">
                    <Database className="w-3 h-3" />
                    Google DB 실시간 연동
                  </span>
                ) : (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-400 font-semibold font-mono">
                    로컬/기본 로스터
                  </span>
                )}
              </div>

              {/* 제목 영역: 연봉 총합 및 평균 연봉 표시 */}
              <div className="flex items-center gap-2.5 bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg text-xs">
                <div className="flex items-center gap-1.5 text-gray-300">
                  <span className="text-gray-400">총 연봉:</span>
                  <span className="font-bold text-gold">{formatCurrency(rosterTotalSalary)}</span>
                </div>
                <span className="text-white/20">|</span>
                <div className="flex items-center gap-1.5 text-gray-300">
                  <span className="text-gray-400">평균 연봉:</span>
                  <span className="font-bold text-emerald-400">{formatCurrency(rosterAvgSalary)}</span>
                  <span className="text-[11px] text-gray-400 font-mono">({rosterPlayerCount}명)</span>
                </div>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              {/* 포지션 필터 */}
              <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-lg p-1 text-xs">
                <Filter className="w-3.5 h-3.5 text-gray-400 ml-1" />
                <select
                  value={positionFilter}
                  onChange={(e) => setPositionFilter(e.target.value)}
                  className="bg-transparent text-gray-200 text-xs px-2 py-1 font-medium focus:outline-none cursor-pointer"
                  title="포지션 필터"
                >
                  <option value="ALL" className="bg-dark-bg text-gray-200">전체 포지션</option>
                  <option value="투수" className="bg-dark-bg text-gray-200">투수</option>
                  <option value="포수" className="bg-dark-bg text-gray-200">포수</option>
                  <option value="내야수" className="bg-dark-bg text-gray-200">내야수</option>
                  <option value="외야수" className="bg-dark-bg text-gray-200">외야수</option>
                </select>
              </div>

              <button
                onClick={() => loadTeamRoster(selectedTeam.name, true)}
                disabled={isRosterLoading}
                title="구글 DB 최신 로스터 강제 새로고침 (캐시 갱신)"
                className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRosterLoading ? 'animate-spin text-gold' : ''}`} />
                <span>새로고침</span>
              </button>

              {!analysisResult && !isLoading && (
                <button 
                  onClick={() => fetchAnalysis(selectedTeam)}
                  className="flex items-center gap-2 bg-gold/10 hover:bg-gold/20 text-gold border border-gold/30 px-4 py-2 rounded-lg text-sm font-bold transition-colors cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  AI 구단 성향 진단 시작
                </button>
              )}
            </div>

          </div>
          <div className="flex-1 overflow-y-auto max-h-[420px]">
            <table className="w-full text-center text-xs text-gray-300">
              <thead className="bg-black/50 text-xs uppercase text-gray-500 sticky top-0 z-10 border-b border-white/5">
                <tr>
                  <th 
                    onClick={() => handleSort('name')}
                    className="px-2 py-2.5 font-bold text-center select-none cursor-pointer hover:bg-white/5 hover:text-white transition-colors group whitespace-nowrap"
                    title="선수명 정렬"
                  >
                    <div className="flex items-center justify-center gap-1 whitespace-nowrap">
                      <span className={sortField === 'name' ? 'text-gold' : 'text-gray-400 group-hover:text-gray-200'}>선수명</span>
                      {sortField === 'name' ? (
                        sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-gold shrink-0" /> : <ArrowDown className="w-3 h-3 text-gold shrink-0" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                      )}
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('age')}
                    className="px-1.5 py-2.5 font-bold text-center select-none cursor-pointer hover:bg-white/5 hover:text-white transition-colors group whitespace-nowrap"
                    title="나이 정렬"
                  >
                    <div className="flex items-center justify-center gap-1 whitespace-nowrap">
                      <span className={sortField === 'age' ? 'text-gold' : 'text-gray-400 group-hover:text-gray-200'}>나이</span>
                      {sortField === 'age' ? (
                        sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-gold shrink-0" /> : <ArrowDown className="w-3 h-3 text-gold shrink-0" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                      )}
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('position')}
                    className="px-2 py-2.5 font-bold text-center select-none cursor-pointer hover:bg-white/5 hover:text-white transition-colors group whitespace-nowrap"
                    title="포지션 정렬"
                  >
                    <div className="flex items-center justify-center gap-1 whitespace-nowrap">
                      <span className={sortField === 'position' ? 'text-gold' : 'text-gray-400 group-hover:text-gray-200'}>포지션</span>
                      {sortField === 'position' ? (
                        sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-gold shrink-0" /> : <ArrowDown className="w-3 h-3 text-gold shrink-0" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                      )}
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('war')}
                    className="px-2 py-2.5 font-bold text-center select-none cursor-pointer hover:bg-white/5 hover:text-white transition-colors group whitespace-nowrap"
                    title="핵심 스탯(WAR) 정렬"
                  >
                    <div className="flex items-center justify-center gap-1 whitespace-nowrap">
                      <span className={sortField === 'war' ? 'text-gold' : 'text-gray-400 group-hover:text-gray-200'}>핵심 스탯(WAR)</span>
                      {sortField === 'war' ? (
                        sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-gold shrink-0" /> : <ArrowDown className="w-3 h-3 text-gold shrink-0" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                      )}
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('salary')}
                    className="px-2.5 py-2.5 font-bold text-center select-none cursor-pointer hover:bg-white/5 hover:text-white transition-colors group whitespace-nowrap"
                    title="현재 연봉 정렬"
                  >
                    <div className="flex items-center justify-center gap-1 whitespace-nowrap">
                      <span className={sortField === 'salary' ? 'text-gold' : 'text-gray-400 group-hover:text-gray-200'}>현재 연봉</span>
                      {sortField === 'salary' ? (
                        sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-gold shrink-0" /> : <ArrowDown className="w-3 h-3 text-gold shrink-0" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                      )}
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('draftYear')}
                    className="px-2 py-2.5 font-bold text-center select-none cursor-pointer hover:bg-white/5 hover:text-white transition-colors group whitespace-nowrap"
                    title="입단 연도 정렬"
                  >
                    <div className="flex items-center justify-center gap-1 whitespace-nowrap">
                      <span className={sortField === 'draftYear' ? 'text-gold' : 'text-gray-400 group-hover:text-gray-200'}>입단 연도</span>
                      {sortField === 'draftYear' ? (
                        sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-gold shrink-0" /> : <ArrowDown className="w-3 h-3 text-gold shrink-0" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                      )}
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('serviceTime')}
                    className="px-2 py-2.5 font-bold text-center select-none cursor-pointer hover:bg-white/5 hover:text-white transition-colors group whitespace-nowrap"
                    title="등록일수 정렬"
                  >
                    <div className="flex items-center justify-center gap-1 whitespace-nowrap">
                      <span className={sortField === 'serviceTime' ? 'text-gold' : 'text-gray-400 group-hover:text-gray-200'}>등록일수</span>
                      {sortField === 'serviceTime' ? (
                        sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-gold shrink-0" /> : <ArrowDown className="w-3 h-3 text-gold shrink-0" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                      )}
                    </div>
                  </th>
                  <th className="px-2 py-2.5 font-bold text-center whitespace-nowrap">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {isRosterLoading ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-gray-400">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Loader2 className="w-6 h-6 animate-spin text-gold" />
                        <span className="text-sm font-medium">Google 스프레드시트 DB에서 '{selectedTeam.name}' 선수단 로스터를 조회 중입니다...</span>
                      </div>
                    </td>
                  </tr>
                ) : displayedRoster.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-gray-400">
                      <div className="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto">
                        <AlertCircle className="w-6 h-6 text-amber-400" />
                        <span className="text-sm font-bold text-gray-300">
                          {teamRoster.length > 0 && positionFilter !== 'ALL' 
                            ? `'${positionFilter}' 포지션에 해당하는 선수가 없습니다` 
                            : '해당 구단에 등록된 선수가 없습니다'}
                        </span>
                        <p className="text-xs text-gray-500">
                          {rosterError || `'${selectedTeam.name}' 소속 선수가 구글 스프레드시트 DB에 존재하지 않습니다.`}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  displayedRoster.map((pData, idx) => {
                    const warText = pData.war != null ? pData.war.toFixed(1) : '-';
                    const isSelected = selectedScatterPlayer === pData.name;
                    const posText = cleanPosition(pData.position);
                    
                    return (
                      <tr 
                        key={idx}
                        id={`player-row-${pData.name}`}
                        className={`transition-colors duration-300 hover:bg-white/5 ${isSelected ? 'bg-gold/10 border-l-2 border-gold' : 'border-l-2 border-transparent'}`}
                      >
                        <td className="px-2 py-2.5 font-bold text-white text-xs font-sans text-center whitespace-nowrap">{pData.name}</td>
                        <td className="px-1.5 py-2.5 text-xs font-sans text-center whitespace-nowrap text-gray-300">{pData.age}</td>
                        <td className="px-2 py-2.5 text-xs font-sans text-center whitespace-nowrap font-medium text-gray-200">{posText}</td>
                        <td className="px-2 py-2.5 text-xs font-sans text-center text-gold font-semibold whitespace-nowrap">{warText}</td>
                        <td className="px-2.5 py-2.5 text-xs font-sans text-center font-medium whitespace-nowrap">{formatCurrency(pData.salary)}</td>
                        <td className="px-2 py-2.5 text-xs font-sans text-center whitespace-nowrap text-gray-300">{pData.draftYearDisplay || (typeof pData.draftYear === 'number' ? `${pData.draftYear}년` : pData.draftYear)}</td>
                        <td className="px-2 py-2.5 text-xs font-sans text-center whitespace-nowrap text-gray-300">{pData.serviceTime}</td>
                        <td className="px-2 py-2.5 text-center whitespace-nowrap text-xs font-sans">
                          <button onClick={() => handleEditPlayer(pData)} className="text-blue-400 hover:text-blue-300 mr-2 text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap">수정</button>
                          <button onClick={() => handleDeletePlayer(pData.id)} className="text-red-400 hover:text-red-300 text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap">삭제</button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {displayedRoster.length > 0 && (
                <tfoot className="bg-black/60 border-t border-white/10 font-medium text-xs text-gray-300 sticky bottom-0 z-10 backdrop-blur-sm">
                  <tr>
                    <td className="px-2 py-2.5 font-bold text-white text-center whitespace-nowrap">
                      합계 / 평균 ({rosterPlayerCount}명)
                    </td>
                    <td className="px-1.5 py-2.5 text-center text-gray-400 whitespace-nowrap">
                      {rosterPlayerCount > 0 ? `${(displayedRoster.reduce((sum, p) => sum + (typeof p.age === 'number' ? p.age : parseInt(String(p.age)) || 26), 0) / rosterPlayerCount).toFixed(1)}세` : '-'}
                    </td>
                    <td className="px-2 py-2.5 text-center text-gray-400 whitespace-nowrap">
                      {positionFilter === 'ALL' ? '전체' : positionFilter}
                    </td>
                    <td className="px-2 py-2.5 text-center font-bold text-gold whitespace-nowrap">
                      평균 {rosterAvgWar}
                    </td>
                    <td className="px-2.5 py-2.5 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1 whitespace-nowrap">
                        <span className="font-bold text-gold text-xs">{formatCurrency(rosterTotalSalary)}</span>
                        <span className="text-[10px] text-emerald-400 font-semibold">(평균 {formatCurrency(rosterAvgSalary)})</span>
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-center text-gray-500 whitespace-nowrap">-</td>
                    <td className="px-2 py-2.5 text-center text-gray-500 whitespace-nowrap">-</td>
                    <td className="px-2 py-2.5 text-center text-gray-500 whitespace-nowrap">-</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* 테이블 아랫 쪽: 총합 및 평균 연봉 요약 바 */}
          <div className="p-3.5 bg-black/60 border-t border-white/5 flex flex-wrap items-center justify-between gap-4 text-xs text-gray-400">
            <div className="flex items-center gap-2">
              <span className="text-gray-400">선수단 인원:</span>
              <span className="font-bold text-white font-mono">{rosterPlayerCount}명</span>
              {positionFilter !== 'ALL' && <span className="text-gold font-medium">({positionFilter} 필터 적용)</span>}
              {sortField && (
                <span className="text-gray-500 text-[11px] ml-1">
                  • 정렬: {sortField === 'name' ? '선수명' : sortField === 'age' ? '나이' : sortField === 'position' ? '포지션' : sortField === 'war' ? 'WAR' : sortField === 'salary' ? '현재 연봉' : sortField === 'draftYear' ? '입단 연도' : '등록일수'} ({sortDirection === 'asc' ? '오름차순 ↑' : '내림차순 ↓'})
                </span>
              )}
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <span className="text-gray-400">현재 연봉 총합:</span>
                <span className="font-bold text-gold text-sm font-mono">{formatCurrency(rosterTotalSalary)}</span>
              </div>
              <span className="text-white/20">|</span>
              <div className="flex items-center gap-1.5">
                <span className="text-gray-400">선수 1인당 평균 연봉:</span>
                <span className="font-bold text-emerald-400 text-sm font-mono">{formatCurrency(rosterAvgSalary)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* AI Analysis Sections */}
        {isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500 gap-4 min-h-[200px]">
            <Loader2 className="w-8 h-8 animate-spin text-gold" />
            <p>AI 모델이 {selectedTeam.name}의 연봉 구조를 역산하고 있습니다...</p>
          </div>
        ) : analysisResult ? (
          <>
            {/* 상단: 스탯 가중치 분석 */}
            <div className="grid grid-cols-2 gap-6 min-h-[200px]">
              <div className="bg-black/40 border border-white/5 rounded-2xl p-4 flex flex-col">
                <h3 className="text-xs uppercase tracking-widest font-bold text-gray-400 mb-4 text-center">타자 연봉 가중치 추정</h3>
                <div className="flex-1 min-h-[120px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analysisResult.stat_weights.batter} layout="vertical" margin={{ top: 0, right: 30, left: 10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="rgba(255,255,255,0.05)" />
                      <XAxis type="number" hide />
                      <YAxis dataKey="stat" type="category" stroke="#9ca3af" tick={{ fill: '#9ca3af', fontSize: 12, fontWeight: 'bold' }} width={60} axisLine={false} tickLine={false} />
                      <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ backgroundColor: '#111318', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px' }} />
                      <Bar dataKey="weight" radius={[0, 4, 4, 0]} barSize={24}>
                        {analysisResult.stat_weights.batter.map((entry, index) => (
                          <Cell key={index} fill={index === 0 ? '#d4af37' : '#3b82f6'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="bg-black/40 border border-white/5 rounded-2xl p-4 flex flex-col">
                <h3 className="text-xs uppercase tracking-widest font-bold text-gray-400 mb-4 text-center">투수 연봉 가중치 추정</h3>
                <div className="flex-1 min-h-[120px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analysisResult.stat_weights.pitcher} layout="vertical" margin={{ top: 0, right: 30, left: 10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="rgba(255,255,255,0.05)" />
                      <XAxis type="number" hide />
                      <YAxis dataKey="stat" type="category" stroke="#9ca3af" tick={{ fill: '#9ca3af', fontSize: 12, fontWeight: 'bold' }} width={60} axisLine={false} tickLine={false} />
                      <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ backgroundColor: '#111318', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px' }} />
                      <Bar dataKey="weight" radius={[0, 4, 4, 0]} barSize={24}>
                        {analysisResult.stat_weights.pitcher.map((entry, index) => (
                          <Cell key={index} fill={index === 0 ? '#d4af37' : '#10b981'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* 중단: 연봉-성적 기준선 (Scatter) */}
            <div className="min-h-[350px] bg-black/40 border border-white/5 rounded-2xl p-5 flex flex-col relative overflow-hidden">
              <div className="absolute top-5 right-5 text-xs text-gray-500 flex gap-4">
                <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-red-400"></span>Overpay</div>
                <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-blue-400"></span>Underpay</div>
              </div>
              <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-gold" />
                {selectedTeam.name} 연봉-WAR 기준선 (Trend Line)
              </h3>
              <div className="flex-1 min-h-0 mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={scatterData} margin={{ top: 10, right: 20, bottom: 0, left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis type="number" dataKey="war" name="WAR" stroke="#6b7280" tick={{ fill: '#9ca3af', fontSize: 12 }} domain={['dataMin - 1', 'dataMax + 1']} />
                    <YAxis type="number" dataKey="salary" name="Salary" tickFormatter={formatCurrency} stroke="#6b7280" tick={{ fill: '#9ca3af', fontSize: 12 }} />
                    <Tooltip 
                      cursor={{ strokeDasharray: '3 3' }}
                      formatter={(val: number, name: string) => name === 'Salary' ? [formatCurrency(val), '연봉'] : [val, name]}
                      contentStyle={{ backgroundColor: '#111318', borderColor: 'rgba(255,255,255,0.1)', color: '#fff' }}
                    />
                    <Scatter name="선수" data={scatterData} fill="#8884d8" onClick={handleScatterClick} style={{ cursor: 'pointer' }}>
                      {scatterData.map((entry, index) => {
                        const expected = entry.war * selectedTeam.costPerWar;
                        const color = entry.salary > expected * 1.2 ? '#f87171' : entry.salary < expected * 0.8 ? '#60a5fa' : '#9ca3af';
                        return <Cell key={`cell-${index}`} fill={color} />;
                      })}
                    </Scatter>
                    <Line type="monotone" dataKey="salary" stroke="#d4af37" strokeWidth={2} dot={false} strokeDasharray="5 5" opacity={0.5} activeDot={false} name="기준선(추정)" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 하단: 시뮬레이터 & 아웃라이어 */}
            <div className="min-h-[250px] grid grid-cols-2 gap-6">
              {/* 시뮬레이터 */}
              <div className="bg-black/40 border border-white/5 rounded-2xl p-5 flex flex-col">
                <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-blue-400" />
                  타 구단 기준 대입 시뮬레이터
                </h3>
                <div className="flex items-center gap-4 mb-4">
                  <select 
                    className="bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white flex-1 focus:outline-none focus:border-gold"
                    value={selectedPlayerForSim?.id}
                    onChange={(e) => setSelectedPlayerForSim(players.find(p => p.id === e.target.value) || null)}
                  >
                    {players.filter(p => p.team === selectedTeam.name).map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.team})</option>
                    ))}
                  </select>
                </div>
                {selectedPlayerForSim && (
                  <div className="flex-1 bg-gradient-to-br from-blue-900/20 to-black/20 rounded-xl p-4 border border-blue-500/20 flex flex-col justify-center items-center relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl"></div>
                    <div className="text-xs text-blue-300 mb-1">{selectedTeam.name} 기준 가치 환산</div>
                    <div className="text-3xl font-black text-white tracking-tight">
                      {formatCurrency(selectedPlayerForSim.stats[selectedPlayerForSim.stats.length - 1].war * selectedTeam.costPerWar)}
                      <span className="text-sm text-gray-500 font-normal ml-2 tracking-normal">예상</span>
                    </div>
                    <div className="text-xs text-gray-400 mt-2">
                      현재 연봉: {formatCurrency(selectedPlayerForSim.salaryCurrent)}
                    </div>
                  </div>
                )}
              </div>

              {/* 아웃라이어 분석 리포트 */}
              <div className="bg-black/40 border border-white/5 rounded-2xl p-5 flex flex-col overflow-hidden">
                <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  아웃라이어 분석 리포트
                </h3>
                <div className="flex-1 overflow-y-auto pr-2 space-y-3">
                  {analysisResult.outliers.map((outlier, idx) => (
                    <div key={idx} className="bg-black/30 border border-white/5 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-bold text-white text-sm">{outlier.name}</div>
                        <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded-full ${outlier.isOverpaid ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'}`}>
                          {outlier.isOverpaid ? 'Overpaid' : 'Underpaid'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 leading-relaxed">
                        {outlier.reason}
                      </p>
                    </div>
                  ))}
                  
                  <div className="bg-gold/10 border border-gold/20 rounded-xl p-3 mt-4">
                    <div className="text-[11px] uppercase tracking-widest font-bold text-gold mb-1">Overvalued Stat</div>
                    <div className="text-white text-sm font-bold mb-1">{analysisResult.overvalued_stat.stat}</div>
                    <p className="text-xs text-gray-300/80 leading-relaxed">
                      {analysisResult.overvalued_stat.reason}
                    </p>
                  </div>
                </div>
              </div>
            </div>

          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-600 gap-4 min-h-[200px] border-2 border-dashed border-white/5 rounded-2xl">
            <Sparkles className="w-8 h-8 text-white/10" />
            <p className="text-sm">상단의 <span className="font-bold text-gold/70">AI 구단 성향 진단 시작</span> 버튼을 눌러 연봉 산정 기준을 역산해보세요.</p>
          </div>
        )}
      </div>

      {/* Edit Player Modal */}
      {editingPlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-dark-bg border border-white/10 rounded-2xl p-6 flex flex-col max-w-md w-full mx-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-gold" />
              선수 정보 수정
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">선수명</label>
                <input 
                  type="text" 
                  value={editingPlayer.name}
                  onChange={e => setEditingPlayer({...editingPlayer, name: e.target.value})}
                  className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1">나이</label>
                  <input 
                    type="number" 
                    value={editingPlayer.age}
                    onChange={e => setEditingPlayer({...editingPlayer, age: parseInt(e.target.value) || 0})}
                    className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1">포지션</label>
                  <input 
                    type="text" 
                    value={editingPlayer.position}
                    onChange={e => setEditingPlayer({...editingPlayer, position: e.target.value})}
                    className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1">입단 연도</label>
                  <input 
                    type="number" 
                    value={editingPlayer.draftYear}
                    onChange={e => setEditingPlayer({...editingPlayer, draftYear: parseInt(e.target.value) || 0})}
                    className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1">등록일수 (년/일)</label>
                  <input 
                    type="text" 
                    value={editingPlayer.serviceTime}
                    onChange={e => setEditingPlayer({...editingPlayer, serviceTime: e.target.value})}
                    className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">현재 연봉</label>
                <input 
                  type="number" 
                  value={editingPlayer.salaryCurrent}
                  onChange={e => setEditingPlayer({...editingPlayer, salaryCurrent: parseInt(e.target.value) || 0})}
                  className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button 
                onClick={() => setEditingPlayer(null)}
                className="px-4 py-2 rounded-lg text-sm font-bold text-gray-400 hover:text-white transition-colors"
              >
                취소
              </button>
              <button 
                onClick={() => handleSavePlayer(editingPlayer)}
                className="px-4 py-2 rounded-lg text-sm font-bold bg-gold/20 text-gold hover:bg-gold/30 transition-colors"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
