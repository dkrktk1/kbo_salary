import { mockTeams } from "../data";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Users, TrendingUp, DollarSign, ShieldAlert, Award, PieChart as PieIcon } from "lucide-react";

const COLORS = ['#E5A93C', '#F59E0B', '#3B82F6', '#10B981', '#8B5CF6'];

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

export default function TeamAnalysis() {
  const costPerWarData = mockTeams.map(team => ({
    name: team.name,
    costPerWar: team.costPerWar / 100000000 // In 100 millions (억)
  })).sort((a, b) => b.costPerWar - a.costPerWar);

  const payrollData = mockTeams.map(team => ({
    name: team.name,
    payroll: team.currentPayroll / 100000000 // In 100 millions (억)
  })).sort((a, b) => b.payroll - a.payroll);

  return (
    <div className="p-6 md:p-8 h-full overflow-y-auto bg-dark-main text-gray-200 flex flex-col gap-6">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gold/15 border border-gold/30 flex items-center justify-center text-gold shadow-md shadow-gold/10">
              <Users className="w-4 h-4" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              KBO 구단별 예산 및 샐러리캡 분석
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-gold/15 text-gold border border-gold/30">
                10개 구단 비교
              </span>
            </h2>
          </div>
          <p className="text-xs text-gray-400 mt-1 pl-10.5">
            구단별 샐러리캡 여력(Cap Margin), 투타 예산 배분 및 WAR 1당 효율성 랭킹
          </p>
        </div>
      </div>

      {/* 상단: 구단별 샐러리캡 카드 그리드 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {mockTeams.map(team => {
          const capSpace = team.salaryCap - team.currentPayroll;
          const capUsagePercent = (team.currentPayroll / team.salaryCap) * 100;
          
          const posData = [
            { name: "투수", value: (team.currentPayroll * team.positionalSpending.pitcher) / 100, percent: team.positionalSpending.pitcher },
            { name: "타자", value: (team.currentPayroll * (team.positionalSpending.catcher + team.positionalSpending.infield + team.positionalSpending.outfield)) / 100, percent: team.positionalSpending.catcher + team.positionalSpending.infield + team.positionalSpending.outfield },
          ];

          return (
            <div key={team.id} className="bg-[#131722] border border-white/10 rounded-2xl p-5 shadow-xl flex flex-col gap-4">
              {/* 상단: 구단명 및 샐러리캡 여력 */}
              <div className="pb-3 border-b border-white/10">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      {team.name}
                      <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${team.winNowMode ? 'bg-gold/15 text-gold border border-gold/30' : 'bg-white/5 text-gray-400 border border-white/10'}`}>
                        {team.winNowMode ? "윈나우 (우승 도전)" : "리빌딩 (육성 체제)"}
                      </span>
                    </h3>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] text-gray-400 font-bold uppercase tracking-wider">여유 금액 (Cap Margin)</p>
                    <p className="text-sm font-bold font-mono text-emerald-400">₩{formatCurrency(capSpace > 0 ? capSpace : 0)}</p>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-mono font-medium text-gray-400 mb-1.5">
                    <span className="flex items-center gap-1 text-gray-300">
                      소진율 <strong className={capUsagePercent > 95 ? "text-red-400" : "text-gold"}>{capUsagePercent.toFixed(1)}%</strong>
                    </span>
                    <span>상한액 ₩{formatCurrency(team.salaryCap)}</span>
                  </div>
                  <div className="w-full bg-black/60 rounded-full h-2.5 border border-white/10 overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${capUsagePercent > 95 ? 'bg-gradient-to-r from-amber-500 to-red-500' : 'bg-gradient-to-r from-amber-500 to-gold'}`} 
                      style={{ width: `${Math.min(capUsagePercent, 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between items-center text-[11px] text-gray-500 mt-1.5 font-mono">
                    <span>산정대상 연봉: ₩{formatCurrency(team.currentPayroll)}</span>
                    <span>잔여 Cap: {capSpace > 0 ? `+${(capSpace / 100000000).toFixed(1)}억` : '초과'}</span>
                  </div>
                </div>
              </div>

              {/* 중단: 투타별 예산 분배 */}
              <div className="bg-black/30 rounded-xl border border-white/5 p-3.5 flex flex-col justify-center">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-gray-400 flex items-center gap-1.5">
                    <PieIcon className="w-3.5 h-3.5 text-gold" />
                    포지션별 예산 분배
                  </h4>
                </div>
                <div className="flex items-center justify-center gap-4">
                  <div className="w-[110px] h-[110px] flex-shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={posData}
                          cx="50%"
                          cy="50%"
                          innerRadius={28}
                          outerRadius={50}
                          paddingAngle={3}
                          dataKey="value"
                          stroke="rgba(0,0,0,0.5)"
                          strokeWidth={2}
                        >
                          {posData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip 
                          formatter={(val: any) => formatCurrency(Number(val))} 
                          contentStyle={{ backgroundColor: '#131722', borderColor: 'rgba(255,255,255,0.15)', color: '#fff', borderRadius: '10px', fontSize: '12px' }} 
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex flex-col gap-1.5 flex-1 text-xs">
                    {posData.map((entry, index) => (
                      <div key={index} className="flex items-center justify-between bg-black/40 px-2.5 py-1.5 rounded-lg border border-white/5">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                          <span className="text-gray-300 font-medium">{entry.name} ({entry.percent}%)</span>
                        </div>
                        <span className="font-mono font-bold text-white">{formatCurrency(entry.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 하단: 구단별 샐러리캡 기준 연봉 */}
      <div className="bg-[#131722] border border-white/10 rounded-2xl p-5 md:p-6 shadow-xl">
        <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-400" />
            구단별 샐러리캡 기준 연봉 순위 (산정대상 총액)
          </h3>
          <span className="text-[11px] font-mono text-gray-400">단위: 억원</span>
        </div>
        <div className="w-full h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={payrollData}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={true} vertical={false} />
              <XAxis type="number" tickFormatter={(val) => `₩${val}억`} stroke="#6b7280" tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <YAxis dataKey="name" type="category" stroke="#6b7280" tick={{ fill: '#e5e7eb', fontSize: 12, fontWeight: '600' }} width={110} />
              <Tooltip 
                formatter={(val: any) => [`₩${Math.round(Number(val)).toLocaleString()}억`, "산정대상 연봉 합계"]} 
                contentStyle={{ backgroundColor: '#131722', borderColor: 'rgba(255,255,255,0.15)', color: '#fff', borderRadius: '12px', fontSize: '12px' }} 
              />
              <Bar dataKey="payroll" fill="#10B981" radius={[0, 6, 6, 0]}>
                {
                  payrollData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={index === 0 ? "#10B981" : "rgba(16,185,129,0.55)"} />
                  ))
                }
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 하단: Cost per WAR 현황 */}
      <div className="bg-[#131722] border border-white/10 rounded-2xl p-5 md:p-6 shadow-xl">
        <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Award className="w-4 h-4 text-gold" />
            WAR 1당 지출 효율성 분석 (Cost per WAR 지출 랭킹)
          </h3>
          <span className="text-[11px] font-mono text-gray-400">단위: 억원 / 1 WAR</span>
        </div>
        <div className="w-full h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={costPerWarData}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={true} vertical={false} />
              <XAxis type="number" tickFormatter={(val) => `₩${val}억`} stroke="#6b7280" tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <YAxis dataKey="name" type="category" stroke="#6b7280" tick={{ fill: '#e5e7eb', fontSize: 12, fontWeight: '600' }} width={110} />
              <Tooltip 
                formatter={(val: number) => [`₩${val.toFixed(1)}억`, "WAR 1당 비용"]} 
                contentStyle={{ backgroundColor: '#131722', borderColor: 'rgba(255,255,255,0.15)', color: '#fff', borderRadius: '12px', fontSize: '12px' }} 
              />
              <Bar dataKey="costPerWar" fill="#E5A93C" radius={[0, 6, 6, 0]}>
                {
                  costPerWarData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={index === 0 ? "#E5A93C" : "rgba(229,169,60,0.55)"} />
                  ))
                }
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

