import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, User, Calculator, TrendingUp, SearchCode } from "lucide-react";
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
    <div className="w-[30%] min-w-[280px] max-w-[320px] bg-dark-aside border-r border-white/5 flex flex-col">
      <div className="p-6 border-b border-white/5">
        <h1 className="text-[14px] tracking-widest font-semibold text-gray-500 uppercase mb-1">KBO 연봉계산기</h1>
        <div className="text-xl font-bold flex items-center gap-2">
          <span className="w-3 h-3 bg-gold rounded-full"></span>
          <span className="font-sans italic tracking-tight text-white">NOWIWON MANAGEMENT GROUP</span>
        </div>
      </div>
      
      <div className="flex flex-col flex-1 mt-4">
        <div className="px-6 py-2 text-[14px] uppercase tracking-widest text-gray-600 font-bold mb-2">메인 메뉴</div>
        {links.map((link) => {
          const Icon = link.icon;
          const isActive = location.pathname === link.path;
          return (
            <Link
              key={link.path}
              to={link.path}
              className={clsx(
                "flex items-center gap-3 px-6 py-3 text-sm transition-colors",
                isActive 
                  ? "bg-gold/10 text-white border-l-4 border-gold" 
                  : "text-gray-400 hover:text-white border-l-4 border-transparent"
              )}
            >
              <Icon className={clsx("w-4 h-4", isActive ? "text-gold" : "text-gray-500")} />
              {link.name}
            </Link>
          );
        })}
      </div>
      
      <div className="p-6 border-t border-white/5 mt-auto">
        <div className="text-[13px] text-gray-500 mb-2 uppercase tracking-tighter">계정: 수석 에이전트 한</div>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center text-xs font-bold text-gray-400">
            AG
          </div>
          <div className="text-[13px] font-bold text-gray-300">보안 등급 4</div>
        </div>
      </div>
    </div>
  );
}
