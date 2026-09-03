import { mockTeams } from "../data";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Users, TrendingUp, DollarSign, ShieldAlert, Award, PieChart as PieIcon } from "lucide-react";

// 투수(선명한 스카이블루) vs 타자(선명한 골드/앰버) 고대비 색상 적용
const POSITION_COLORS: Record<string, string> = {
  "투수": "#38BDF8", // 쿨 스카이블루
  "타자": "#F59E0B", // 웜 골드/앰버
};
const DEFAULT_COLORS = ['#38BDF8', '#F59E0B', '#10B981', '#8B5CF6'];

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
            <div key={team.id} className="bg-[#131722] border border-white/10 rounded-2xl p-5 md:p-6 shadow-xl flex flex-col gap-4">
              {/* 상단: 구단명 및 샐러리캡 여력 */}
              <div className="pb-3 border-b border-white/10">
                <div className="flex justify-between items-start mb-3 gap-2">
                  <div className="whitespace-nowrap">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2.5 whitespace-nowrap">
                      <span>{team.name}</span>
                      <span className={`px-2.5 py-1 rounded-md text-xs font-bold whitespace-nowrap ${team.winNowMode ? 'bg-gold/15 text-gold border border-gold/30' : 'bg-white/5 text-gray-400 border border-white/10'}`}>
                        {team.winNowMode ? "윈나우 (우승 도전)" : "리빌딩 (육성 체제)"}
                      </span>
                    </h3>
                  </div>
                  <div className="text-right whitespace-nowrap flex-shrink-0">
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-wider whitespace-nowrap">여유 금액 (Cap Margin)</p>
                    <p className="text-base font-bold font-mono text-emerald-400 whitespace-nowrap">₩{formatCurrency(capSpace > 0 ? capSpace : 0)}</p>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-sm font-mono font-medium text-gray-300 mb-1.5 whitespace-nowrap gap-2">
                    <span className="flex items-center gap-1.5 text-gray-200 whitespace-nowrap">
                      소진율 <strong className={capUsagePercent > 95 ? "text-red-400 font-bold" : "text-gold font-bold"}>{capUsagePercent.toFixed(1)}%</strong>
                    </span>
                    <span className="text-gray-300 font-medium whitespace-nowrap">상한액 ₩{formatCurrency(team.salaryCap)}</span>
                  </div>
                  <div className="w-full bg-black/60 rounded-full h-3 border border-white/10 overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${capUsagePercent > 95 ? 'bg-gradient-to-r from-amber-500 to-red-500' : 'bg-gradient-to-r from-amber-500 to-gold'}`} 
                      style={{ width: `${Math.min(capUsagePercent, 100)}%` }}
                    />
                  </div>
                  {/* 산정대상 연봉 글자 색상을 상한액과 동일한 text-gray-300, 폰트 크기 증가(text-xs/text-sm) */}
                  <div className="flex justify-between items-center text-xs text-gray-300 mt-2 font-mono font-medium whitespace-nowrap gap-2">
                    <span className="text-gray-300 whitespace-nowrap">산정대상 연봉: <strong className="text-white font-bold whitespace-nowrap">₩{formatCurrency(team.currentPayroll)}</strong></span>
                    <span className={`whitespace-nowrap font-bold ${capSpace > 0 ? "text-emerald-400" : "text-red-400"}`}>
                      잔여 Cap: {capSpace > 0 ? `+${(capSpace / 100000000).toFixed(1)}억` : '초과'}
                    </span>
                  </div>
                </div>
              </div>

              {/* 중단: 투타별 예산 분배 */}
              <div className="bg-black/30 rounded-xl border border-white/5 p-4 flex flex-col justify-center">
                <div className="flex items-center justify-between mb-3 whitespace-nowrap">
                  <h4 className="text-sm font-bold text-gray-300 flex items-center gap-1.5 whitespace-nowrap">
                    <PieIcon className="w-4 h-4 text-gold flex-shrink-0" />
                    <span>포지션별 예산 분배</span>
                  </h4>
                </div>
                {/* 도넛 그래프와 뱃지를 중앙 배치 & 1줄 강제 유지 (whitespace-nowrap) */}
                <div className="flex items-center justify-center gap-4 sm:gap-6 py-1">
                  <div className="w-[110px] h-[110px] flex-shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={posData}
                          cx="50%"
                          cy="50%"
                          innerRadius={28}
                          outerRadius={52}
                          paddingAngle={3}
                          dataKey="value"
                          stroke="rgba(0,0,0,0.5)"
                          strokeWidth={2}
                        >
                          {posData.map((entry, index) => {
                            const color = POSITION_COLORS[entry.name] || DEFAULT_COLORS[index % DEFAULT_COLORS.length];
                            return <Cell key={`cell-${index}`} fill={color} />;
                          })}
                        </Pie>
                        <Tooltip 
                          formatter={(val: any) => formatCurrency(Number(val))} 
                          contentStyle={{ backgroundColor: '#131722', borderColor: 'rgba(255,255,255,0.15)', color: '#fff', borderRadius: '10px', fontSize: '13px' }} 
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  {/* 투수, 타자 비율 뱃지: 항상 가로 1줄로 표시되도록 충분한 너비와 whitespace-nowrap 보장 */}
                  <div className="flex flex-col gap-2.5 flex-1 max-w-[270px]">
                    {posData.map((entry, index) => {
                      const color = POSITION_COLORS[entry.name] || DEFAULT_COLORS[index % DEFAULT_COLORS.length];
                      return (
                        <div 
                          key={index} 
                          className="flex items-center justify-between gap-2.5 sm:gap-3 bg-black/40 px-3.5 py-2 rounded-xl border border-white/5 hover:border-white/15 transition-colors shadow-sm whitespace-nowrap"
                        >
                          <div className="flex items-center gap-2 whitespace-nowrap flex-shrink-0">
                            <div className="w-3 h-3 rounded-full shadow-sm flex-shrink-0" style={{ backgroundColor: color }} />
                            <span className="text-gray-100 font-bold text-sm whitespace-nowrap">{entry.name}</span>
                            <span className="text-xs font-mono font-medium text-gray-400 whitespace-nowrap">({entry.percent}%)</span>
                          </div>
                          <span className="font-mono font-bold text-white text-sm whitespace-nowrap ml-auto">{formatCurrency(entry.value)}</span>
                        </div>
                      );
                    })}
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

