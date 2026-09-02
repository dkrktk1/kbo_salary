import React, { useState, useRef, useEffect, useMemo } from "react";
import { Search, ChevronDown, Check, X, User } from "lucide-react";
import { CompPlayerDef, PositionGroup, ALL_COMP_PLAYERS, POSITION_COMP_PLAYERS, getPositionGroupLabel } from "../types";

export interface SearchableCompSelectProps {
  selectedCompId: string;
  onSelectCompPlayer: (player: CompPlayerDef) => void;
  currentMainPlayerName: string;
  positionGroup: PositionGroup;
  currentSearchedTeam?: string;
}

export function SearchableCompSelect({
  selectedCompId,
  onSelectCompPlayer,
  currentMainPlayerName,
  positionGroup,
}: SearchableCompSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilterTab, setSelectedFilterTab] = useState<"recommended" | "all" | PositionGroup>("recommended");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 현재 선택된 선수 객체 찾기
  const selectedPlayer = useMemo(() => {
    return ALL_COMP_PLAYERS.find(p => p.id === selectedCompId) || 
      POSITION_COMP_PLAYERS[positionGroup]?.[0] || 
      ALL_COMP_PLAYERS[0];
  }, [selectedCompId, positionGroup]);

  // 바깥 클릭 시 드롭다운 닫기
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // 드롭다운 열릴 때 input 자동 포커스
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    } else {
      setSearchQuery("");
    }
  }, [isOpen]);

  // 후보 선수 풀 필터링 (메인 선수 제외 + 포지션/검색어 필터)
  const filteredPlayers = useMemo(() => {
    const trimmedMain = (currentMainPlayerName || "").trim().toLowerCase();
    const query = searchQuery.trim().toLowerCase();

    return ALL_COMP_PLAYERS.filter(player => {
      // 1. 메인 선수 제외 (이름 일치 시 제외)
      if (trimmedMain && player.name.trim().toLowerCase() === trimmedMain) {
        return false;
      }

      // 2. 탭 필터 (추천일 때는 현재 positionGroup 매칭)
      if (selectedFilterTab === "recommended") {
        if (player.positionGroup !== positionGroup) return false;
      } else if (selectedFilterTab !== "all") {
        if (player.positionGroup !== selectedFilterTab) return false;
      }

      // 3. 검색어 필터 (선수명 또는 구단명)
      if (query) {
        const matchName = player.name.toLowerCase().includes(query);
        const matchTeam = player.team.toLowerCase().includes(query);
        const matchPos = getPositionGroupLabel(player.positionGroup).toLowerCase().includes(query);
        return matchName || matchTeam || matchPos;
      }

      return true;
    });
  }, [currentMainPlayerName, selectedFilterTab, positionGroup, searchQuery]);

  const handleSelect = (player: CompPlayerDef) => {
    onSelectCompPlayer(player);
    setIsOpen(false);
  };

  const getPositionBadge = (pos: PositionGroup) => {
    switch (pos) {
      case "pitcher":
        return { text: "투수", color: "bg-blue-500/20 text-blue-300 border-blue-500/30" };
      case "catcher":
        return { text: "포수", color: "bg-amber-500/20 text-amber-300 border-amber-500/30" };
      case "infield":
        return { text: "내야수", color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" };
      case "outfield":
        return { text: "외야수", color: "bg-purple-500/20 text-purple-300 border-purple-500/30" };
      default:
        return { text: "야수", color: "bg-gray-500/20 text-gray-300 border-gray-500/30" };
    }
  };

  return (
    <div className="relative inline-block text-left" ref={containerRef}>
      {/* 트리거 버튼 */}
      <button
        type="button"
        id="btn-open-comp-select"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between gap-2.5 bg-black/60 hover:bg-black/80 border border-blue-500/40 hover:border-blue-400 text-white rounded-xl px-3 py-1.5 transition-all shadow-sm group min-w-[190px]"
      >
        <div className="flex items-center gap-2 truncate">
          <div className="w-5 h-5 rounded-full bg-blue-500/20 border border-blue-400/40 flex items-center justify-center text-blue-400 flex-shrink-0">
            <User className="w-3 h-3" />
          </div>
          <div className="text-left truncate">
            <span className="text-xs font-bold text-blue-400 group-hover:text-blue-300 truncate block">
              {selectedPlayer?.name || "비교 선수 선택"}
            </span>
            <span className="text-[10px] text-gray-400 block -mt-0.5 truncate">
              {selectedPlayer?.team || "KBO"}
            </span>
          </div>
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-blue-400/80 transition-transform duration-200 flex-shrink-0 ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {/* 검색 & 선택 팝오버 드롭다운 */}
      {isOpen && (
        <div className="absolute right-0 mt-1.5 w-[280px] sm:w-[320px] bg-[#141721] border border-white/15 rounded-2xl shadow-2xl z-50 backdrop-blur-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          
          {/* 1. 검색 입력 영역 */}
          <div className="p-2.5 border-b border-white/10 bg-white/[0.02]">
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 pointer-events-none" />
              <input
                ref={inputRef}
                type="text"
                id="input-search-comp-player"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="비교 선수명 또는 팀명 검색..."
                className="w-full bg-black/50 border border-white/15 rounded-xl pl-8 pr-7 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-400/80 transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 p-0.5 text-gray-400 hover:text-white rounded-full hover:bg-white/10"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* 2. 포지션 필터 탭 */}
            <div className="flex items-center gap-1 mt-2 overflow-x-auto pb-0.5 custom-scrollbar">
              <button
                type="button"
                onClick={() => setSelectedFilterTab("recommended")}
                className={`px-2 py-0.5 text-[10px] font-semibold rounded-lg whitespace-nowrap transition-all ${
                  selectedFilterTab === "recommended"
                    ? "bg-blue-600 text-white shadow-sm"
                    : "bg-white/5 text-gray-400 hover:text-white hover:bg-white/10"
                }`}
              >
                동일 포지션 ({getPositionGroupLabel(positionGroup)})
              </button>
              <button
                type="button"
                onClick={() => setSelectedFilterTab("all")}
                className={`px-2 py-0.5 text-[10px] font-semibold rounded-lg whitespace-nowrap transition-all ${
                  selectedFilterTab === "all"
                    ? "bg-blue-600 text-white shadow-sm"
                    : "bg-white/5 text-gray-400 hover:text-white hover:bg-white/10"
                }`}
              >
                전체
              </button>
            </div>
          </div>

          {/* 3. 선수 리스트 */}
          <div className="max-h-[240px] overflow-y-auto p-1.5 space-y-0.5 custom-scrollbar">
            {filteredPlayers.length > 0 ? (
              filteredPlayers.map((player) => {
                const isSelected = player.id === selectedCompId;
                const posBadge = getPositionBadge(player.positionGroup);

                return (
                  <button
                    key={player.id}
                    type="button"
                    onClick={() => handleSelect(player)}
                    className={`w-full flex items-center justify-between p-2 rounded-xl text-left transition-all ${
                      isSelected
                        ? "bg-blue-600/20 border border-blue-500/40 text-white"
                        : "hover:bg-white/[0.06] text-gray-300 border border-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <div className="w-6 h-6 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[10px] font-bold text-gray-300 flex-shrink-0">
                        {player.name.slice(0, 1)}
                      </div>
                      <div className="truncate">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-xs font-bold ${isSelected ? "text-blue-400" : "text-white"}`}>
                            {player.name}
                          </span>
                          <span className={`text-[9.5px] px-1.5 py-0.2 rounded border ${posBadge.color}`}>
                            {posBadge.text}
                          </span>
                        </div>
                        <span className="text-[10px] text-gray-400 block truncate">
                          {player.team}
                        </span>
                      </div>
                    </div>

                    {isSelected && (
                      <Check className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                    )}
                  </button>
                );
              })
            ) : (
              <div className="py-6 text-center text-xs text-gray-400">
                <p>일치하는 비교 선수가 없습니다.</p>
                {currentMainPlayerName && (
                  <p className="text-[10px] text-gray-500 mt-1">
                    (메인 선수 '{currentMainPlayerName}'는 목록에서 자동 제외됩니다)
                  </p>
                )}
              </div>
            )}
          </div>

          {/* 4. 하단 안내 */}
          <div className="p-2 border-t border-white/5 bg-black/40 text-[10px] text-gray-400 flex items-center justify-between">
            <span>총 {filteredPlayers.length}명 비교 가능</span>
            <span className="text-blue-400/90 font-mono">* 즉시 오버랩 반영</span>
          </div>

        </div>
      )}
    </div>
  );
}

export default SearchableCompSelect;
