import React, { useState, useEffect } from "react";
import { Key, Eye, EyeOff, Check, X, ShieldAlert, Sparkles, ExternalLink, Trash2 } from "lucide-react";
import { getStoredApiKey, setStoredApiKey } from "../services/geminiService";

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onKeySaved?: (key: string) => void;
  warningMessage?: string | null;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({
  isOpen,
  onClose,
  onKeySaved,
  warningMessage,
}) => {
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const current = getStoredApiKey();
      setApiKeyInput(current);
      setSavedSuccess(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = apiKeyInput.trim();
    setStoredApiKey(trimmed);
    setSavedSuccess(true);
    if (onKeySaved) {
      onKeySaved(trimmed);
    }
    setTimeout(() => {
      onClose();
    }, 600);
  };

  const handleClear = () => {
    setStoredApiKey("");
    setApiKeyInput("");
    if (onKeySaved) {
      onKeySaved("");
    }
  };

  const hasCurrentKey = apiKeyInput.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div 
        className="bg-[#14171f] border border-white/15 rounded-2xl w-full max-w-md p-6 shadow-2xl relative text-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gold/15 border border-gold/30 flex items-center justify-center text-gold shadow-md shadow-gold/10">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                Gemini API Key 설정
              </h3>
              <p className="text-xs text-gray-400">Google Generative AI 연동</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 경고 메시지 (API Key 없이 생성 시도했을 때) */}
        {warningMessage && (
          <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5 text-xs text-amber-200">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>{warningMessage}</span>
          </div>
        )}

        {/* 폼 */}
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1.5 flex items-center justify-between">
              <span>Google Gemini API Key</span>
              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${hasCurrentKey ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30" : "bg-gray-800 text-gray-400"}`}>
                {hasCurrentKey ? "키 등록됨" : "미등록"}
              </span>
            </label>
            <div className="relative">
              <input
                id="input-gemini-api-key"
                type={showKey ? "text" : "password"}
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full h-11 bg-black/50 border border-white/15 focus:border-gold focus:ring-1 focus:ring-gold rounded-xl px-3.5 pr-20 text-xs font-mono text-white placeholder-gray-600 outline-none transition-all"
                autoFocus
              />
              <div className="absolute right-2 top-2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
                  title={showKey ? "가리기" : "보기"}
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                {hasCurrentKey && (
                  <button
                    type="button"
                    onClick={handleClear}
                    className="p-1.5 text-gray-400 hover:text-red-400 rounded-lg hover:bg-white/10 transition-colors"
                    title="키 삭제"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
            <p className="text-[11px] text-gray-500 mt-1.5 leading-normal">
              * 입력하신 API Key는 브라우저 로컬 저장소(localStorage)에만 안전하게 보관되며 외부로 유출되지 않습니다.
            </p>
          </div>

          {/* 안내 배너 */}
          <div className="p-3 bg-white/5 rounded-xl border border-white/10 text-xs text-gray-300 space-y-2">
            <div className="flex items-center gap-1.5 text-gold font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Gemini 3.5 Flash 모델 활용</span>
            </div>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              API Key가 없으시다면 Google AI Studio에서 무료로 발급받으실 수 있습니다.
            </p>
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 underline font-medium"
            >
              Google AI Studio에서 무료 API Key 발급받기
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {/* 버튼 영역 */}
          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-semibold transition-colors"
            >
              닫기
            </button>
            <button
              id="btn-save-api-key"
              type="submit"
              disabled={savedSuccess}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-gradient-to-r from-gold to-amber-500 hover:from-amber-400 hover:to-gold text-black text-xs font-bold shadow-lg shadow-gold/20 transition-all disabled:opacity-50"
            >
              {savedSuccess ? (
                <>
                  <Check className="w-4 h-4 text-black stroke-[3]" />
                  <span>저장 완료</span>
                </>
              ) : (
                <>
                  <Key className="w-4 h-4 text-black" />
                  <span>API Key 저장</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
