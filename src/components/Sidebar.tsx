import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, User, Calculator, SearchCode, Shield, Zap } from "lucide-react";
import clsx from "clsx";

export default function Sidebar() {
  const location = useLocation();

  const links = [
    { name: "대시보드", path: "/", icon: LayoutDashboard },
    { name: "구단 분석", path: "/team", icon: Users },
    { name: "구단 성향 역산", path: "/reverse-engineering", icon: SearchCode },
    { name: "선수 리포트", path: "/player", icon: User },
    { name: "연봉 시뮬레이터", path: "/simulator", icon: Calculator },
  ];

  return (
    <div className="w-[30%] min-w-[280px] max-w-[320px] bg-[#0E111A] border-r border-white/10 flex flex-col shadow-2xl relative z-20 select-none">
      {/* 로고 영역 */}
      <div className="p-6 border-b border-white/10 bg-black/20">
        <div className="flex items-center gap-2.5 mb-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-gold to-amber-600 flex items-center justify-center text-black font-black shadow-lg shadow-gold/20">
            <Zap className="w-4 h-4 fill-black text-black" />
          </div>
          <div>
            <h1 className="text-xs tracking-wider font-bold text-gold uppercase">KBO 에이전트 시스템</h1>
            <div className="text-sm font-black tracking-tight text-white font-sans">
              NOWIWON SPORTS
            </div>
          </div>
        </div>
        <p className="text-xs text-gray-400 font-medium">데이터 기반 연봉 협상 및 전력 분석</p>
      </div>
      
      {/* 메인 메뉴 네비게이션 */}
      <div className="flex flex-col flex-1 py-4 px-3 space-y-1">
        <div className="px-3 py-2 text-xs uppercase tracking-wider text-gray-400 font-bold">
          메인 메뉴
        </div>
        {links.map((link) => {
          const Icon = link.icon;
          const isActive = location.pathname === link.path;
          return (
            <Link
              key={link.path}
              to={link.path}
              className={clsx(
                "flex items-center gap-3.5 px-3.5 py-3 rounded-xl text-xs font-semibold transition-all group",
                isActive 
                  ? "bg-gold/15 text-white border border-gold/30 shadow-md shadow-gold/10 font-bold" 
                  : "text-gray-300 hover:text-white hover:bg-white/5 border border-transparent"
              )}
            >
              <div className={clsx(
                "w-7 h-7 rounded-lg flex items-center justify-center transition-colors",
                isActive ? "bg-gold text-black shadow-sm" : "bg-white/5 text-gray-400 group-hover:text-gold group-hover:bg-gold/10"
              )}>
                <Icon className="w-3.5 h-3.5 stroke-[2.2]" />
              </div>
              <span className="tracking-tight">{link.name}</span>
              {isActive && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-gold animate-pulse" />
              )}
            </Link>
          );
        })}
      </div>
      
      {/* 하단 에이전트 프로필 */}
      <div className="p-4 m-3 rounded-2xl bg-black/40 border border-white/10 mt-auto shadow-inner">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-400 font-medium">담당 에이전트</span>
          <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
            인증됨
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-gray-800 to-gray-700 border border-gold/40 flex items-center justify-center text-xs font-bold text-gold shadow-md">
            AG
          </div>
          <div>
            <div className="text-xs font-bold text-white">수석 에이전트 한</div>
            <div className="text-xs text-gray-300 flex items-center gap-1 mt-0.5">
              <Shield className="w-3 h-3 text-gold" />
              <span>보안 등급 4 (KBO 라이선스)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

