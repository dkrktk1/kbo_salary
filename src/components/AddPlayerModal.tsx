import React, { useState, useEffect } from "react";
import { mockTeams, Player, PlayerStat } from "../data";
import {
  GAS_DB_URL,
  fetchPlayerFromDatabase,
  cleanPosition,
  parsePlayerAge,
  parsePlayerSalary,
  parseDraftYear,
  parseServiceTime,
  parsePlayerAvg,
  parsePlayerOps,
  parsePlayerHr,
  parsePlayerWar,
  DbFetchResult
} from "../services/dbService";
import {
  Database,
  Search,
  Loader2,
  X,
  Sparkles,
  Calendar,
  Clock
} from "lucide-react";

interface AddPlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRegister: (player: Player) => void;
  existingPlayers: Player[];
}

function formatDateToKorean(dateStr: string): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const yy = parts[0].slice(-2);
  const mm = parts[1];
  const dd = parts[2];
  return `${yy}년 ${mm}월 ${dd}일`;
}

function calculateOneYearLater(startDateStr: string): string {
  if (!startDateStr) return "";
  const parts = startDateStr.split("-");
  if (parts.length !== 3) return "";
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return "";

  // 계약 시작일 기준 1년 후의 시점 (1년 뒤 - 1일: 예 2026-11-02 -> 2027-11-01, 2026-01-01 -> 2026-12-31)
  const endDate = new Date(year + 1, month - 1, day - 1);
  const endYear = endDate.getFullYear();
  const endMonth = String(endDate.getMonth() + 1).padStart(2, "0");
  const endDay = String(endDate.getDate()).padStart(2, "0");
  return `${endYear}-${endMonth}-${endDay}`;
}

export function AddPlayerModal({
  isOpen,
  onClose,
  onRegister,
  existingPlayers
}: AddPlayerModalProps) {
  // 1. 기본 검색 및 메인 프로필 (기본적으로 모두 공란으로 비워둠)
  const [searchName, setSearchName] = useState("");
  const [team, setTeam] = useState("롯데 자이언츠");
  const [position, setPosition] = useState("");
  const [age, setAge] = useState<number | "">("");
  const [draftYear, setDraftYear] = useState<number | "">("");
  const [serviceTime, setServiceTime] = useState<string>("");
  const [salaryManwon, setSalaryManwon] = useState<number | "">(""); // 만원 단위

  // 2. 2026 핵심 지표 (검색 전까지 공란)
  const [avg, setAvg] = useState<number | "">("");
  const [ops, setOps] = useState<number | "">("");
  const [hr, setHr] = useState<number | "">("");
  const [war, setWar] = useState<number | "">("");

  // 3. 에이전트 계약기간 (기본값 2026년 기준 1년)
  const [contractStartDate, setContractStartDate] = useState("2026-01-01");
  const [contractEndDate, setContractEndDate] = useState("2026-12-31");

  // 4. 연도별 3개년 성적 세부 조정 (검색 전까지 공란)
  const [showYearlyDetails, setShowYearlyDetails] = useState(false);
  const [stat2024, setStat2024] = useState<{
    avg: number | "";
    ops: number | "";
    hr: number | "";
    war: number | "";
    salaryManwon: number | "";
  }>({ avg: "", ops: "", hr: "", war: "", salaryManwon: "" });

  const [stat2025, setStat2025] = useState<{
    avg: number | "";
    ops: number | "";
    hr: number | "";
    war: number | "";
    salaryManwon: number | "";
  }>({ avg: "", ops: "", hr: "", war: "", salaryManwon: "" });

  // 5. DB 통신 상태
  const [isDbFetching, setIsDbFetching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dbNotice, setDbNotice] = useState<{ type: "success" | "warn" | "error"; msg: string } | null>(null);
  const [lastFetchedResult, setLastFetchedResult] = useState<DbFetchResult | null>(null);

  // 모달 폼 초기화 함수 (창을 닫거나 새로 열 때 모든 정보 삭제)
  const resetForm = () => {
    setSearchName("");
    setTeam("롯데 자이언츠");
    setPosition("");
    setAge("");
    setDraftYear("");
    setServiceTime("");
    setSalaryManwon("");
    setAvg("");
    setOps("");
    setHr("");
    setWar("");
    setContractStartDate("2026-01-01");
    setContractEndDate("2026-12-31");
    setShowYearlyDetails(false);
    setStat2024({ avg: "", ops: "", hr: "", war: "", salaryManwon: "" });
    setStat2025({ avg: "", ops: "", hr: "", war: "", salaryManwon: "" });
    setDbNotice(null);
    setIsDbFetching(false);
    setLastFetchedResult(null);
  };

  // 계약 시작일 변경 시 자동으로 1년 후 시점(1년 뒤 - 1일)으로 계약 만료일 자동 변환
  const handleContractStartDateChange = (val: string) => {
    setContractStartDate(val);
    if (val && val.length === 10) {
      const autoEndDate = calculateOneYearLater(val);
      if (autoEndDate) {
        setContractEndDate(autoEndDate);
      }
    }
  };

  // 모달이 닫힐 때 불러온 정보 및 입력 정보 완전 삭제
  useEffect(() => {
    if (!isOpen) {
      resetForm();
    }
  }, [isOpen]);

  const handleClose = () => {
    resetForm();
    onClose();
  };

  if (!isOpen) return null;

  // 구글 스프레드시트 데이터베이스에서 선수 정보 실시간 조회 (선수명과 소속 구단이 모두 일치할 때만 반환)
  const handleFetchFromDb = async () => {
    const trimmedName = searchName.trim();
    const trimmedTeam = team.trim();
    if (!trimmedName) {
      alert("선수명을 입력해주세요.");
      return;
    }

    setIsDbFetching(true);
    setDbNotice(null);

    try {
      // 1. fetch 요청 URL 생성 (name, team, t 파라미터 결합)
      const timestamp = new Date().getTime();
      const apiUrl = `${GAS_DB_URL}?name=${encodeURIComponent(trimmedName)}&team=${encodeURIComponent(trimmedTeam)}&t=${timestamp}`;
      console.log(`🚀 구글 스프레드시트 DB 단일 요청 실행 URL: ${apiUrl}`);

      const response = await fetch(apiUrl);
      if (!response.ok) {
        throw new Error(`서버 응답 오류 (HTTP ${response.status})`);
      }

      const json = await response.json();
      const rawRecords: any[] = Array.isArray(json?.data) ? json.data : (Array.isArray(json) ? json : []);

      if (rawRecords.length > 0) {
        // 1. 데이터 수신 확인용 로그
        const playerData = rawRecords[0];
        console.log("📥 API 원본 데이터:", playerData);

        // 2. 원시 데이터(Raw Data) 강제 추출 및 로그
        const rawAvg = playerData.AVG || playerData['AVG'] || 0;
        const rawHr = playerData.HR || playerData['HR'] || 0;
        const rawOps = playerData.OPS || playerData['OPS'] || 0;
        const rawWar = playerData['핵심 스탯(WAR)'] || playerData.WAR || playerData['WAR'] || 0;
        console.log("🎯 매핑될 스탯:", { rawAvg, rawHr, rawOps, rawWar });

        // 기타 프로필 데이터 추출
        const resolvedTeam = playerData.팀 || playerData.구단 || playerData.소속 || playerData.team || trimmedTeam || "롯데 자이언츠";
        const resolvedPos = cleanPosition(playerData.포지션 || playerData.position || "");
        const resolvedAge = parsePlayerAge(playerData.나이 ?? playerData.age);
        const resolvedDraft = parseDraftYear(playerData["입단 연도"] ?? playerData["입단연도"] ?? playerData.입단연도);
        const resolvedServiceTime = parseServiceTime(playerData["등록일수"] !== undefined ? playerData["등록일수"] : "");
        const resolvedSalary = parsePlayerSalary(playerData["현재 연봉"] ?? playerData["현재연봉"] ?? playerData.연봉 ?? playerData.salary);

        // 3. State 강제 업데이트
        setAvg(Number(rawAvg) || 0);
        setHr(Number(rawHr) || 0);
        setOps(Number(rawOps) || 0);
        setWar(Number(rawWar) || 0);

        setTeam(resolvedTeam);
        if (resolvedPos) {
          setPosition(resolvedPos);
        } else if (!position) {
          setPosition("외야수");
        }
        setAge(resolvedAge > 0 ? resolvedAge : 0);
        setDraftYear(resolvedDraft.draftYear > 0 ? resolvedDraft.draftYear : 0);
        setServiceTime(resolvedServiceTime || "0일");
        setSalaryManwon(Math.round(resolvedSalary / 10000));

        // 2024, 2025 과거 시즌 데이터 파싱 및 UI 상태 갱신
        const r24 = rawRecords.find((r) => Number(r.연도 || r.시즌 || r.year) === 2024);
        if (r24) {
          const r24Avg = r24.AVG || r24['AVG'] || r24.타율 || 0;
          const r24Ops = r24.OPS || r24['OPS'] || 0;
          const r24Hr = r24.HR || r24['HR'] || r24.홈런 || 0;
          const r24War = r24['핵심 스탯(WAR)'] || r24.WAR || r24['WAR'] || 0;
          setStat2024({
            avg: Number(r24Avg) || 0,
            ops: Number(r24Ops) || 0,
            hr: Number(r24Hr) || 0,
            war: Number(r24War) || 0,
            salaryManwon: Math.round(parsePlayerSalary(r24["현재 연봉"] ?? r24.연봉 ?? r24.salary) / 10000)
          });
        } else {
          setStat2024({
            avg: 0,
            ops: 0,
            hr: 0,
            war: 0,
            salaryManwon: 0
          });
        }

        const r25 = rawRecords.find((r) => Number(r.연도 || r.시즌 || r.year) === 2025);
        if (r25) {
          const r25Avg = r25.AVG || r25['AVG'] || r25.타율 || 0;
          const r25Ops = r25.OPS || r25['OPS'] || 0;
          const r25Hr = r25.HR || r25['HR'] || r25.홈런 || 0;
          const r25War = r25['핵심 스탯(WAR)'] || r25.WAR || r25['WAR'] || 0;
          setStat2025({
            avg: Number(r25Avg) || 0,
            ops: Number(r25Ops) || 0,
            hr: Number(r25Hr) || 0,
            war: Number(r25War) || 0,
            salaryManwon: Math.round(parsePlayerSalary(r25["현재 연봉"] ?? r25.연봉 ?? r25.salary) / 10000)
          });
        } else {
          setStat2025({
            avg: 0,
            ops: 0,
            hr: 0,
            war: 0,
            salaryManwon: 0
          });
        }

        // 성공 배너 노출
        const displayAvg = Number(rawAvg) || 0;
        const displayOps = Number(rawOps) || 0;
        const displayHr = Number(rawHr) || 0;
        const displayWar = Number(rawWar) || 0;

        setDbNotice({
          type: "success",
          msg: `'${trimmedName}' (${trimmedTeam}) 선수의 데이터 (타율: ${displayAvg.toFixed(3)}, OPS: ${displayOps.toFixed(3)}, 홈런: ${displayHr}개, WAR: ${displayWar.toFixed(1)}, 연봉: ${Math.round(resolvedSalary / 10000).toLocaleString()}만원)가 모달 입력 화면에 정확히 반영되었습니다.`
        });
      } else {
        // DB에 해당 선수가 없는 경우 0으로 초기화
        setAge(0);
        setDraftYear(0);
        setServiceTime("0일");
        setSalaryManwon(0);
        setWar(0);
        setOps(0);
        setHr(0);
        setAvg(0);
        setStat2024({ avg: 0, ops: 0, hr: 0, war: 0, salaryManwon: 0 });
        setStat2025({ avg: 0, ops: 0, hr: 0, war: 0, salaryManwon: 0 });

        setDbNotice({
          type: "warn",
          msg: `'${trimmedName}' 선수가 선택하신 '${trimmedTeam}' 소속 데이터에서 발견되지 않았습니다. (스탯 기본값 0 설정)`
        });
      }
    } catch (e: any) {
      setDbNotice({
        type: "error",
        msg: `DB 통신 오류: ${e.message || "네트워크 상태를 확인해주세요."}`
      });
    } finally {
      setIsDbFetching(false);
    }
  };

  const handleSave = async () => {
    const trimmedName = searchName.trim();
    if (!trimmedName) {
      alert("선수명을 입력해주세요.");
      return;
    }

    const alreadyExists = existingPlayers.some(
      (p) => p.name === trimmedName && p.team === team
    );
    if (alreadyExists) {
      if (!confirm(`'${trimmedName}' 선수가 이미 소속 명단에 있습니다. 계속 추가하시겠습니까?`)) {
        return;
      }
    }

    const finalAvg = typeof avg === "number" ? avg : 0;
    const finalOps = typeof ops === "number" ? ops : 0;
    const finalHr = typeof hr === "number" ? hr : 0;
    const finalWar = typeof war === "number" ? war : 0;
    const finalSalaryManwon = typeof salaryManwon === "number" ? salaryManwon : 0;
    const currentSalaryWon = Math.max(0, finalSalaryManwon * 10000);
    const finalAge = typeof age === "number" ? age : 0;
    const finalDraftYear = typeof draftYear === "number" ? draftYear : 0;
    const finalServiceTime = serviceTime.trim() || "0일";
    const finalPosition = position.trim() || "외야수";

    const contractPeriodText = contractStartDate && contractEndDate
      ? `${formatDateToKorean(contractStartDate)} ~ ${formatDateToKorean(contractEndDate)}`
      : "26년 01월 01일 ~ 26년 12월 31일";

    // 10개 필수 키값을 가진 Body 데이터 구성
    const postPayload = {
      "선수명": trimmedName,
      "구단": team,
      "포지션": finalPosition,
      "나이": finalAge,
      "타율": finalAvg,
      "OPS": finalOps,
      "홈런": finalHr,
      "최근 WAR": finalWar,
      "현재 연봉": finalSalaryManwon,
      "에이전트 계약기간 관리": contractPeriodText
    };

    setIsSubmitting(true);
    try {
      console.log("📤 구글 스프레드시트 DB POST 등록 요청 시작:", postPayload);

      // Preflight(OPTIONS) CORS 방지를 위해 text/plain;charset=utf-8 헤더 사용
      const response = await fetch(GAS_DB_URL, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8"
        },
        body: JSON.stringify(postPayload)
      });

      console.log("📥 구글 Apps Script POST 응답 상태:", response.status);

      const finalStats: PlayerStat[] = [
        {
          year: 2024,
          avg: typeof stat2024.avg === "number" ? stat2024.avg : 0,
          ops: typeof stat2024.ops === "number" ? stat2024.ops : 0,
          hr: typeof stat2024.hr === "number" ? stat2024.hr : 0,
          war: typeof stat2024.war === "number" ? stat2024.war : 0,
          salary: typeof stat2024.salaryManwon === "number" ? stat2024.salaryManwon * 10000 : 0,
        },
        {
          year: 2025,
          avg: typeof stat2025.avg === "number" ? stat2025.avg : 0,
          ops: typeof stat2025.ops === "number" ? stat2025.ops : 0,
          hr: typeof stat2025.hr === "number" ? stat2025.hr : 0,
          war: typeof stat2025.war === "number" ? stat2025.war : 0,
          salary: typeof stat2025.salaryManwon === "number" ? stat2025.salaryManwon * 10000 : 0,
        },
        {
          year: 2026,
          avg: finalAvg,
          ops: finalOps,
          hr: finalHr,
          war: finalWar,
          salary: currentSalaryWon,
        },
      ];

      const newPlayer: Player = {
        id: "p_" + Date.now(),
        name: trimmedName,
        team: team,
        position: finalPosition,
        age: finalAge,
        salaryCurrent: currentSalaryWon,
        draftYear: finalDraftYear,
        serviceTime: finalServiceTime,
        contractPeriod: contractPeriodText,
        stats: finalStats,
      };

      // 대시보드 리스트 갱신 및 모달 닫기
      onRegister(newPlayer);
      resetForm();
      onClose();

      // 성공 알림
      alert(`'${trimmedName}' 선수가 구글 데이터베이스 및 소속 로스터에 성공적으로 등록되었습니다.`);
    } catch (err: any) {
      console.error("구글 DB POST 등록 중 오류:", err);
      alert(`구글 DB 영구 저장 중 오류가 발생했습니다: ${err?.message || "네트워크 상태를 확인해주세요."}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatSalaryPreview = (manwon: number | "") => {
    if (manwon === "" || manwon === 0) return "0원";
    if (manwon >= 10000) {
      const uk = manwon / 10000;
      return `${uk.toFixed(uk % 1 === 0 ? 0 : 2)}억원 (${manwon.toLocaleString()}만원)`;
    }
    return `${manwon.toLocaleString()}만원`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="glass-card bg-[#14171d] border border-white/15 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* 모달 헤더 */}
        <div className="flex items-center justify-between p-5 border-b border-white/10 bg-white/5 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-gold/15 border border-gold/30 text-gold shadow-sm flex-shrink-0">
              <Database className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-white flex items-center gap-2 flex-wrap">
                <span className="whitespace-nowrap">신규 소속 선수 등록</span>
                <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-semibold font-mono whitespace-nowrap">
                  구글 DB 연동 및 직접 수정
                </span>
              </h3>
              <p className="text-xs text-gray-400 mt-1 break-keep-all leading-relaxed">
                선수명을 검색하여 DB에서 불러오거나, 타율·OPS·홈런·연봉을 직접 자유롭게 입력 및 수정할 수 있습니다.
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-colors cursor-pointer flex-shrink-0 ml-2"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 모달 본문 (스크롤 가능) */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* 1. DB 검색 & 기본 프로필 헤더 */}
          <div className="bg-black/30 p-4 rounded-xl border border-white/10 space-y-3.5">
            <div className="flex items-center justify-between flex-wrap gap-1">
              <span className="text-xs font-bold text-gold uppercase tracking-wider flex items-center gap-1.5 whitespace-nowrap">
                <Search className="w-3.5 h-3.5" />
                선수 기본 프로필 및 DB 조회
              </span>
              <span className="text-[11px] text-gray-400 whitespace-nowrap">구글 스프레드시트 실시간 연동</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* 선수명 */}
              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1.5 whitespace-nowrap">
                  선수명 <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="예: 손성빈, 황성빈, 김도영..."
                  value={searchName}
                  onChange={(e) => setSearchName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleFetchFromDb();
                  }}
                  className="w-full h-10 bg-black/50 border border-white/20 rounded-lg px-3 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-colors"
                />
              </div>

              {/* 소속 구단 */}
              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1.5 whitespace-nowrap">
                  소속 구단 <span className="text-rose-400">*</span>
                </label>
                <select
                  value={team}
                  onChange={(e) => setTeam(e.target.value)}
                  className="w-full h-10 bg-black/50 border border-white/20 rounded-lg px-3 text-sm text-white focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-colors"
                >
                  {mockTeams.map((t) => (
                    <option key={t.id} value={t.name} className="bg-[#1a1d24] text-white">
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* 포지션 */}
              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1.5 whitespace-nowrap">
                  포지션 <span className="text-rose-400">*</span>
                </label>
                <select
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  className="w-full h-10 bg-black/50 border border-white/20 rounded-lg px-3 text-sm text-white focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-colors"
                >
                  <option value="" className="bg-[#1a1d24] text-gray-400">
                    포지션 선택
                  </option>
                  {["포수", "투수", "1루수", "2루수", "3루수", "유격수", "외야수", "지명타자"].map((pos) => (
                    <option key={pos} value={pos} className="bg-[#1a1d24] text-white">
                      {pos}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* DB 조회 버튼 */}
            <div className="pt-1">
              <button
                type="button"
                onClick={handleFetchFromDb}
                disabled={isDbFetching || !searchName.trim()}
                className="w-full h-10 px-4 rounded-lg bg-gradient-to-r from-gold/90 to-yellow-500 hover:from-gold hover:to-yellow-400 text-black font-bold text-sm flex items-center justify-center gap-2 shadow-md shadow-gold/20 disabled:opacity-50 transition-all cursor-pointer active:scale-[0.99] whitespace-nowrap"
              >
                {isDbFetching ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-black" />
                    <span className="whitespace-nowrap">구글 스프레드시트 DB에서 선수 기록 조회 중...</span>
                  </>
                ) : (
                  <>
                    <Database className="w-4 h-4" />
                    <span className="whitespace-nowrap">구글 데이터베이스에서 정보 불러오기</span>
                  </>
                )}
              </button>
            </div>

            {/* DB 조회 알림 배너 */}
            {dbNotice && (
              <div
                className={`p-3 rounded-lg text-xs leading-relaxed border break-keep-all ${
                  dbNotice.type === "success"
                    ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-200"
                    : dbNotice.type === "warn"
                    ? "bg-amber-950/40 border-amber-500/40 text-amber-200"
                    : "bg-rose-950/40 border-rose-500/40 text-rose-200"
                }`}
              >
                {dbNotice.msg}
              </div>
            )}
          </div>

          {/* 2. 2026 핵심 성적 지표 (타율, OPS, 홈런, WAR) 직접 편집 영역 */}
          <div className="bg-[#181c24] p-4.5 rounded-xl border border-gold/40 shadow-lg space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5 flex-wrap gap-1">
              <span className="text-xs font-bold text-gold uppercase tracking-wider flex items-center gap-1.5 whitespace-nowrap">
                <Sparkles className="w-4 h-4 text-gold" />
                2026 성적 지표 (선수 검색 또는 직접 입력)
              </span>
              <span className="text-[11px] text-gray-400 whitespace-nowrap">
                {avg === "" && ops === "" && hr === "" && war === "" ? "검색 전 공란 상태" : "직접 수정 가능"}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* 타율 */}
              <div className="bg-black/50 p-3 rounded-lg border border-white/10 hover:border-gold/50 transition-colors flex flex-col justify-between">
                <label className="block text-[11px] font-bold text-gray-400 mb-1.5 whitespace-nowrap">
                  타율 (AVG)
                </label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  max="1"
                  placeholder="0.000"
                  value={avg === "" ? "" : avg}
                  onChange={(e) => setAvg(e.target.value === "" ? "" : parseFloat(e.target.value))}
                  className="w-full h-10 bg-black/60 border border-white/20 rounded-lg px-2 text-base font-extrabold text-white text-center focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold"
                />
                <span className="text-[10px] text-gray-500 block text-center mt-1.5 whitespace-nowrap">
                  {typeof avg === "number" ? (avg > 0 ? (avg >= 0.3 ? "🔥 3할 타자" : "기록됨") : "0.000") : "미입력"}
                </span>
              </div>

              {/* OPS */}
              <div className="bg-black/50 p-3 rounded-lg border border-white/10 hover:border-gold/50 transition-colors flex flex-col justify-between">
                <label className="block text-[11px] font-bold text-gray-400 mb-1.5 whitespace-nowrap">
                  OPS (출루율+장타율)
                </label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  max="2"
                  placeholder="0.000"
                  value={ops === "" ? "" : ops}
                  onChange={(e) => setOps(e.target.value === "" ? "" : parseFloat(e.target.value))}
                  className="w-full h-10 bg-black/60 border border-white/20 rounded-lg px-2 text-base font-extrabold text-white text-center focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold"
                />
                <span className="text-[10px] text-gray-500 block text-center mt-1.5 whitespace-nowrap">
                  {typeof ops === "number" ? (ops >= 0.9 ? "👑 엘리트급" : ops >= 0.8 ? "✨ 준수한 생산력" : ops > 0 ? "기록됨" : "0.000") : "미입력"}
                </span>
              </div>

              {/* 홈런 */}
              <div className="bg-black/50 p-3 rounded-lg border border-white/10 hover:border-gold/50 transition-colors flex flex-col justify-between">
                <label className="block text-[11px] font-bold text-gray-400 mb-1.5 whitespace-nowrap">
                  홈런 (개)
                </label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  placeholder="0"
                  value={hr === "" ? "" : hr}
                  onChange={(e) => setHr(e.target.value === "" ? "" : parseInt(e.target.value, 10))}
                  className="w-full h-10 bg-black/60 border border-white/20 rounded-lg px-2 text-base font-extrabold text-white text-center focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold"
                />
                <span className="text-[10px] text-gray-500 block text-center mt-1.5 whitespace-nowrap">
                  {typeof hr === "number" ? `${hr}개` : "미입력"}
                </span>
              </div>

              {/* WAR */}
              <div className="bg-black/50 p-3 rounded-lg border border-white/10 hover:border-gold/50 transition-colors flex flex-col justify-between">
                <label className="block text-[11px] font-bold text-gold mb-1.5 whitespace-nowrap">
                  WAR (기여도)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="-3"
                  max="15"
                  placeholder="0.0"
                  value={war === "" ? "" : war}
                  onChange={(e) => setWar(e.target.value === "" ? "" : parseFloat(e.target.value))}
                  className="w-full h-10 bg-black/60 border border-gold/40 rounded-lg px-2 text-base font-extrabold text-gold text-center focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold"
                />
                <span className="text-[10px] text-gold/80 block text-center mt-1.5 whitespace-nowrap">
                  {typeof war === "number" ? (war >= 3 ? "🌟 올스타급" : war > 0 ? "기록됨" : "0.0") : "미입력"}
                </span>
              </div>
            </div>

            {/* 현재 보장 연봉 & 선수 추가 프로필 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1.5 whitespace-nowrap">
                  현재 연봉 (만원 단위) <span className="text-rose-400">*</span>
                </label>
                <div className="relative flex items-center">
                  <input
                    type="number"
                    step="100"
                    min="0"
                    placeholder="0"
                    value={salaryManwon === "" ? "" : salaryManwon}
                    onChange={(e) => setSalaryManwon(e.target.value === "" ? "" : parseInt(e.target.value, 10))}
                    className="w-full h-10 bg-black/50 border border-white/20 rounded-lg px-3 pr-14 text-sm text-white focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold font-bold"
                  />
                  <span className="absolute right-3 text-xs text-gold font-semibold pointer-events-none whitespace-nowrap">
                    만원
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 mt-1.5 break-keep-all">
                  <span className="text-white font-bold whitespace-nowrap">{formatSalaryPreview(salaryManwon)}</span>
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1.5 whitespace-nowrap text-center">나이</label>
                  <input
                    type="number"
                    min="15"
                    max="50"
                    placeholder="0"
                    value={age === "" ? "" : age}
                    onChange={(e) => setAge(e.target.value === "" ? "" : parseInt(e.target.value, 10))}
                    className="w-full h-10 bg-black/50 border border-white/20 rounded-lg px-2 text-sm text-white text-center focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1.5 whitespace-nowrap text-center">입단연도</label>
                  <input
                    type="number"
                    min="1990"
                    max="2030"
                    placeholder="0"
                    value={draftYear === "" ? "" : draftYear}
                    onChange={(e) => setDraftYear(e.target.value === "" ? "" : parseInt(e.target.value, 10))}
                    className="w-full h-10 bg-black/50 border border-white/20 rounded-lg px-2 text-sm text-white text-center focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1.5 whitespace-nowrap text-center">등록일수</label>
                  <input
                    type="text"
                    placeholder="0일"
                    value={serviceTime}
                    onChange={(e) => setServiceTime(e.target.value)}
                    className="w-full h-10 bg-black/50 border border-white/20 rounded-lg px-2 text-xs text-white text-center focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 3. 에이전트와의 계약기간 입력 영역 */}
          <div className="bg-[#12151c] p-4 rounded-xl border border-white/10 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-1">
              <label className="text-xs font-bold text-gold uppercase tracking-wider flex items-center gap-1.5 whitespace-nowrap">
                <Calendar className="w-3.5 h-3.5 text-gold" />
                에이전트와의 계약기간 설정
              </label>
              <span className="text-[11px] text-gray-400 whitespace-nowrap">
                형식: <span className="font-mono text-gray-300">00년 00월 00일 ~ 00년 00월 00일</span>
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 mb-1.5 whitespace-nowrap">
                  계약 시작일
                </label>
                <input
                  type="date"
                  min="1990-01-01"
                  max="2099-12-31"
                  value={contractStartDate}
                  onChange={(e) => handleContractStartDateChange(e.target.value)}
                  className="w-full h-10 bg-black/50 border border-white/20 rounded-lg px-3 text-sm text-white focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-colors"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-400 mb-1.5 whitespace-nowrap">
                  계약 만료일
                </label>
                <input
                  type="date"
                  min="1990-01-01"
                  max="2099-12-31"
                  value={contractEndDate}
                  onChange={(e) => setContractEndDate(e.target.value)}
                  className="w-full h-10 bg-black/50 border border-white/20 rounded-lg px-3 text-sm text-white focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-colors"
                />
              </div>
            </div>

            {/* 계약기간 포맷팅 실시간 미리보기 바 */}
            <div className="bg-black/40 h-10 px-3.5 rounded-lg border border-white/5 flex items-center justify-between text-xs flex-wrap gap-2">
              <span className="text-gray-400 flex items-center gap-1.5 whitespace-nowrap">
                <Clock className="w-3.5 h-3.5 text-gold" />
                등록 시 표시 형태:
              </span>
              <span className="font-mono font-bold text-white bg-gold/15 border border-gold/30 px-2.5 py-1 rounded text-[12px] whitespace-nowrap">
                {contractStartDate && contractEndDate
                  ? `${formatDateToKorean(contractStartDate)} ~ ${formatDateToKorean(contractEndDate)}`
                  : "계약 날짜를 선택해주세요"}
              </span>
            </div>
          </div>
        </div>

        {/* 모달 푸터 버튼 */}
        <div className="flex items-center justify-between p-5 border-t border-white/10 bg-white/5 flex-shrink-0 flex-wrap gap-3">
          <p className="text-xs text-gray-400 break-keep-all leading-relaxed max-w-sm">
            선수명과 성적을 확인한 뒤 등록 버튼을 눌러주세요.
          </p>

          <div className="flex items-center gap-3 ml-auto">
            <button
              type="button"
              onClick={handleClose}
              className="h-10 px-5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 text-sm font-semibold transition-all cursor-pointer whitespace-nowrap flex items-center justify-center"
            >
              취소
            </button>
            <button
              type="button"
              disabled={!searchName.trim() || isDbFetching || isSubmitting}
              onClick={handleSave}
              className="h-10 px-6 rounded-lg bg-gold hover:bg-yellow-400 text-black text-sm font-bold shadow-lg shadow-gold/20 disabled:opacity-40 transition-all cursor-pointer whitespace-nowrap flex items-center justify-center active:scale-[0.98] gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-black" />
                  <span>DB 영구 저장 중...</span>
                </>
              ) : (
                <span>소속 로스터에 등록</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
