import React from "react";
import { Player } from "../data";
import { AlertTriangle } from "lucide-react";

interface DeletePlayerModalProps {
  player: Player | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeletePlayerModal({
  player,
  isOpen,
  onClose,
  onConfirm
}: DeletePlayerModalProps) {
  if (!isOpen || !player) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div className="glass-card bg-[#15181e] border border-red-500/30 rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-start gap-4 mb-4">
          <div className="p-3 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 flex-shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white mb-1 whitespace-nowrap">선수 삭제 확인</h3>
            <p className="text-sm text-gray-300 break-keep-all leading-relaxed">
              <span className="font-bold text-white">{player.name}</span> ({player.team}) 선수를 소속 명단에서 삭제하시겠습니까?
            </p>
            <p className="text-xs text-gray-500 mt-2 break-keep-all leading-relaxed">
              이 작업은 대시보드 및 연봉 분석 목록에서 해당 선수를 제거합니다.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
          <button
            onClick={onClose}
            className="h-10 px-5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 text-sm font-semibold transition-all cursor-pointer whitespace-nowrap flex items-center justify-center"
          >
            취소
          </button>
          <button
            onClick={onConfirm}
            className="h-10 px-5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-bold shadow-lg shadow-red-900/40 transition-all cursor-pointer whitespace-nowrap flex items-center justify-center"
          >
            삭제하기
          </button>
        </div>
      </div>
    </div>
  );
}
