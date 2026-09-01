import { mockTeams } from "../data";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

const COLORS = ['#C4A46A', '#3b82f6', '#10b981', '#f59e0b', '#e2e8f0'];


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
    <div className="p-8 h-full overflow-y-auto bg-dark-main text-gray-200">
      <div className="mb-8">
        <h2 className="text-2xl font-sans font-bold tracking-tight text-white">구단 분석</h2>
        <p className="text-[14px] text-gray-400 uppercase tracking-widest mt-1">예산 소진율 및 지출 랭킹</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {mockTeams.map(team => {
          const capSpace = team.salaryCap - team.currentPayroll;
          const capUsagePercent = (team.currentPayroll / team.salaryCap) * 100;
          
          const posData = [
            { name: "투수", value: (team.currentPayroll * team.positionalSpending.pitcher) / 100, percent: team.positionalSpending.pitcher },
            { name: "타자", value: (team.currentPayroll * (team.positionalSpending.catcher + team.positionalSpending.infield + team.positionalSpending.outfield)) / 100, percent: team.positionalSpending.catcher + team.positionalSpending.infield + team.positionalSpending.outfield },
          ];

          return (
            <div key={team.id} className="glass-card rounded-xl p-6 flex flex-col gap-6">
              {/* 상단: 샐러리캡 여력 게이지 */}
              <div>
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-[16px] font-bold text-white">{team.name}</h3>
                    <div className="flex items-center gap-2 mt-2">
                      <span className={`px-2 py-0.5 rounded text-[13px] font-sans font-bold uppercase tracking-wider ${team.winNowMode ? 'bg-gold/20 text-gold' : 'bg-white/10 text-gray-300'}`}>
                        {team.winNowMode ? "윈나우 (우승 도전)" : "리빌딩 (육성)"}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[13px] text-gray-500 uppercase tracking-widest font-bold">여유 금액(Cap Margin)</p>
                    <p className="text-[16px] font-bold text-green-400 font-sans">₩{formatCurrency(capSpace > 0 ? capSpace : 0)}</p>
                    <div className="mt-2">
                      <p className="text-[13px] text-gray-500 uppercase tracking-widest font-bold">산정대상 연봉 합계</p>
                      <p className="text-[16px] font-bold text-white font-sans">₩{formatCurrency(team.currentPayroll)}</p>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[13px] uppercase font-bold text-gray-500 mb-1">
                    <span>소진율 {capUsagePercent.toFixed(1)}%</span>
                    <span>상한액 ₩{formatCurrency(team.salaryCap)}</span>
                  </div>
                  <div className="w-full bg-black/40 rounded-full h-3 border border-white/5">
                    <div 
                      className={`h-full rounded-full ${capUsagePercent > 95 ? 'bg-red-500' : 'bg-gold'}`} 
                      style={{ width: `${Math.min(capUsagePercent, 100)}%` }}
                    ></div>
                  </div>
                </div>
              </div>

              {/* 중단: 투타별 예산 분배 */}
              <div className="flex-1 min-h-[180px] flex flex-col justify-center bg-black/20 rounded-lg border border-white/5 p-4">
                <h4 className="text-[13px] uppercase font-bold text-gray-500 mb-2 tracking-widest text-center">투타 예산 비중</h4>
                <div className="flex-1 min-h-[150px] w-full flex items-center justify-center">
                  <div className="w-[140px] h-[140px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={posData}
                          cx="50%"
                          cy="50%"
                          innerRadius={35}
                          outerRadius={65}
                          paddingAngle={2}
                          dataKey="value"
                          stroke="rgba(255,255,255,0.05)"
                        >
                          {posData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(val: any) => formatCurrency(Number(val))} contentStyle={{ backgroundColor: '#111318', borderColor: 'rgba(255,255,255,0.1)', color: '#fff' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex flex-col gap-2 pl-[1ch]">
                    {posData.map((entry, index) => (
                      <div key={index} className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                        <span className="text-gray-300 font-sans text-[12px] font-bold tracking-wider">
                          {entry.name}({entry.percent}%) : {formatCurrency(entry.value)}
                        </span>
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
      <div className="glass-card rounded-xl p-6 mb-6">
        <h3 className="text-[16px] uppercase font-bold text-gold tracking-widest mb-6">구단별 샐러리캡 기준 연봉 (산정대상 연봉 합계)</h3>
        <div className="w-full h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={payrollData}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={true} vertical={false} />
              <XAxis type="number" tickFormatter={(val) => `₩${val}억`} stroke="#6b7280" tick={{ fill: '#9ca3af', fontSize: 12 }} />
              <YAxis dataKey="name" type="category" stroke="#6b7280" tick={{ fill: '#9ca3af', fontSize: 12, fontWeight: 'bold' }} width={120} />
              <Tooltip 
                formatter={(val: any) => [`₩${Math.round(Number(val)).toLocaleString()}억`, "산정대상 연봉 합계"]} 
                contentStyle={{ backgroundColor: '#111318', borderColor: 'rgba(255,255,255,0.1)', color: '#fff', borderRadius: '8px' }} 
              />
              <Bar dataKey="payroll" fill="#10b981" radius={[0, 4, 4, 0]}>
                {
                  payrollData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index === 0 ? "#10b981" : "rgba(16,185,129,0.5)"} />
                  ))
                }
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 하단: Cost per WAR 현황 */}
      <div className="glass-card rounded-xl p-6">
        <h3 className="text-[16px] uppercase font-bold text-gold tracking-widest mb-6">Cost per WAR 현황 (지출 랭킹)</h3>
        <div className="w-full h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={costPerWarData}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={true} vertical={false} />
              <XAxis type="number" tickFormatter={(val) => `₩${val}억`} stroke="#6b7280" tick={{ fill: '#9ca3af', fontSize: 12 }} />
              <YAxis dataKey="name" type="category" stroke="#6b7280" tick={{ fill: '#9ca3af', fontSize: 12, fontWeight: 'bold' }} width={120} />
              <Tooltip 
                formatter={(val: number) => [`₩${val.toFixed(1)}억`, "WAR 1당 비용"]} 
                contentStyle={{ backgroundColor: '#111318', borderColor: 'rgba(255,255,255,0.1)', color: '#fff', borderRadius: '8px' }} 
              />
              <Bar dataKey="costPerWar" fill="#C4A46A" radius={[0, 4, 4, 0]}>
                {
                  costPerWarData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index === 0 ? "#C4A46A" : "rgba(196,164,106,0.5)"} />
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
