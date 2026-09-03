/**
 * Gemini API 연동 서비스
 * Google Generative Language REST API (gemini-3.5-flash)
 */

export const GEMINI_API_KEY_STORAGE_KEY = "kbo_gemini_api_key";

/**
 * 로컬스토리지 또는 환경 변수에서 저장된 API Key를 가져옵니다.
 */
export function getStoredApiKey(): string {
  try {
    const saved = localStorage.getItem(GEMINI_API_KEY_STORAGE_KEY);
    if (saved && saved.trim()) {
      return saved.trim();
    }
  } catch (e) {
    console.error("Failed to read API key from localStorage", e);
  }
  // Vite 환경변수 fallback (있는 경우)
  const envKey = (import.meta as any).env?.VITE_GEMINI_API_KEY;
  if (typeof envKey === "string" && envKey.trim()) {
    return envKey.trim();
  }
  return "";
}

/**
 * API Key를 로컬스토리지에 저장합니다.
 */
export function setStoredApiKey(key: string): void {
  try {
    if (!key || !key.trim()) {
      localStorage.removeItem(GEMINI_API_KEY_STORAGE_KEY);
    } else {
      localStorage.setItem(GEMINI_API_KEY_STORAGE_KEY, key.trim());
    }
  } catch (e) {
    console.error("Failed to save API key to localStorage", e);
  }
}

/**
 * API Key가 설정되어 있는지 확인합니다.
 */
export function hasApiKey(): boolean {
  return getStoredApiKey().length > 0;
}

export interface GenerateReportParams {
  apiKey?: string;
  name: string;
  position: string;
  team?: string;
  history: Record<string, any>;
  latestStat?: Record<string, any> | null;
}

/**
 * Google Gemini 3.5 Flash REST API를 호출하여 연봉 협상 브리핑 리포트를 생성합니다.
 */
export async function generateAIReport(params: GenerateReportParams): Promise<string> {
  const activeKey = params.apiKey?.trim() || getStoredApiKey();

  if (!activeKey) {
    throw new Error("Gemini API Key를 먼저 설정해주세요.");
  }

  const systemInstructionText = `당신은 KBO 리그 최고의 데이터 기반 야구 에이전트(Agent)입니다.
제공된 선수의 포지션, 3개년 스탯, 그리고 세이버매트릭스 지표를 분석하여, 구단과의 연봉 협상 테이블에서 즉시 사용할 수 있는 '강력하고 설득력 있는 심층 브리핑 리포트'를 작성하십시오.
1. 도입부: 선수의 포지션 희소성과 팀 내 핵심 기여도 및 위상 요약.
2. 강점 부각: 우수한 세이버 지표(wRC+, WAR, CS% 등)를 구체적인 수치 및 리그 내 지표와 함께 설득력 있게 어필.
3. 약점 방어: 클래식 스탯이 낮더라도, 출루율이나 수비 기여도, 숨은 가치를 내세워 논리적으로 방어.
4. 결론: 해당 선수가 필수 불가결한 코어 자원임을 강조하며 합리적인 연봉 인상의 타당성을 명확히 제시. (데이터 허위 사실 작성 금지, 글이 중간에 끊기지 않도록 문장을 끝까지 완결할 것)`;

  const userPrompt = `이름: ${params.name}, 포지션: ${params.position}, 최근 3년 핵심 스탯 요약: ${JSON.stringify(params.history)}. 위 데이터를 바탕으로 구단 설득용 심층 브리핑을 완결성 있게 작성해 주세요.`;

  const requestBody = {
    systemInstruction: {
      parts: [
        {
          text: systemInstructionText,
        },
      ],
    },
    contents: [
      {
        role: "user",
        parts: [
          {
            text: userPrompt,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.7,
      topP: 0.95,
      maxOutputTokens: 4096,
    },
  };

  const primaryModel = "gemini-3.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${primaryModel}:generateContent?key=${encodeURIComponent(activeKey)}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      let errorMessage = `API 요청 실패 (${res.status} ${res.statusText})`;
      try {
        const errorJson = await res.json();
        if (errorJson.error?.message) {
          errorMessage = errorJson.error.message;
        }
      } catch {
        // ignore json parse error
      }
      
      // 만약 404 Not Found (모델명 미지원 등)인 경우 하위 호환 대체 모델 시도
      if (res.status === 404 || errorMessage.includes("not found") || errorMessage.includes("models/")) {
        return await tryFallbackModel(activeKey, requestBody);
      }

      throw new Error(errorMessage);
    }

    const data = await res.json();
    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!generatedText) {
      if (data.candidates?.[0]?.finishReason) {
        throw new Error(`응답 생성 중단 (사유: ${data.candidates[0].finishReason})`);
      }
      throw new Error("Gemini 모델로부터 유효한 텍스트 응답을 받지 못했습니다.");
    }

    return generatedText.trim();
  } catch (err: any) {
    console.error("Gemini API Error:", err);
    throw err;
  }
}

/**
 * 엔드포인트 변경 대비 폴백 함수
 */
async function tryFallbackModel(apiKey: string, requestBody: any): Promise<string> {
  const fallbackUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(fallbackUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Fallback API 요청 실패 (${res.status})`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("유효한 텍스트 응답이 없습니다.");
  return text.trim();
}
