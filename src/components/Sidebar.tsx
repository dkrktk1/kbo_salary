import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, User, Calculator, SearchCode, Zap } from "lucide-react";
import clsx from "clsx";

export default function Sidebar() {
  const location = useLocation();

  const links = [
    { name: "에이전시 정보", path: "/", icon: LayoutDashboard },
    { name: "구단 분석", path: "/team", icon: Users },
    { name: "구단 성향 역산", path: "/reverse-engineering", icon: SearchCode },
    { name: "선수 리포트", path: "/player", icon: User },
    { name: "연봉 시뮬레이터", path: "/simulator", icon: Calculator },
  ];

  return (
    <div className="w-[30%] min-w-[280px] max-w-[320px] bg-[#0A0D14] border-r border-white/10 flex flex-col shadow-2xl relative z-20 select-none">
      {/* 로고 영역 */}
      <div className="p-6 border-b border-white/10 bg-[#0A0D14]">
        <div className="flex items-center gap-2.5 mb-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-gold to-amber-600 flex items-center justify-center text-black font-black shadow-lg shadow-gold/20">
            <Zap className="w-4 h-4 fill-black text-black" />
          </div>
          <div>
            <h1 className="text-xs tracking-wider font-bold text-gold uppercase">KBO 에이전트 시스템</h1>
            <div className="text-sm font-black tracking-tight text-white font-sans">
              NOWIWON MANAGEMENT GROUP
            </div>
          </div>
        </div>
        <p className="text-xs text-gray-400 font-medium">데이터 기반 연봉 협상 및 전력 분석</p>
      </div>
      
      {/* 메인 메뉴 네비게이션 */}
      <div className="flex flex-col flex-1 py-4 px-3 space-y-1 bg-[#0A0D14]">
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
    </div>
  );
}


