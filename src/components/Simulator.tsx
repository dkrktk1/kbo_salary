import { useState, useEffect } from "react";
import { loadStoredPlayers, Player } from "../data";
import { Calculator, Sparkles, Loader2, Target, TrendingUp } from "lucide-react";

export default function Simulator() {
  const [players, setPlayers] = useState<Player[]>(loadStoredPlayers);
  const [selectedPlayerId, setSelectedPlayerId] = useState(() => {
    const list = loadStoredPlayers();
    return list[0]?.id || "";
  });
  const [targetWar, setTargetWar] = useState(5.0);
  const [targetHr, setTargetHr] = useState(20);
  const [targetAvg, setTargetAvg] = useState(0.280);
  
  const [report, setReport] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handleUpdate = () => {
      const updated = loadStoredPlayers();
      setPlayers(updated);
      if (!updated.some(p => p.id === selectedPlayerId) && updated.length > 0) {
        setSelectedPlayerId(updated[0].id);
      }
    };
    window.addEventListener("kbo_players_updated", handleUpdate);
    return () => window.removeEventListener("kbo_players_updated", handleUpdate);
  }, [selectedPlayerId]);

  const player = players.find(p => p.id === selectedPlayerId) || players[0];
  const currentSalary = player?.salaryCurrent || 0;

  if (players.length === 0) {
    return (
      <div className="p-8 h-full overflow-y-auto bg-dark-main text-gray-200 flex flex-col gap-6">
        <div className="mb-2">
          <h2 className="text-2xl font-sans font-bold tracking-tight text-white">목표-연봉 시뮬레이터</h2>
          <p className="text-[14px] text-gray-400 uppercase tracking-widest mt-1">목표 스탯 기반 예상 연봉 및 협상 논리</p>
        </div>

        <div className="glass-card rounded-xl p-12 flex flex-col items-center justify-center text-center gap-4 border border-white/10">
          <Calculator className="w-12 h-12 text-gold/50" />
          <div>
            <h3 className="text-lg font-bold text-white mb-1">등록된 소속 선수가 없습니다</h3>
            <p className="text-sm text-gray-400 max-w-md">
              대시보드(Home) 화면에서 [선수 추가 (DB 조회)]를 통해 구글 스프레드시트 DB로부터 선수를 등록한 후 시뮬레이터를 이용할 수 있습니다.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 단순화된 예상 연봉 Range 계산 (Client-side mock logic)
  // WAR 1당 약 1.5억 가치, HR당 1000만, AVG 1푼당 1000만 변동이라고 가정
  const warValue = targetWar * 150000000;
  const hrValue = targetHr * 10000000;
  const avgValue = targetAvg * 1000 * 10000000;
  
  const baseEstimate = Math.floor(warValue + hrValue + avgValue - 100000000);
  const minEstimate = Math.max(currentSalary, baseEstimate * 0.9);
  const maxEstimate = Math.max(currentSalary * 1.1, baseEstimate * 1.2);

  async function runSimulation() {
    setLoading(true);
    try {
      const targetStats = {
        war: targetWar,
        hr: targetHr,
        avg: targetAvg,
      };
      
      const res = await fetch("/api/gemini/simulator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerData: player, targetStats })
      });
      const data = await res.json();
      if (res.ok) {
        setReport(data.text);
      } else {
        setReport("시뮬레이션 실행 실패: " + data.error);
      }
    } catch (e: any) {
      // API가 연결 안 된 경우 목데이터 표시
      setTimeout(() => {
        setReport(`• **지속적인 장타력 입증**: 목표 홈런 ${targetHr}개를 달성한다면, 리그 내 희소성 있는 파워히터로서의 가치를 극대화할 수 있습니다.
• **수비 안정성을 바탕으로 한 WAR 상승**: 목표 WAR ${targetWar.toFixed(1)}은 팀 내 핵심 코어 선수임을 증명하며, 대체 선수 대비 명확한 우위를 점합니다.
• **시장 가치 대비 저평가 어필**: 현재 비슷한 스탯의 타 구단 선수들이 평균 ${(maxEstimate/100000000).toFixed(0)}억 수준의 계약을 맺고 있으므로, 시장 가치에 부합하는 정당한 보상을 요구해야 합니다.`);
        setLoading(false);
      }, 1000);
      return;
    }
    setLoading(false);
  }

  return (
    <div className="p-8 h-full overflow-y-auto bg-dark-main text-gray-200 flex flex-col gap-6">
      <div className="mb-2">
        <h2 className="text-2xl font-sans font-bold tracking-tight text-white">목표-연봉 시뮬레이터</h2>
        <p className="text-[14px] text-gray-400 uppercase tracking-widest mt-1">목표 스탯 기반 예상 연봉 및 협상 논리</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 좌측: 목표 스탯 입력 패널 */}
        <div className="glass-card rounded-xl p-6 flex flex-col h-full">
          <div className="flex items-center gap-2 mb-6">
            <Target className="w-5 h-5 text-gold" />
            <h3 className="text-[16px] uppercase font-bold text-white tracking-widest">목표 스탯 입력 패널</h3>
          </div>

          <div className="mb-6">
            <label className="block text-[14px] uppercase font-bold text-gray-500 mb-2 tracking-widest">선수 선택</label>
            <select 
              className="w-full bg-black/40 border border-white/10 text-white text-sm rounded focus:ring-gold focus:border-gold block p-2.5 font-sans outline-none"
              value={selectedPlayerId}
              onChange={(e) => {
                setSelectedPlayerId(e.target.value);
                setReport("");
              }}
            >
              {players.map(p => <option key={p.id} value={p.id} className="bg-dark-aside">{p.name} ({p.team})</option>)}
            </select>
          </div>

          <div className="flex-1 flex flex-col gap-6">
            <div>
              <div className="flex justify-between mb-1">
                <label className="text-[14px] font-bold text-gray-300">목표 WAR (대체 선수 대비 승리기여도)</label>
                <span className="text-[14px] text-gold font-bold">{targetWar.toFixed(1)}</span>
              </div>
              <input 
                type="range" min="0" max="10" step="0.1"
                value={targetWar}
                onChange={(e) => setTargetWar(parseFloat(e.target.value))}
                className="w-full accent-gold h-2 bg-black/50 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <label className="text-[14px] font-bold text-gray-300">목표 홈런 (HR)</label>
                <span className="text-[14px] text-gold font-bold">{targetHr}개</span>
              </div>
              <input 
                type="range" min="0" max="50" step="1"
                value={targetHr}
                onChange={(e) => setTargetHr(parseInt(e.target.value))}
                className="w-full accent-gold h-2 bg-black/50 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <label className="text-[14px] font-bold text-gray-300">목표 타율 (AVG)</label>
                <span className="text-[14px] text-gold font-bold">{targetAvg.toFixed(3)}</span>
              </div>
              <input 
                type="range" min="0.200" max="0.380" step="0.001"
                value={targetAvg}
                onChange={(e) => setTargetAvg(parseFloat(e.target.value))}
                className="w-full accent-gold h-2 bg-black/50 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>

          <button 
            onClick={runSimulation}
            disabled={loading}
            className="w-full bg-gold text-black hover:bg-yellow-500 px-4 py-3 rounded text-[13px] font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2 mt-8"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
            {loading ? "AI 분석 중..." : "AI 협상 논리 생성"}
          </button>
        </div>

        <div className="col-span-1 lg:col-span-2 flex flex-col gap-6">
          {/* 우측 상단: 예상 연봉 결과 */}
          <div className="glass-card rounded-xl p-8 flex flex-col items-center justify-center text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gold/10 rounded-bl-[100px] z-0"></div>
            <h3 className="text-[14px] uppercase font-bold text-gray-500 tracking-widest mb-2 z-10">AI 예상 연봉 Range (최소 ~ 최대)</h3>
            <div className="flex items-end justify-center gap-2 z-10">
              <span className="text-[40px] font-extrabold text-white font-sans tracking-tighter">
                ₩{(minEstimate / 100000000).toFixed(1)}억
              </span>
              <span className="text-2xl text-gray-500 pb-1">~</span>
              <span className="text-[40px] font-extrabold text-gold font-sans tracking-tighter">
                ₩{(maxEstimate / 100000000).toFixed(1)}억
              </span>
            </div>
            <p className="text-[13px] text-gray-400 mt-4 z-10">
              현재 연봉: ₩{(currentSalary / 100000000).toFixed(1)}억 (
              <span className="text-green-400 ml-1">
                +₩{((maxEstimate - currentSalary) / 100000000).toFixed(1)}억 인상 가능
              </span>)
            </p>
          </div>

          {/* 우측 하단: AI 협상 논리 */}
          <div className="glass-card rounded-xl p-6 flex-1 flex flex-col">
            <h3 className="text-[14px] font-bold uppercase tracking-widest text-gold flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-gold" />
              AI 핵심 협상 논리 (Negotiation Points)
            </h3>
            
            <div className="bg-black/20 rounded border border-white/5 p-6 flex-1 h-full min-h-[250px]">
              {report ? (
                <div className="prose prose-sm prose-invert max-w-none font-sans text-gray-200">
                  <div className="whitespace-pre-wrap leading-relaxed">{report}</div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-gray-600 gap-3">
                  <Calculator className="w-10 h-10 opacity-20" />
                  <p className="text-xs uppercase tracking-widest text-center max-w-sm">
                    좌측에서 목표 스탯을 설정한 뒤,<br/>하단 버튼을 눌러 협상 논리를 생성하세요
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
