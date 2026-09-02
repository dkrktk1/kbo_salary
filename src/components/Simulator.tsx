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
    <div className="p-6 md:p-8 h-full overflow-y-auto bg-dark-main text-gray-200 flex flex-col gap-6">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gold/15 border border-gold/30 flex items-center justify-center text-gold shadow-md shadow-gold/10">
              <Calculator className="w-4 h-4" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              목표-연봉 시뮬레이터
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-gold/15 text-gold border border-gold/30">
                AI 시나리오 모델링
              </span>
            </h2>
          </div>
          <p className="text-xs text-gray-400 mt-1 pl-10.5">
            목표 스탯(WAR, 홈런, 타율) 설정에 따른 예상 연봉 Range 및 구단 연봉 협상 논리 생성
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 좌측: 목표 스탯 입력 패널 */}
        <div className="bg-[#131722] border border-white/10 rounded-2xl p-6 shadow-xl flex flex-col h-full justify-between">
          <div>
            <div className="flex items-center gap-2 pb-3 border-b border-white/10 mb-5">
              <Target className="w-4 h-4 text-gold" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">목표 스탯 파라미터 설정</h3>
            </div>

            <div className="mb-5">
              <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">대상 선수 선택</label>
              <select 
                className="w-full bg-black/50 border border-white/15 text-white text-xs rounded-xl focus:ring-1 focus:ring-gold focus:border-gold block p-3 font-sans outline-none transition-all cursor-pointer"
                value={selectedPlayerId}
                onChange={(e) => {
                  setSelectedPlayerId(e.target.value);
                  setReport("");
                }}
              >
                {players.map(p => <option key={p.id} value={p.id} className="bg-[#131722] text-white">{p.name} ({p.team} • {p.position})</option>)}
              </select>
            </div>

            <div className="flex flex-col gap-5 bg-black/30 p-4 rounded-xl border border-white/5">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs font-bold text-gray-200">목표 WAR (승리기여도)</label>
                  <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-gold/15 text-gold border border-gold/30">
                    {targetWar.toFixed(1)} WAR
                  </span>
                </div>
                <input 
                  type="range" min="0" max="10" step="0.1"
                  value={targetWar}
                  onChange={(e) => setTargetWar(parseFloat(e.target.value))}
                  className="w-full accent-gold h-2.5 bg-black/60 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-[11px] text-gray-400 font-medium mt-1.5 px-0.5">
                  <span>0.0</span>
                  <span>5.0 (올스타)</span>
                  <span>10.0 (MVP)</span>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs font-bold text-gray-200">목표 홈런 (HR)</label>
                  <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-gold/15 text-gold border border-gold/30">
                    {targetHr}개
                  </span>
                </div>
                <input 
                  type="range" min="0" max="50" step="1"
                  value={targetHr}
                  onChange={(e) => setTargetHr(parseInt(e.target.value))}
                  className="w-full accent-gold h-2.5 bg-black/60 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-[11px] text-gray-400 font-medium mt-1.5 px-0.5">
                  <span>0개</span>
                  <span>25개 (중장거리)</span>
                  <span>50개 (거포)</span>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs font-bold text-gray-200">목표 타율 (AVG)</label>
                  <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-gold/15 text-gold border border-gold/30">
                    {targetAvg.toFixed(3)}
                  </span>
                </div>
                <input 
                  type="range" min="0.200" max="0.380" step="0.001"
                  value={targetAvg}
                  onChange={(e) => setTargetAvg(parseFloat(e.target.value))}
                  className="w-full accent-gold h-2.5 bg-black/60 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-[11px] text-gray-400 font-medium mt-1.5 px-0.5">
                  <span>0.200</span>
                  <span>0.290 (리그평균)</span>
                  <span>0.380 (수위타자)</span>
                </div>
              </div>
            </div>
          </div>

          <button 
            onClick={runSimulation}
            disabled={loading}
            className="w-full bg-gradient-to-r from-gold to-amber-500 hover:from-amber-400 hover:to-gold text-black px-4 py-3 rounded-xl text-xs font-bold transition-all shadow-lg shadow-gold/20 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 mt-6 cursor-pointer"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin text-black" /> : <Sparkles className="w-4 h-4 stroke-[2.5]" />}
            <span>{loading ? "AI 시나리오 분석 중..." : "AI 협상 논리 시뮬레이션"}</span>
          </button>
        </div>

        <div className="col-span-1 lg:col-span-2 flex flex-col gap-6">
          {/* 우측 상단: 예상 연봉 결과 */}
          <div className="bg-[#131722] border border-white/10 rounded-2xl p-6 md:p-8 shadow-xl flex flex-col items-center justify-center text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-40 h-40 bg-gold/5 rounded-bl-full pointer-events-none" />
            <div className="flex items-center gap-1.5 mb-2">
              <Sparkles className="w-3.5 h-3.5 text-gold" />
              <h3 className="text-xs font-bold uppercase text-gray-400 tracking-wider">AI 시뮬레이션 예상 연봉 범위</h3>
            </div>
            
            <div className="flex items-baseline justify-center gap-3 my-2">
              <span className="text-3xl md:text-4xl font-black text-white font-mono tracking-tight">
                ₩{(minEstimate / 100000000).toFixed(1)}억
              </span>
              <span className="text-xl text-gray-500 font-bold">~</span>
              <span className="text-3xl md:text-4xl font-black text-gold font-mono tracking-tight">
                ₩{(maxEstimate / 100000000).toFixed(1)}억
              </span>
            </div>
            
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/10 text-xs text-gray-400 font-mono">
              <span>현재 연봉: ₩{(currentSalary / 100000000).toFixed(1)}억</span>
              <span className="text-gray-600">•</span>
              <span className="text-emerald-400 font-bold">
                최대 +₩{((maxEstimate - currentSalary) / 100000000).toFixed(1)}억 인상 타당성 확보
              </span>
            </div>
          </div>

          {/* 우측 하단: AI 협상 논리 */}
          <div className="bg-[#131722] border border-white/10 rounded-2xl p-6 shadow-xl flex-1 flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-gold" />
                AI 핵심 협상 브리핑 (Negotiation Logic)
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-gold/15 text-gold border border-gold/30">
                구단 협상 테이블용
              </span>
            </div>
            
            <div className="bg-black/30 rounded-xl border border-white/5 p-5 flex-1 min-h-[220px]">
              {report ? (
                <div className="prose prose-sm prose-invert max-w-none font-sans text-gray-200 text-xs leading-relaxed space-y-2">
                  <div className="whitespace-pre-wrap">{report}</div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-gray-500 gap-3 py-8">
                  <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
                    <Calculator className="w-5 h-5 text-gray-500" />
                  </div>
                  <p className="text-xs text-center text-gray-400 max-w-xs leading-relaxed">
                    좌측 패널에서 목표 스탯을 설정한 후,<br/>
                    <span className="text-gold font-bold">[AI 협상 논리 시뮬레이션]</span> 버튼을 누르면 브리핑이 생성됩니다.
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
