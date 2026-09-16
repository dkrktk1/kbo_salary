import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, Cell, ComposedChart, Line } from 'recharts';
import { mockTeams, loadStoredPlayers, saveStoredPlayers, Team, Player } from '../data';
import { fetchTeamRosterFromDatabase, DbTeamPlayer, cleanPosition, parsePlayerSalaryToManwon, parseServiceTimeFaStatus } from '../services/dbService';
import { Loader2, TrendingUp, AlertTriangle, Calculator, Sparkles, Database, RefreshCw, AlertCircle, ArrowUpDown, ArrowUp, ArrowDown, Filter, Search, X } from 'lucide-react';

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

/**
 * 연봉 포맷터 함수
 * - 들어오는 값을 '만원' 단위 순수 숫자(예: 9500 -> 9,500만 / 105000 -> 10억 5,000만)로 가정
 * - 억, 만 단위로 깔끔하게 분리하여 반환
 */
export const formatCurrency = (valueManwon: number | string | undefined | null): string => {
  if (valueManwon === undefined || valueManwon === null || valueManwon === "") return "0만";
  let num = typeof valueManwon === "number" ? valueManwon : parseFloat(String(valueManwon).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  if (isNaN(num) || num === 0) return "0만";

  // 혹시라도 500억원 초과의 비정상적인 숫자가 유입될 경우 복원
  while (Math.abs(num) > 50000000000) {
    num = num / 10000;
  }
  // 5,000,000 이상(원 단위)의 숫자가 유입될 경우 만원 단위로 복원 (예: 60,000,000원 -> 6,000만원)
  while (Math.abs(num) >= 5000000) {
    num = num / 10000;
  }

  const isNegative = num < 0;
  const absVal = Math.round(Math.abs(num));
  const sign = isNegative ? "-" : "";

  // 1억원 = 10,000만원
  if (absVal >= 10000) {
    const uk = Math.floor(absVal / 10000);
    const man = absVal % 10000;
    if (man > 0) {
      return `${sign}${uk.toLocaleString()}억 ${man.toLocaleString()}만`;
    }
    return `${sign}${uk.toLocaleString()}억`;
  }

  return `${sign}${absVal.toLocaleString()}만`;
};

const SESSION_STORAGE_KEY = 'teamTendencyData';

// sessionStorage 헬퍼 함수
const getStoredTendencyData = (): Record<string, DbTeamPlayer[]> | null => {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      const data: Record<string, DbTeamPlayer[]> = (parsed.rosters && typeof parsed.rosters === 'object') ? parsed.rosters : parsed;
      // DB에서 가져온 순수 숫자(만원 단위, 예: 9500) 형태 그대로 캐시 보존 (곱하기 연산 없음)
      const normalized: Record<string, DbTeamPlayer[]> = {};
      Object.entries(data).forEach(([teamName, list]) => {
        if (Array.isArray(list)) {
          normalized[teamName] = list
            .map((p) => ({
              ...p,
              salary: parsePlayerSalaryToManwon(p.salary)
            }))
            .filter((p) => typeof p.salary === 'number' && p.salary > 0);
        }
      });
      return normalized;
    }
  } catch (e) {
    console.error("sessionStorage 'teamTendencyData' 로드 오류:", e);
  }
  return null;
};

const saveStoredTendencyData = (data: Record<string, DbTeamPlayer[]>) => {
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error("sessionStorage 'teamTendencyData' 저장 오류:", e);
  }
};

export default function ReverseEngineering() {
  const [selectedTeam, setSelectedTeam] = useState<Team>(() => {
    const initialSorted = [...mockTeams].sort((a, b) => (b.currentPayroll || 0) - (a.currentPayroll || 0));
    return initialSorted[0] || mockTeams[0];
  });
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPlayerForSim, setSelectedPlayerForSim] = useState<Player | null>(null);
  const [selectedScatterPlayer, setSelectedScatterPlayer] = useState<string | null>(null);
  const [players, setPlayers] = useState<Player[]>(loadStoredPlayers);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);

  // 구글 스프레드시트 DB 팀 로스터 상태 및 프론트엔드/세션스토리지 캐시
  const [teamDataCache, setTeamDataCache] = useState<Record<string, DbTeamPlayer[]>>(() => {
    return getStoredTendencyData() || {};
  });
  const teamDataCacheRef = useRef<Record<string, DbTeamPlayer[]>>(getStoredTendencyData() || {});
  const [teamRoster, setTeamRoster] = useState<DbTeamPlayer[]>(() => {
    const cached = getStoredTendencyData();
    const initialSorted = [...mockTeams].sort((a, b) => (b.currentPayroll || 0) - (a.currentPayroll || 0));
    const defaultTeam = initialSorted[0] || mockTeams[0];
    if (cached && cached[defaultTeam.name] && cached[defaultTeam.name].length > 0) {
      return cached[defaultTeam.name];
    }
    return [];
  });
  const [isRosterLoading, setIsRosterLoading] = useState<boolean>(false);
  const [isAllTeamsRefreshing, setIsAllTeamsRefreshing] = useState<boolean>(false);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [isDbLoaded, setIsDbLoaded] = useState<boolean>(() => {
    const cached = getStoredTendencyData();
    const initialSorted = [...mockTeams].sort((a, b) => (b.currentPayroll || 0) - (a.currentPayroll || 0));
    const defaultTeam = initialSorted[0] || mockTeams[0];
    return !!(cached && cached[defaultTeam.name] && cached[defaultTeam.name].length > 0);
  });
  const [teamPayrollMap, setTeamPayrollMap] = useState<Record<string, number>>(() => {
    const cached = getStoredTendencyData();
    if (cached) {
      const pMap: Record<string, number> = {};
      Object.entries(cached).forEach(([tName, list]) => {
        pMap[tName] = list.reduce((sum, p) => sum + (p.salary || 0), 0);
      });
      return pMap;
    }
    return {};
  });

  // 테이블 정렬 및 다중 카테고리 필터 상태
  type SortField = 'name' | 'age' | 'position' | 'war' | 'salary' | 'draftYear' | 'serviceTime';
  type SortDirection = 'asc' | 'desc';
  type FilterCategory = 'ALL' | 'name' | 'age' | 'position' | 'war' | 'salary' | 'draftYear' | 'serviceTime';

  const [sortField, setSortField] = useState<SortField | null>('salary');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [filterCategory, setFilterCategory] = useState<FilterCategory>('ALL');
  const [filterQuery, setFilterQuery] = useState<string>('');

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

  // 정렬 및 필터 적용된 로스터 목록 (연봉 정보가 있는 선수만 반영)
  const displayedRoster = useMemo(() => {
    let list = teamRoster.filter((p) => typeof p.salary === 'number' && p.salary > 0);

    // 필터 조건 적용
    if (filterCategory !== 'ALL') {
      list = list.filter((p) => {
        // 1. 선수명 필터
        if (filterCategory === 'name') {
          if (!filterQuery || filterQuery.trim() === '') return true;
          return p.name.toLowerCase().includes(filterQuery.trim().toLowerCase());
        }

        // 2. 나이 필터
        if (filterCategory === 'age') {
          if (!filterQuery || filterQuery === 'ALL') return true;
          const ageNum = typeof p.age === 'number' ? p.age : parseInt(String(p.age)) || 0;
          if (filterQuery === 'under_25') return ageNum <= 25;
          if (filterQuery === '26_to_29') return ageNum >= 26 && ageNum <= 29;
          if (filterQuery === '30_to_34') return ageNum >= 30 && ageNum <= 34;
          if (filterQuery === 'over_35') return ageNum >= 35;
          return true;
        }

        // 3. 포지션 필터
        if (filterCategory === 'position') {
          if (!filterQuery || filterQuery === 'ALL') return true;
          const clean = cleanPosition(p.position);
          if (filterQuery === '투수') return clean.includes('투수');
          if (filterQuery === '포수') return clean.includes('포수');
          if (filterQuery === '내야수') return clean.includes('내야') || clean.includes('1루') || clean.includes('2루') || clean.includes('3루') || clean.includes('유격');
          if (filterQuery === '외야수') return clean.includes('외야') || clean.includes('좌익') || clean.includes('중견') || clean.includes('우익');
          if (filterQuery === '지명타자') return clean.includes('지명');
          return clean.includes(filterQuery);
        }

        // 4. 핵심 스탯 (WAR) 필터
        if (filterCategory === 'war') {
          if (!filterQuery || filterQuery === 'ALL') return true;
          const warNum = typeof p.war === 'number' ? p.war : parseFloat(String(p.war)) || 0;
          if (filterQuery === 'war_4_plus') return warNum >= 4.0;
          if (filterQuery === 'war_2_5_to_4') return warNum >= 2.5 && warNum < 4.0;
          if (filterQuery === 'war_1_to_2_5') return warNum >= 1.0 && warNum < 2.5;
          if (filterQuery === 'war_0_to_1') return warNum >= 0.0 && warNum < 1.0;
          if (filterQuery === 'war_under_0') return warNum < 0.0;
          return true;
        }

        // 5. 현재 연봉 필터 (만원 단위 기준: 10억 = 100,000, 1억 = 10,000, 5000만 = 5,000)
        if (filterCategory === 'salary') {
          if (!filterQuery || filterQuery === 'ALL') return true;
          const salaryManwon = parsePlayerSalaryToManwon(p.salary);
          if (filterQuery === 'salary_10uk_plus') return salaryManwon >= 100000;
          if (filterQuery === 'salary_5uk_to_10uk') return salaryManwon >= 50000 && salaryManwon < 100000;
          if (filterQuery === 'salary_1uk_to_5uk') return salaryManwon >= 10000 && salaryManwon < 50000;
          if (filterQuery === 'salary_5000_to_1uk') return salaryManwon >= 5000 && salaryManwon < 10000;
          if (filterQuery === 'salary_under_5000') return salaryManwon < 5000;
          return true;
        }

        // 6. 입단 연도 필터
        if (filterCategory === 'draftYear') {
          if (!filterQuery || filterQuery === 'ALL') return true;
          const draftNum = typeof p.draftYear === 'number' ? p.draftYear : parseInt(String(p.draftYear)) || 0;
          if (filterQuery === 'draft_2022_plus') return draftNum >= 2022;
          if (filterQuery === 'draft_2017_to_2021') return draftNum >= 2017 && draftNum <= 2021;
          if (filterQuery === 'draft_2011_to_2016') return draftNum >= 2011 && draftNum <= 2016;
          if (filterQuery === 'draft_2010_under') return draftNum > 0 && draftNum <= 2010;
          return true;
        }

        // 7. 등록일수 필터
        if (filterCategory === 'serviceTime') {
          if (!filterQuery || filterQuery === 'ALL') return true;
          const str = String(p.serviceTime || '');
          let years = 0;
          const matchYear = str.match(/(\d+)\s*년/);
          if (matchYear) {
            years = parseInt(matchYear[1], 10);
          } else {
            const matchDays = str.match(/(\d+)\s*일/);
            const days = matchDays ? parseInt(matchDays[1], 10) : parseInt(str.replace(/[^0-9]/g, '')) || 0;
            years = Math.floor(days / 145);
          }

          if (filterQuery === 'service_fa_plus') return years >= 7;
          if (filterQuery === 'service_5_to_7') return years >= 5 && years < 7;
          if (filterQuery === 'service_3_to_5') return years >= 3 && years < 5;
          if (filterQuery === 'service_under_3') return years < 3;
          return true;
        }

        return true;
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
          valA = parseServiceTimeFaStatus(a.serviceTime).totalDays;
          valB = parseServiceTimeFaStatus(b.serviceTime).totalDays;
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
  }, [teamRoster, sortField, sortDirection, filterCategory, filterQuery]);

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

  // 10개 구단 전체의 로스터 총 연봉 비동기 로드 및 sessionStorage 캐싱
  useEffect(() => {
    let isMounted = true;

    const loadAllTeamPayrolls = async () => {
      // 1. 컴포넌트가 마운트될 때 가장 먼저 sessionStorage.getItem('teamTendencyData') 확인
      const storedData = getStoredTendencyData();
      if (storedData && Object.keys(storedData).length > 0) {
        console.log("⚡ [SessionStorage Hit] 세션 스토리지에서 구단 성향 데이터 즉시 복원 (fetch 통신 생략)");
        if (isMounted) {
          teamDataCacheRef.current = storedData;
          setTeamDataCache(storedData);

          const payrolls: Record<string, number> = {};
          Object.entries(storedData).forEach(([tName, list]) => {
            payrolls[tName] = Array.isArray(list) ? list.reduce((sum, p) => sum + (p.salary || 0), 0) : 0;
          });
          setTeamPayrollMap((prev) => ({ ...prev, ...payrolls }));

          if (storedData[selectedTeam.name] && storedData[selectedTeam.name].length > 0) {
            setTeamRoster(storedData[selectedTeam.name]);
            setIsDbLoaded(true);
            setIsRosterLoading(false);
            setRosterError(null);
          }
        }
        // 세션 스토리지에 데이터가 이미 존재하므로 fetch 통신 건너뜀
        return;
      }

      // 2. 세션 스토리지에 데이터가 없는 경우: 점진적/안정적 API 통신 수행
      try {
        const payrolls: Record<string, number> = {};
        mockTeams.forEach((t) => {
          if (t.currentPayroll) {
            payrolls[t.name] = t.currentPayroll >= 100000000 ? Math.round(t.currentPayroll / 10000) : t.currentPayroll;
          }
        });
        setTeamPayrollMap((prev) => ({ ...payrolls, ...prev }));

        const preloaded: Record<string, DbTeamPlayer[]> = {};

        // 2-1. 현재 활성 선택된 구단 로스터를 즉시 우선 로드
        try {
          const activeRes = await fetchTeamRosterFromDatabase(selectedTeam.name);
          if (activeRes.success && activeRes.players && activeRes.players.length > 0) {
            const total = activeRes.players.reduce((sum, p) => sum + (p.salary || 0), 0);
            payrolls[selectedTeam.name] = total;
            preloaded[selectedTeam.name] = activeRes.players;
            if (isMounted) {
              setTeamRoster(activeRes.players);
              setIsDbLoaded(true);
              setIsRosterLoading(false);
              setRosterError(null);
            }
          }
        } catch (err) {
          console.warn(`[ReverseEngineering] ${selectedTeam.name} 초기 로드 안내:`, err);
        }

        // 2-2. 나머지 구단들은 2개씩 순차 청크로 조회하여 동시 요청 과부하(HTTP 404/429) 방지
        const otherTeams = mockTeams.filter((t) => t.name !== selectedTeam.name);
        for (let i = 0; i < otherTeams.length; i += 2) {
          if (!isMounted) break;
          const chunk = otherTeams.slice(i, i + 2);
          await Promise.all(
            chunk.map(async (team) => {
              try {
                const res = await fetchTeamRosterFromDatabase(team.name);
                if (res.success && res.players && res.players.length > 0) {
                  const total = res.players.reduce((sum, p) => sum + (p.salary || 0), 0);
                  payrolls[team.name] = total;
                  preloaded[team.name] = res.players;
                } else if (team.currentPayroll) {
                  payrolls[team.name] = team.currentPayroll >= 100000000 ? Math.round(team.currentPayroll / 10000) : team.currentPayroll;
                }
              } catch {
                if (team.currentPayroll) {
                  payrolls[team.name] = team.currentPayroll >= 100000000 ? Math.round(team.currentPayroll / 10000) : team.currentPayroll;
                }
              }
            })
          );
        }

        if (isMounted) {
          setTeamPayrollMap((prev) => ({ ...prev, ...payrolls }));
          teamDataCacheRef.current = { ...preloaded, ...teamDataCacheRef.current };
          setTeamDataCache((prev) => ({ ...preloaded, ...prev }));

          if (preloaded[selectedTeam.name] && preloaded[selectedTeam.name].length > 0) {
            setTeamRoster(preloaded[selectedTeam.name]);
            setIsDbLoaded(true);
            setIsRosterLoading(false);
            setRosterError(null);
          }

          // 받아온 데이터를 State에 렌더링함과 동시에 sessionStorage에 임시 저장
          saveStoredTendencyData(teamDataCacheRef.current);
        }
      } catch (e) {
        console.warn("전체 구단 연봉 및 캐시 로드 안내:", e);
      }
    };

    loadAllTeamPayrolls();
    return () => {
      isMounted = false;
    };
  }, []);

  // 10개 구단 전체 실시간 DB 강제 새로고침 (캐시 무시 및 최신화, 2개씩 순차 청크 처리)
  const refreshAllTeamsRosters = async () => {
    setIsAllTeamsRefreshing(true);
    setRosterError(null);
    try {
      const payrolls: Record<string, number> = {};
      mockTeams.forEach((t) => {
        if (t.currentPayroll) {
          payrolls[t.name] = t.currentPayroll >= 100000000 ? Math.round(t.currentPayroll / 10000) : t.currentPayroll;
        }
      });

      const preloaded: Record<string, DbTeamPlayer[]> = {};

      for (let i = 0; i < mockTeams.length; i += 2) {
        const chunk = mockTeams.slice(i, i + 2);
        await Promise.all(
          chunk.map(async (team) => {
            try {
              const res = await fetchTeamRosterFromDatabase(team.name);
              if (res.success && res.players && res.players.length > 0) {
                const total = res.players.reduce((sum, p) => sum + (p.salary || 0), 0);
                payrolls[team.name] = total;
                preloaded[team.name] = res.players;
              } else if (team.currentPayroll) {
                payrolls[team.name] = team.currentPayroll >= 100000000 ? Math.round(team.currentPayroll / 10000) : team.currentPayroll;
              }
            } catch {
              if (team.currentPayroll) {
                payrolls[team.name] = team.currentPayroll >= 100000000 ? Math.round(team.currentPayroll / 10000) : team.currentPayroll;
              }
            }
          })
        );
      }

      setTeamPayrollMap((prev) => ({ ...prev, ...payrolls }));
      teamDataCacheRef.current = { ...teamDataCacheRef.current, ...preloaded };
      setTeamDataCache((prev) => ({ ...prev, ...preloaded }));

      if (preloaded[selectedTeam.name] && preloaded[selectedTeam.name].length > 0) {
        setTeamRoster(preloaded[selectedTeam.name]);
        setIsDbLoaded(true);
        setIsRosterLoading(false);
      }

      // sessionStorage 최신화
      saveStoredTendencyData(teamDataCacheRef.current);
    } catch (e) {
      console.warn("10개 구단 전체 데이터 새로고침 안내:", e);
    } finally {
      setIsAllTeamsRefreshing(false);
    }
  };

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
   * @param forceRefresh true인 경우 sessionStorage 캐시를 무시하고 구글 DB에서 실시간 강제 fetch 수행
   */
  const loadTeamRoster = async (teamName: string, forceRefresh = false) => {
    // 1. 강제 새로고침이 아닐 때: 세션 스토리지 및 메모리 캐시 확인
    if (!forceRefresh) {
      let cachedPlayers = teamDataCacheRef.current[teamName] || teamDataCache[teamName];
      if (!cachedPlayers) {
        const stored = getStoredTendencyData();
        if (stored && stored[teamName] && stored[teamName].length > 0) {
          cachedPlayers = stored[teamName];
          teamDataCacheRef.current[teamName] = cachedPlayers;
          setTeamDataCache((prev) => ({ ...prev, [teamName]: cachedPlayers }));
        }
      }

      if (cachedPlayers && cachedPlayers.length > 0) {
        console.log(`⚡ [Cache Hit] '${teamName}' 구단 데이터 캐시 즉시 렌더링 (${cachedPlayers.length}명)`);
        setTeamRoster(cachedPlayers);
        setIsDbLoaded(true);
        setIsRosterLoading(false);
        setRosterError(null);
        return;
      }
    }

    // 2. 캐시 미스 또는 사용자가 수동 새로고침 버튼을 누른 경우(forceRefresh = true):
    // sessionStorage 캐시를 무시하고 무조건 fetch API(타임스탬프 포함) 호출
    console.log(`🌐 [DB Fetch] '${teamName}' 구단 데이터 서버 요청 (강제 새로고침: ${forceRefresh})`);
    setIsRosterLoading(true);
    setRosterError(null);
    try {
      const res = await fetchTeamRosterFromDatabase(teamName);
      if (res.success && res.players && res.players.length > 0) {
        // React 상태 업데이트
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

        // 새 데이터를 받아오면 sessionStorage의 기존 데이터도 최신 데이터로 덮어쓰기(업데이트)
        const currentStored = getStoredTendencyData() || {};
        const updatedStored = {
          ...currentStored,
          [teamName]: res.players
        };
        saveStoredTendencyData(updatedStored);
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
            salary: parsePlayerSalaryToManwon(p.salaryCurrent),
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

          const currentStored = getStoredTendencyData() || {};
          const updatedStored = {
            ...currentStored,
            [teamName]: convertedLocal
          };
          saveStoredTendencyData(updatedStored);
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
        
        const currentStored = getStoredTendencyData() || {};
        saveStoredTendencyData({
          ...currentStored,
          [selectedTeam.name]: nextList
        });
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
    
    // 로스터 테이블 및 캐시, sessionStorage에도 실시간 반영
    setTeamRoster(prev => {
      const nextList = prev.map(p => {
        if (p.name === updatedPlayer.name || p.id === updatedPlayer.id) {
          return {
            ...p,
            name: updatedPlayer.name,
            age: updatedPlayer.age,
            position: updatedPlayer.position,
            war: updatedPlayer.stats[updatedPlayer.stats.length - 1]?.war ?? p.war,
            salary: parsePlayerSalaryToManwon(updatedPlayer.salaryCurrent),
            draftYear: updatedPlayer.draftYear,
            serviceTime: updatedPlayer.serviceTime
          };
        }
        return p;
      });
      teamDataCacheRef.current[selectedTeam.name] = nextList;
      setTeamDataCache(cache => ({ ...cache, [selectedTeam.name]: nextList }));
      
      const currentStored = getStoredTendencyData() || {};
      saveStoredTendencyData({
        ...currentStored,
        [selectedTeam.name]: nextList
      });
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

  // Scatter plot data mapping (연봉 정보가 있는 선수만 반영)
  const scatterData = (teamRoster.length > 0
    ? teamRoster
    : players.filter(p => p.team === selectedTeam.name).map(p => ({
        name: p.name,
        war: p.stats[p.stats.length - 1]?.war ?? 0,
        salary: parsePlayerSalaryToManwon(p.salaryCurrent)
      }))
    )
    .filter(p => typeof p.salary === 'number' && p.salary > 0)
    .map(p => ({
      name: p.name,
      war: p.war,
      salary: parsePlayerSalaryToManwon(p.salary)
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
    return mockTeams
      .map((team) => {
        const isSelected = selectedTeam.id === team.id;
        // 선택된 팀인 경우 현재 로스터 테이블의 실제 총 연봉을 최우선 연동
        let totalPayroll: number;
        if (isSelected && teamRoster.length > 0) {
          totalPayroll = teamRoster.reduce((sum, p) => sum + (p.salary || 0), 0);
        } else if (teamPayrollMap[team.name] !== undefined) {
          totalPayroll = teamPayrollMap[team.name];
        } else {
          const cp = team.currentPayroll || 0;
          totalPayroll = cp >= 100000000 ? Math.round(cp / 10000) : cp;
        }
        return { ...team, calculatedPayroll: totalPayroll };
      })
      .sort((a, b) => (b.calculatedPayroll || 0) - (a.calculatedPayroll || 0));
  }, [teamPayrollMap, selectedTeam.id, selectedTeam.name, teamRoster]);

  return (
    <div className="flex h-full w-full bg-[#0B0D14] overflow-hidden text-gray-200">
      {/* 좌측 25%: 구단 선택 패널 */}
      <div className="w-1/4 min-w-[260px] max-w-[320px] border-r border-white/10 bg-[#0E111A] flex flex-col">
        <div className="p-5 border-b border-white/10 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-gold" />
              구단 연봉 산정 역산
            </h2>
            <button
              onClick={refreshAllTeamsRosters}
              disabled={isAllTeamsRefreshing}
              title="10개 구단 전체 데이터 구글 DB에서 최신으로 새로고침"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gold/15 hover:bg-gold/25 text-gold border border-gold/30 text-[11px] font-bold transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${isAllTeamsRefreshing ? 'animate-spin' : ''}`} />
              <span className="whitespace-nowrap">{isAllTeamsRefreshing ? '동기화 중...' : '전체 새로고침'}</span>
            </button>
          </div>
          <p className="text-[11px] text-gray-400 tracking-tight leading-relaxed">
            AI가 구단의 연봉 협상 기준을 역추적하여 가장 가중치가 높은 스탯을 분석합니다.
          </p>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {sortedTeams.map((team) => {
            const isSelected = selectedTeam.id === team.id;
            return (
              <button
                key={team.id}
                onClick={() => setSelectedTeam(team)}
                className={`w-full text-left px-3.5 py-3 rounded-xl transition-all duration-200 cursor-pointer ${
                  isSelected
                    ? 'bg-gold/15 border border-gold/40 text-white shadow-lg shadow-gold/10'
                    : 'bg-[#131722]/50 border border-white/5 text-gray-400 hover:bg-[#131722] hover:text-white hover:border-white/10'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className={`font-bold text-[16px] ${isSelected ? 'text-gold' : 'text-white'}`}>{team.name}</div>
                  {isSelected && (
                    <span className="w-2 h-2 rounded-full bg-gold animate-pulse" />
                  )}
                </div>
                <div className="text-[12px] mt-1 font-medium flex items-center justify-between">
                  <span className="text-white text-[12px]">총 연봉:</span>
                  <span className={`font-mono font-bold text-[12px] ${isSelected ? 'text-gold' : 'text-gray-300'}`}>
                    {team.calculatedPayroll > 0 ? formatCurrency(team.calculatedPayroll) : '조회 중...'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 우측 75%: 대시보드 */}
      <div className="flex-1 flex flex-col h-full overflow-y-auto p-6 gap-6 bg-[#0B0D14]">
        {/* 최상단: 인터랙티브 로스터 테이블 */}
        <div className="min-h-[350px] bg-[#131722] border border-white/10 rounded-2xl flex flex-col overflow-hidden shrink-0 shadow-xl">
          <div className="p-4 md:p-5 border-b border-white/10 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <h3 className="text-[18px] font-bold text-white flex items-center gap-2">
                  <span>{selectedTeam.name}</span> 인터랙티브 로스터
                </h3>
                {isDbLoaded ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-bold font-mono flex items-center gap-1">
                    <Database className="w-3 h-3" />
                    Google DB 연동
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-400 font-bold font-mono">
                    로컬/기본 로스터
                  </span>
                )}
              </div>

              {/* 제목 영역: 연봉 총합 및 평균 연봉 표시 */}
              <div className="flex items-center gap-2.5 bg-black/40 border border-white/10 px-3 py-1.5 rounded-xl text-xs">
                <div className="flex items-center gap-1.5 text-gray-300">
                  <span className="text-white text-[14px]">총 연봉:</span>
                  <span className="font-bold font-mono text-gold text-[14px]">{formatCurrency(rosterTotalSalary)}</span>
                </div>
                <span className="text-white/20">|</span>
                <div className="flex items-center gap-1.5 text-gray-300">
                  <span className="text-white text-[14px]">평균:</span>
                  <span className="font-bold font-mono text-emerald-400 text-[14px]">{formatCurrency(rosterAvgSalary)}</span>
                  <span className="text-white text-[14px] font-mono">({rosterPlayerCount}명)</span>
                </div>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              {/* 항목별 다기능 필터 컨트롤 */}
              <div className="flex items-center gap-1.5 bg-black/40 border border-white/10 rounded-xl p-1 text-xs">
                <div className="flex items-center gap-1 text-gray-400 pl-1.5">
                  <Filter className="w-3.5 h-3.5 text-gold shrink-0" />
                  <span className="text-[11px] text-white text-center font-bold whitespace-nowrap">필터:</span>
                </div>
                
                <select
                  value={filterCategory}
                  onChange={(e) => {
                    const cat = e.target.value as FilterCategory;
                    setFilterCategory(cat);
                    setFilterQuery(cat === 'name' ? '' : 'ALL');
                  }}
                  className="bg-black/60 text-gray-200 text-xs px-2.5 py-1.5 rounded-lg border border-white/10 font-medium focus:outline-none focus:border-gold cursor-pointer"
                  title="필터 기준 항목 선택"
                >
                  <option value="ALL" className="bg-dark-bg text-gray-200">전체 항목</option>
                  <option value="name" className="bg-dark-bg text-gray-200">선수명</option>
                  <option value="age" className="bg-dark-bg text-gray-200">나이</option>
                  <option value="position" className="bg-dark-bg text-gray-200">포지션</option>
                  <option value="war" className="bg-dark-bg text-gray-200">핵심 스탯(WAR)</option>
                  <option value="salary" className="bg-dark-bg text-gray-200">현재 연봉</option>
                  <option value="draftYear" className="bg-dark-bg text-gray-200">입단 연도</option>
                  <option value="serviceTime" className="bg-dark-bg text-gray-200">등록일수</option>
                </select>

                {/* 서브 필터 컨트롤 */}
                {filterCategory === 'name' && (
                  <div className="relative flex items-center">
                    <Search className="w-3 h-3 text-gray-400 absolute left-2 pointer-events-none" />
                    <input
                      type="text"
                      value={filterQuery}
                      onChange={(e) => setFilterQuery(e.target.value)}
                      placeholder="선수명 검색..."
                      className="bg-black/60 border border-white/20 rounded pl-7 pr-6 py-1 text-xs text-white focus:outline-none focus:border-gold w-32 placeholder:text-gray-500"
                    />
                    {filterQuery && (
                      <button
                        type="button"
                        onClick={() => setFilterQuery('')}
                        className="absolute right-1.5 text-gray-400 hover:text-white"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}

                {filterCategory === 'age' && (
                  <select
                    value={filterQuery}
                    onChange={(e) => setFilterQuery(e.target.value)}
                    className="bg-black/60 border border-white/20 rounded text-gray-200 text-xs px-2 py-1 font-medium focus:outline-none focus:border-gold cursor-pointer"
                  >
                    <option value="ALL" className="bg-dark-bg text-gray-200">전체 나이</option>
                    <option value="under_25" className="bg-dark-bg text-gray-200">25세 이하 (유망주)</option>
                    <option value="26_to_29" className="bg-dark-bg text-gray-200">26세 ~ 29세 (전성기)</option>
                    <option value="30_to_34" className="bg-dark-bg text-gray-200">30세 ~ 34세 (베테랑)</option>
                    <option value="over_35" className="bg-dark-bg text-gray-200">35세 이상 (최고참)</option>
                  </select>
                )}

                {filterCategory === 'position' && (
                  <select
                    value={filterQuery}
                    onChange={(e) => setFilterQuery(e.target.value)}
                    className="bg-black/60 border border-white/20 rounded text-gray-200 text-xs px-2 py-1 font-medium focus:outline-none focus:border-gold cursor-pointer"
                  >
                    <option value="ALL" className="bg-dark-bg text-gray-200">전체 포지션</option>
                    <option value="투수" className="bg-dark-bg text-gray-200">투수</option>
                    <option value="포수" className="bg-dark-bg text-gray-200">포수</option>
                    <option value="내야수" className="bg-dark-bg text-gray-200">내야수</option>
                    <option value="외야수" className="bg-dark-bg text-gray-200">외야수</option>
                    <option value="지명타자" className="bg-dark-bg text-gray-200">지명타자</option>
                  </select>
                )}

                {filterCategory === 'war' && (
                  <select
                    value={filterQuery}
                    onChange={(e) => setFilterQuery(e.target.value)}
                    className="bg-black/60 border border-white/20 rounded text-gray-200 text-xs px-2 py-1 font-medium focus:outline-none focus:border-gold cursor-pointer"
                  >
                    <option value="ALL" className="bg-dark-bg text-gray-200">전체 스탯</option>
                    <option value="war_4_plus" className="bg-dark-bg text-gray-200">WAR 4.0 이상 (특급/MVP)</option>
                    <option value="war_2_5_to_4" className="bg-dark-bg text-gray-200">WAR 2.5 ~ 4.0 (주전급)</option>
                    <option value="war_1_to_2_5" className="bg-dark-bg text-gray-200">WAR 1.0 ~ 2.5 (로테이션)</option>
                    <option value="war_0_to_1" className="bg-dark-bg text-gray-200">WAR 0.0 ~ 1.0 (대체선수)</option>
                    <option value="war_under_0" className="bg-dark-bg text-gray-200">WAR 0.0 미만 (부진)</option>
                  </select>
                )}

                {filterCategory === 'salary' && (
                  <select
                    value={filterQuery}
                    onChange={(e) => setFilterQuery(e.target.value)}
                    className="bg-black/60 border border-white/20 rounded text-gray-200 text-xs px-2 py-1 font-medium focus:outline-none focus:border-gold cursor-pointer"
                  >
                    <option value="ALL" className="bg-dark-bg text-gray-200">전체 연봉</option>
                    <option value="salary_10uk_plus" className="bg-dark-bg text-gray-200">10억원 이상 (초고액)</option>
                    <option value="salary_5uk_to_10uk" className="bg-dark-bg text-gray-200">5억 ~ 10억원 (고액)</option>
                    <option value="salary_1uk_to_5uk" className="bg-dark-bg text-gray-200">1억 ~ 5억원 (억대 연봉)</option>
                    <option value="salary_5000_to_1uk" className="bg-dark-bg text-gray-200">5,000만 ~ 1억원</option>
                    <option value="salary_under_5000" className="bg-dark-bg text-gray-200">5,000만원 미만</option>
                  </select>
                )}

                {filterCategory === 'draftYear' && (
                  <select
                    value={filterQuery}
                    onChange={(e) => setFilterQuery(e.target.value)}
                    className="bg-black/60 border border-white/20 rounded text-gray-200 text-xs px-2 py-1 font-medium focus:outline-none focus:border-gold cursor-pointer"
                  >
                    <option value="ALL" className="bg-dark-bg text-gray-200">전체 연도</option>
                    <option value="draft_2022_plus" className="bg-dark-bg text-gray-200">2022년 이후 (루키/신예)</option>
                    <option value="draft_2017_to_2021" className="bg-dark-bg text-gray-200">2017년 ~ 2021년 입단</option>
                    <option value="draft_2011_to_2016" className="bg-dark-bg text-gray-200">2011년 ~ 2016년 입단</option>
                    <option value="draft_2010_under" className="bg-dark-bg text-gray-200">2010년 이전 (베테랑)</option>
                  </select>
                )}

                {filterCategory === 'serviceTime' && (
                  <select
                    value={filterQuery}
                    onChange={(e) => setFilterQuery(e.target.value)}
                    className="bg-black/60 border border-white/20 rounded text-gray-200 text-xs px-2 py-1 font-medium focus:outline-none focus:border-gold cursor-pointer"
                  >
                    <option value="ALL" className="bg-dark-bg text-gray-200">전체 등록일수</option>
                    <option value="service_fa_plus" className="bg-dark-bg text-gray-200">7년 이상 (FA 대상/임박)</option>
                    <option value="service_5_to_7" className="bg-dark-bg text-gray-200">5년 ~ 7년 미만</option>
                    <option value="service_3_to_5" className="bg-dark-bg text-gray-200">3년 ~ 5년 미만</option>
                    <option value="service_under_3" className="bg-dark-bg text-gray-200">3년 미만 (저연차)</option>
                  </select>
                )}

                {/* 필터 활성화 시 해제 버튼 */}
                {filterCategory !== 'ALL' && filterQuery !== 'ALL' && filterQuery !== '' && (
                  <button
                    type="button"
                    onClick={() => {
                      setFilterCategory('ALL');
                      setFilterQuery('');
                    }}
                    title="필터 초기화"
                    className="flex items-center gap-1 text-[10px] text-amber-400 hover:text-amber-300 bg-amber-400/10 hover:bg-amber-400/20 border border-amber-400/30 px-1.5 py-0.5 rounded transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <X className="w-3 h-3" />
                    <span>해제</span>
                  </button>
                )}
              </div>

              <button
                onClick={() => loadTeamRoster(selectedTeam.name, true)}
                disabled={isRosterLoading}
                title="구글 DB 최신 로스터 강제 새로고침 (캐시 갱신)"
                className="flex items-center gap-1.5 bg-black/40 hover:bg-black/60 text-gray-300 border border-white/10 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRosterLoading ? 'animate-spin text-gold' : ''}`} />
                <span>새로고침</span>
              </button>

              {!analysisResult && !isLoading && (
                <button 
                  onClick={() => fetchAnalysis(selectedTeam)}
                  className="flex items-center gap-1.5 bg-gradient-to-r from-gold to-amber-500 hover:from-amber-400 hover:to-gold text-black font-bold px-3.5 py-1.5 rounded-xl text-xs transition-all shadow-md shadow-gold/20 active:scale-[0.98] cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>AI 구단 성향 진단 시작</span>
                </button>
              )}
            </div>

          </div>
          <div className="flex-1 overflow-y-auto max-h-[420px]">
            <table className="w-full text-center text-xs text-gray-300 border-collapse table-fixed">
              <colgroup>
                <col className="w-[14%]" />
                <col className="w-[8%]" />
                <col className="w-[11%]" />
                <col className="w-[15%]" />
                <col className="w-[19%]" />
                <col className="w-[11%]" />
                <col className="w-[11%]" />
                <col className="w-[11%]" />
              </colgroup>
              <thead className="bg-[#121620] text-[13px] uppercase text-white sticky top-0 z-10 border-b border-white/10 shadow-sm">
                <tr>
                  <th 
                    onClick={() => handleSort('name')}
                    className="px-2 py-2.5 font-bold text-center select-none cursor-pointer hover:bg-white/5 hover:text-white transition-colors group whitespace-nowrap"
                    title="선수명 정렬"
                  >
                    <div className="inline-flex items-center justify-center relative">
                      <span className={`text-[13px] ${sortField === 'name' ? 'text-gold' : 'text-white'}`}>선수명</span>
                      <span className="absolute left-full ml-1 flex items-center">
                        {sortField === 'name' ? (
                          sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-gold shrink-0" /> : <ArrowDown className="w-3 h-3 text-gold shrink-0" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                        )}
                      </span>
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('age')}
                    className="px-2 py-2.5 font-bold text-center select-none cursor-pointer hover:bg-white/5 hover:text-white transition-colors group whitespace-nowrap"
                    title="나이 정렬"
                  >
                    <div className="inline-flex items-center justify-center relative">
                      <span className={`text-[13px] ${sortField === 'age' ? 'text-gold' : 'text-white'}`}>나이</span>
                      <span className="absolute left-full ml-1 flex items-center">
                        {sortField === 'age' ? (
                          sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-gold shrink-0" /> : <ArrowDown className="w-3 h-3 text-gold shrink-0" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                        )}
                      </span>
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('position')}
                    className="px-2 py-2.5 font-bold text-center select-none cursor-pointer hover:bg-white/5 hover:text-white transition-colors group whitespace-nowrap"
                    title="포지션 정렬"
                  >
                    <div className="inline-flex items-center justify-center relative">
                      <span className={`text-[13px] ${sortField === 'position' ? 'text-gold' : 'text-white'}`}>포지션</span>
                      <span className="absolute left-full ml-1 flex items-center">
                        {sortField === 'position' ? (
                          sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-gold shrink-0" /> : <ArrowDown className="w-3 h-3 text-gold shrink-0" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                        )}
                      </span>
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('war')}
                    className="px-2 py-2.5 font-bold text-center select-none cursor-pointer hover:bg-white/5 hover:text-white transition-colors group whitespace-nowrap"
                    title="핵심 스탯(WAR) 정렬"
                  >
                    <div className="inline-flex items-center justify-center relative">
                      <span className={`text-[13px] ${sortField === 'war' ? 'text-gold' : 'text-white'}`}>핵심 스탯(WAR)</span>
                      <span className="absolute left-full ml-1 flex items-center">
                        {sortField === 'war' ? (
                          sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-gold shrink-0" /> : <ArrowDown className="w-3 h-3 text-gold shrink-0" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                        )}
                      </span>
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('salary')}
                    className="px-2 py-2.5 font-bold text-center select-none cursor-pointer hover:bg-white/5 hover:text-white transition-colors group whitespace-nowrap"
                    title="현재 연봉 정렬"
                  >
                    <div className="inline-flex items-center justify-center relative">
                      <span className={`text-[13px] ${sortField === 'salary' ? 'text-gold' : 'text-white'}`}>현재 연봉</span>
                      <span className="absolute left-full ml-1 flex items-center">
                        {sortField === 'salary' ? (
                          sortDirection === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-gold shrink-0 text-[13px]" /> : <ArrowDown className="w-3.5 h-3.5 text-gold shrink-0 text-[13px]" />
                        ) : (
                          <ArrowUpDown className="w-3.5 h-3.5 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-[13px]" />
                        )}
                      </span>
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('draftYear')}
                    className="px-2 py-2.5 font-bold text-center select-none cursor-pointer hover:bg-white/5 hover:text-white transition-colors group whitespace-nowrap"
                    title="입단 연도 정렬"
                  >
                    <div className="inline-flex items-center justify-center relative">
                      <span className={`text-[13px] ${sortField === 'draftYear' ? 'text-gold' : 'text-white'}`}>입단 연도</span>
                      <span className="absolute left-full ml-1 flex items-center">
                        {sortField === 'draftYear' ? (
                          sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-gold shrink-0" /> : <ArrowDown className="w-3 h-3 text-gold shrink-0" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                        )}
                      </span>
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('serviceTime')}
                    className="px-2 py-2.5 font-bold text-center select-none cursor-pointer hover:bg-white/5 hover:text-white transition-colors group whitespace-nowrap"
                    title="등록일수 정렬"
                  >
                    <div className="inline-flex items-center justify-center relative">
                      <span className={`text-[13px] ${sortField === 'serviceTime' ? 'text-gold' : 'text-white'}`}>등록일수</span>
                      <span className="absolute left-full ml-1 flex items-center">
                        {sortField === 'serviceTime' ? (
                          sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-gold shrink-0" /> : <ArrowDown className="w-3 h-3 text-gold shrink-0" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                        )}
                      </span>
                    </div>
                  </th>
                  <th className="px-2 py-2.5 font-bold text-center whitespace-nowrap text-[13px] text-white">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {isRosterLoading ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-gray-400">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Loader2 className="w-6 h-6 animate-spin text-gold" />
                        <span className="text-xs font-medium">Google DB에서 '{selectedTeam.name}' 선수단 로스터를 조회 중입니다...</span>
                      </div>
                    </td>
                  </tr>
                ) : displayedRoster.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-gray-400">
                      <div className="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto">
                        <AlertCircle className="w-6 h-6 text-amber-400" />
                        <span className="text-xs font-bold text-gray-300">
                          {teamRoster.length > 0 && filterCategory !== 'ALL' && filterQuery !== 'ALL' && filterQuery !== ''
                            ? '선택하신 필터 조건에 부합하는 선수가 없습니다' 
                            : '해당 구단에 연봉 정보가 등록된 선수가 없습니다'}
                        </span>
                        <p className="text-[11px] text-gray-500">
                          {rosterError || (teamRoster.length > 0 ? '다른 필터 조건을 선택하거나 필터를 해제해 보세요.' : `'${selectedTeam.name}' 소속 선수의 연봉 정보가 구글 스프레드시트 DB에 존재하지 않습니다.`)}
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
                        key={pData.id || `${pData.name}_${idx}`}
                        id={`player-row-${pData.name}`}
                        className={`transition-colors duration-150 hover:bg-white/5 ${isSelected ? 'bg-gold/15' : ''}`}
                      >
                        <td className={`px-2 py-2.5 font-bold text-white text-xs font-sans text-center whitespace-nowrap truncate ${isSelected ? 'border-l-2 border-gold' : ''}`}>
                          {pData.name}
                        </td>
                        <td className="px-2 py-2.5 text-xs font-sans text-center whitespace-nowrap text-gray-300 truncate">{pData.age}</td>
                        <td className="px-2 py-2.5 text-xs font-sans text-center whitespace-nowrap font-medium text-gray-200 truncate">{posText}</td>
                        <td className="px-2 py-2.5 text-xs font-mono text-center text-gold font-bold whitespace-nowrap truncate">{warText}</td>
                        <td className="px-2 py-2.5 text-xs font-mono text-center font-bold text-emerald-400 whitespace-nowrap truncate">{formatCurrency(pData.salary)}</td>
                        <td className="px-2 py-2.5 text-xs font-sans text-center whitespace-nowrap text-gray-300 truncate">{pData.draftYearDisplay || (typeof pData.draftYear === 'number' ? `${pData.draftYear}년` : pData.draftYear)}</td>
                        <td className="px-2 py-2.5 text-xs font-sans text-center whitespace-nowrap text-gray-300 truncate">{pData.serviceTime}</td>
                        <td className="px-2 py-2.5 text-center whitespace-nowrap text-xs font-sans truncate">
                          <button onClick={() => handleEditPlayer(pData)} className="text-amber-400 hover:text-amber-300 mr-2 text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap">수정</button>
                          <button onClick={() => handleDeletePlayer(pData.id)} className="text-red-400 hover:text-red-300 text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap">삭제</button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {displayedRoster.length > 0 && (
                <tfoot className="bg-[#121620] border-t border-white/10 font-medium text-xs text-gray-300 sticky bottom-0 z-10 shadow-sm">
                  <tr>
                    <td className="px-2 py-2.5 font-bold text-white text-center whitespace-nowrap truncate text-[11px]">
                      합계 / 평균 ({rosterPlayerCount}명)
                    </td>
                    <td className="px-2 py-2.5 text-center text-white whitespace-nowrap truncate">
                      {rosterPlayerCount > 0 ? `${(displayedRoster.reduce((sum, p) => sum + (typeof p.age === 'number' ? p.age : parseInt(String(p.age)) || 26), 0) / rosterPlayerCount).toFixed(1)}세` : '-'}
                    </td>
                    <td className="px-2 py-2.5 text-center text-white whitespace-nowrap truncate">
                      {filterCategory === 'position' && filterQuery !== 'ALL' ? filterQuery : '전체'}
                    </td>
                    <td className="px-2 py-2.5 text-center font-bold text-gold whitespace-nowrap truncate">
                      평균 {rosterAvgWar}
                    </td>
                    <td className="px-2 py-2.5 text-center whitespace-nowrap truncate">
                      <div className="flex items-center justify-center gap-1 whitespace-nowrap font-mono text-xs">
                        <span className="font-bold text-gold">{formatCurrency(rosterTotalSalary)}</span>
                        <span className="text-[10px] text-emerald-400 font-semibold">(평균 {formatCurrency(rosterAvgSalary)})</span>
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-center text-gray-500 whitespace-nowrap truncate">-</td>
                    <td className="px-2 py-2.5 text-center text-gray-500 whitespace-nowrap truncate">-</td>
                    <td className="px-2 py-2.5 text-center text-gray-500 whitespace-nowrap truncate">-</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* 테이블 아랫 쪽: 총합 및 평균 연봉 요약 바 */}
          <div className="p-3.5 bg-black/60 border-t border-white/5 flex flex-wrap items-center justify-between gap-4 text-xs text-gray-400">
            <div className="flex items-center gap-2">
              <span className="text-white">선수단 인원:</span>
              <span className="font-bold text-white font-mono">{rosterPlayerCount}명</span>
              {filterCategory !== 'ALL' && filterQuery !== 'ALL' && filterQuery !== '' && (
                <span className="text-gold font-medium">
                  ({filterCategory === 'name' ? `선수명: "${filterQuery}"` : filterCategory === 'age' ? '나이 필터' : filterCategory === 'position' ? `${filterQuery}` : filterCategory === 'war' ? '스탯(WAR) 필터' : filterCategory === 'salary' ? '연봉 필터' : filterCategory === 'draftYear' ? '입단연도 필터' : '등록일수 필터'} 적용)
                </span>
              )}
              {sortField && (
                <span className="text-[#dddddd] text-[11px] ml-1">
                  • 정렬: {sortField === 'name' ? '선수명' : sortField === 'age' ? '나이' : sortField === 'position' ? '포지션' : sortField === 'war' ? 'WAR' : sortField === 'salary' ? '현재 연봉' : sortField === 'draftYear' ? '입단 연도' : '등록일수'} ({sortDirection === 'asc' ? '오름차순 ↑' : '내림차순 ↓'})
                </span>
              )}
            </div>

            <div className="flex items-center gap-4 font-mono">
              <div className="flex items-center gap-1.5">
                <span className="text-white">현재 연봉 총합:</span>
                <span className="font-bold text-gold text-sm">{formatCurrency(rosterTotalSalary)}</span>
              </div>
              <span className="text-white/20">|</span>
              <div className="flex items-center gap-1.5">
                <span className="text-white">선수 1인당 평균 연봉:</span>
                <span className="font-bold text-emerald-400 text-sm">{formatCurrency(rosterAvgSalary)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* AI Analysis Sections */}
        {isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-4 min-h-[220px] bg-[#131722] border border-white/10 rounded-2xl p-8 shadow-xl">
            <Loader2 className="w-8 h-8 animate-spin text-gold" />
            <p className="text-xs font-medium">AI 모델이 {selectedTeam.name}의 연봉 구조를 역산하고 있습니다...</p>
          </div>
        ) : analysisResult ? (
          <>
            {/* 상단: 스탯 가중치 분석 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 min-h-[200px]">
              <div className="bg-[#131722] border border-white/10 rounded-2xl p-5 flex flex-col shadow-xl">
                <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
                  <h3 className="text-xs uppercase tracking-wider font-bold text-white flex items-center gap-2">
                    <TrendingUp className="w-3.5 h-3.5 text-gold" />
                    타자 연봉 가중치 추정
                  </h3>
                  <span className="text-[10px] font-mono text-gold px-2 py-0.5 rounded bg-gold/15 border border-gold/30">wRC+ / WAR 중심</span>
                </div>
                <div className="flex-1 min-h-[130px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analysisResult.stat_weights.batter} layout="vertical" margin={{ top: 0, right: 30, left: 10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="rgba(255,255,255,0.05)" />
                      <XAxis type="number" hide />
                      <YAxis dataKey="stat" type="category" stroke="#9ca3af" tick={{ fill: '#e5e7eb', fontSize: 12, fontWeight: 'bold' }} width={60} axisLine={false} tickLine={false} />
                      <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ backgroundColor: '#131722', borderColor: 'rgba(255,255,255,0.15)', borderRadius: '10px', color: '#fff' }} />
                      <Bar dataKey="weight" radius={[0, 6, 6, 0]} barSize={24}>
                        {analysisResult.stat_weights.batter.map((_, index) => (
                          <Cell key={index} fill={index === 0 ? '#E5A93C' : 'rgba(229,169,60,0.5)'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="bg-[#131722] border border-white/10 rounded-2xl p-5 flex flex-col shadow-xl">
                <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
                  <h3 className="text-xs uppercase tracking-wider font-bold text-white flex items-center gap-2">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                    투수 연봉 가중치 추정
                  </h3>
                  <span className="text-[10px] font-mono text-emerald-400 px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30">WAR / ERA+ 중심</span>
                </div>
                <div className="flex-1 min-h-[130px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analysisResult.stat_weights.pitcher} layout="vertical" margin={{ top: 0, right: 30, left: 10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="rgba(255,255,255,0.05)" />
                      <XAxis type="number" hide />
                      <YAxis dataKey="stat" type="category" stroke="#9ca3af" tick={{ fill: '#e5e7eb', fontSize: 12, fontWeight: 'bold' }} width={60} axisLine={false} tickLine={false} />
                      <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ backgroundColor: '#131722', borderColor: 'rgba(255,255,255,0.15)', borderRadius: '10px', color: '#fff' }} />
                      <Bar dataKey="weight" radius={[0, 6, 6, 0]} barSize={24}>
                        {analysisResult.stat_weights.pitcher.map((_, index) => (
                          <Cell key={index} fill={index === 0 ? '#10B981' : 'rgba(16,185,129,0.5)'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* 중단: 연봉-성적 기준선 (Scatter) */}
            <div className="min-h-[350px] bg-[#131722] border border-white/10 rounded-2xl p-5 md:p-6 flex flex-col relative overflow-hidden shadow-xl">
              <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-gold" />
                  {selectedTeam.name} 연봉-WAR 기준선 (Trend Line)
                </h3>
                <div className="text-xs text-gray-400 flex items-center gap-4">
                  <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-400"></span>Overpay (고평가)</div>
                  <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-400"></span>Underpay (저평가)</div>
                </div>
              </div>
              <div className="flex-1 min-h-[260px] mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={scatterData} margin={{ top: 10, right: 20, bottom: 0, left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis type="number" dataKey="war" name="WAR" stroke="#6b7280" tick={{ fill: '#9ca3af', fontSize: 11 }} domain={['dataMin - 1', 'dataMax + 1']} />
                    <YAxis type="number" dataKey="salary" name="Salary" tickFormatter={formatCurrency} stroke="#6b7280" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                    <Tooltip 
                      cursor={{ strokeDasharray: '3 3' }}
                      formatter={(val: number, name: string) => name === 'Salary' ? [formatCurrency(val), '연봉'] : [val, name]}
                      contentStyle={{ backgroundColor: '#131722', borderColor: 'rgba(255,255,255,0.15)', color: '#fff', borderRadius: '12px', fontSize: '12px' }} 
                    />
                    <Scatter name="선수" data={scatterData} fill="#8884d8" onClick={handleScatterClick} style={{ cursor: 'pointer' }}>
                      {scatterData.map((entry, index) => {
                        const costPerWarManwon = selectedTeam.costPerWar >= 10000000 ? Math.round(selectedTeam.costPerWar / 10000) : selectedTeam.costPerWar;
                        const expected = entry.war * costPerWarManwon;
                        const color = entry.salary > expected * 1.2 ? '#f87171' : entry.salary < expected * 0.8 ? '#60a5fa' : '#9ca3af';
                        return <Cell key={`cell-${index}`} fill={color} />;
                      })}
                    </Scatter>
                    <Line type="monotone" dataKey="salary" stroke="#E5A93C" strokeWidth={2} dot={false} strokeDasharray="5 5" opacity={0.6} activeDot={false} name="기준선(추정)" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 하단: 시뮬레이터 & 아웃라이어 */}
            <div className="min-h-[250px] grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* 시뮬레이터 */}
              <div className="bg-[#131722] border border-white/10 rounded-2xl p-5 md:p-6 flex flex-col shadow-xl">
                <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Calculator className="w-4 h-4 text-gold" />
                    타 구단 기준 대입 시뮬레이터
                  </h3>
                </div>
                <div className="flex items-center gap-4 mb-4">
                  <select 
                    className="bg-black/50 border border-white/15 rounded-xl px-3.5 py-2.5 text-xs text-white flex-1 focus:outline-none focus:border-gold cursor-pointer"
                    value={selectedPlayerForSim?.id}
                    onChange={(e) => setSelectedPlayerForSim(players.find(p => p.id === e.target.value) || null)}
                  >
                    {players.filter(p => p.team === selectedTeam.name).map(p => (
                      <option key={p.id} value={p.id} className="bg-[#131722]">{p.name} ({p.team})</option>
                    ))}
                  </select>
                </div>
                {selectedPlayerForSim && (
                  <div className="flex-1 bg-black/40 rounded-xl p-5 border border-white/10 flex flex-col justify-center items-center relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-gold/5 rounded-full blur-2xl pointer-events-none" />
                    <div className="text-xs font-bold text-gold mb-1">{selectedTeam.name} 기준 가치 환산</div>
                    <div className="text-3xl font-black text-white tracking-tight font-mono">
                      {formatCurrency(
                        (selectedPlayerForSim.stats[selectedPlayerForSim.stats.length - 1]?.war ?? 0) *
                        (selectedTeam.costPerWar >= 10000000 ? Math.round(selectedTeam.costPerWar / 10000) : selectedTeam.costPerWar)
                      )}
                      <span className="text-xs text-gray-400 font-normal ml-2">예상 연봉</span>
                    </div>
                    <div className="text-xs text-gray-400 mt-2 font-mono">
                      현재 연봉: {formatCurrency(parsePlayerSalaryToManwon(selectedPlayerForSim.salaryCurrent))}
                    </div>
                  </div>
                )}
              </div>

              {/* 아웃라이어 분석 리포트 */}
              <div className="bg-[#131722] border border-white/10 rounded-2xl p-5 md:p-6 flex flex-col shadow-xl">
                <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    아웃라이어 분석 리포트
                  </h3>
                </div>
                <div className="flex-1 overflow-y-auto pr-1 space-y-3">
                  {analysisResult.outliers.map((outlier, idx) => (
                    <div key={idx} className="bg-black/30 border border-white/5 rounded-xl p-3.5">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="font-bold text-white text-xs">{outlier.name}</div>
                        <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${outlier.isOverpaid ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'}`}>
                          {outlier.isOverpaid ? 'Overpaid' : 'Underpaid'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 leading-relaxed">
                        {outlier.reason}
                      </p>
                    </div>
                  ))}
                  
                  <div className="bg-gold/10 border border-gold/30 rounded-xl p-3.5 mt-3">
                    <div className="text-[10px] uppercase tracking-wider font-bold text-gold mb-1">Overvalued Stat (가장 높게 평가된 스탯)</div>
                    <div className="text-white text-xs font-bold mb-1">{analysisResult.overvalued_stat.stat}</div>
                    <p className="text-xs text-gray-300 leading-relaxed">
                      {analysisResult.overvalued_stat.reason}
                    </p>
                  </div>
                </div>
              </div>
            </div>

          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-3 min-h-[220px] bg-[#131722] border border-white/10 rounded-2xl p-8 shadow-xl">
            <div className="w-12 h-12 rounded-2xl bg-gold/10 border border-gold/30 flex items-center justify-center text-gold">
              <Sparkles className="w-6 h-6" />
            </div>
            <p className="text-xs text-gray-300">
              상단의 <span className="font-bold text-gold">[AI 구단 성향 진단 시작]</span> 버튼을 누르면 연봉 산정 기준을 역산합니다.
            </p>
          </div>
        )}
      </div>

      {/* Edit Player Modal */}
      {editingPlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#131722] border border-white/15 rounded-2xl p-6 flex flex-col max-w-md w-full shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-5">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-gold" />
                선수 정보 수정
              </h3>
              <button 
                onClick={() => setEditingPlayer(null)}
                className="text-gray-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-gray-400 mb-1.5 uppercase tracking-wider">선수명</label>
                <input 
                  type="text" 
                  value={editingPlayer.name}
                  onChange={e => setEditingPlayer({...editingPlayer, name: e.target.value})}
                  className="w-full bg-black/50 border border-white/15 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-gold"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-400 mb-1.5 uppercase tracking-wider">나이</label>
                  <input 
                    type="number" 
                    value={editingPlayer.age}
                    onChange={e => setEditingPlayer({...editingPlayer, age: parseInt(e.target.value) || 0})}
                    className="w-full bg-black/50 border border-white/15 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-gold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-400 mb-1.5 uppercase tracking-wider">포지션</label>
                  <input 
                    type="text" 
                    value={editingPlayer.position}
                    onChange={e => setEditingPlayer({...editingPlayer, position: e.target.value})}
                    className="w-full bg-black/50 border border-white/15 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-gold"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-400 mb-1.5 uppercase tracking-wider">입단 연도</label>
                  <input 
                    type="number" 
                    value={editingPlayer.draftYear}
                    onChange={e => setEditingPlayer({...editingPlayer, draftYear: parseInt(e.target.value) || 0})}
                    className="w-full bg-black/50 border border-white/15 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-gold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-400 mb-1.5 uppercase tracking-wider">등록일수 (년/일)</label>
                  <input 
                    type="text" 
                    value={editingPlayer.serviceTime}
                    onChange={e => setEditingPlayer({...editingPlayer, serviceTime: e.target.value})}
                    className="w-full bg-black/50 border border-white/15 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-gold"
                  />
                </div>
              </div>
              <div>
                <label className="block font-bold text-gray-400 mb-1.5 uppercase tracking-wider">현재 연봉 (원 단위)</label>
                <input 
                  type="number" 
                  value={editingPlayer.salaryCurrent}
                  onChange={e => setEditingPlayer({...editingPlayer, salaryCurrent: parseInt(e.target.value) || 0})}
                  className="w-full bg-black/50 border border-white/15 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-gold font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-white/10">
              <button 
                onClick={() => setEditingPlayer(null)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-400 hover:text-white transition-colors cursor-pointer"
              >
                취소
              </button>
              <button 
                onClick={() => handleSavePlayer(editingPlayer)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-gold to-amber-500 hover:from-amber-400 hover:to-gold text-black transition-all shadow-md shadow-gold/20 cursor-pointer"
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
