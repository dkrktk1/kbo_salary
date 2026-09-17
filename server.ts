import * as XLSX from "xlsx";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Initialize Gemini API (will throw if key missing when used)
let ai: GoogleGenAI | null = null;
function getAI() {
  if (!ai) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY is not set.");
    }
    ai = new GoogleGenAI({ apiKey: key });
  }
  return ai;
}

const SYSTEM_PROMPT = `당신은 KBO 리그 최고의 세이버메트릭스 데이터 분석가이자, 에이전트의 연봉 협상을 돕는 최고 전략 책임자입니다. 모든 분석은 철저히 데이터에 기반하여 냉철하게 작성하고, 에이전트가 구단 프런트를 설득할 '핵심 협상 논리'를 반드시 도출하십시오.`;

// Mock API for data
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/gemini/reality-check", async (req, res) => {
  try {
    const { playerData } = req.body;
    const aiClient = getAI();
    
    const prompt = `다음 선수의 데이터를 바탕으로 최근 3년간의 강점과 치명적 약점을 분석하고, 선수에게 동기를 부여할 수 있는 현실적인 면담용 피드백 멘트를 생성해 주세요.\n\n선수 데이터:\n${JSON.stringify(playerData, null, 2)}`;
    
    const response = await aiClient.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_PROMPT,
      }
    });

    res.json({ text: response.text });
  } catch (error: any) {
    console.error("Gemini Reality Check Error:", error);
    res.status(500).json({ error: error.message || "Failed to generate report" });
  }
});

app.post("/api/gemini/simulator", async (req, res) => {
  try {
    const { playerData, targetStats, practicalTargetRange, faMarketRange, isNonFA, serviceTimeInfo, algorithmDetails } = req.body;
    const aiClient = getAI();
    
    const prompt = `당신은 KBO 리그 최고 권위의 에이전트 협상 수석 전략가입니다.
선수의 데이터와 목표 성적을 바탕으로 구단과의 연봉 협상 테이블에서 사용할 '핵심 협상 논리 브리핑'을 3~4개의 명확한 불릿 포인트로 작성해 주세요.

[핵심 협상 투트랙(Two-Track) 전략 원칙]
1. 등록일수 기반 FA / 비FA 지위 및 앵커링(Anchoring) 논리:
   ${isNonFA 
     ? `- "해당 선수의 데이터 기반 실제 시장 가치는 ${faMarketRange?.max || "고액"} 수준이나, 현재 1군 등록일수(${serviceTimeInfo?.display || "요건 미달"})가 KBO 규약상 FA 자격 취득 요건(정규 7~8시즌)에 미달하는 점과 구단 고과 산정 시스템을 존중하여, 전략적으로 ${practicalTargetRange?.min || ""} ~ ${practicalTargetRange?.max || ""}을 현실적 협상 목표액으로 제시한다"는 식의 앵커링 논리를 반드시 포함할 것.`
     : `- "해당 선수는 1군 등록일수 기준 FA 자격을 이미 충족하였으므로, 데이터 기반 시장 가치 ${faMarketRange?.min || ""} ~ ${faMarketRange?.max || ""}을 직접적인 협상 타겟으로 삼아 합당한 대우를 요구한다."`}
2. 구단 프런트 설득 논리:
   - 순수 세이버메트릭스 시장 가치 대비 대폭 할인된 합리적 금액임을 강조하여 구단의 심리적 저항을 낮추고, 목표 성적 달성 시 인상의 당위성을 완벽히 입증할 것.
3. 포지션 프리미엄 및 특화 지표(포수 수비·블로킹, 투수 이닝·ERA·WHIP, 타자 wRC+·RF9 등)를 직접 인용할 것.
4. 적용된 핵심 고과/시장가치 알고리즘 반영:
   - 에이징 커브가 적용된 경우: "30대 중반의 에이징 커브 리스크를 선반영하여 구단 친화적으로 가치를 조정했습니다."와 같은 멘트 포함.
   - 저연봉자 폭발 로직이 적용된 경우: "1억 이하 저연봉 구간 선수로, 올 시즌 보여준 폭발적인 기여도(WAR)를 감안해 인상률 캡을 해제한 S급 고과 기준(WAR 1.0당 4,000만원 다이렉트 인상)을 적용했습니다."와 같은 멘트 포함.
   - 볼륨 가중치가 적용된 경우: "출장 타석(이닝) 표본에 따른 신뢰도 가중치를 적용하여 거품을 뺀 합리적인 지표입니다."와 같은 멘트 포함.
   - 불펜 투수 가중치가 적용된 경우: "불펜/마무리 투수 전용 기준(ERA 3.50, WHIP 1.20) 및 1.5배 보너스와 이닝 패널티 면제를 반영했습니다."와 같은 멘트 포함.

[중요 금액 표기 지침]
- 금액을 명시할 때는 반드시 '5억', '5억 5,000만원', '2억 3,000만원', '6,000만원'과 같이 억 단위와 콤마가 포함된 만원 단위 한글 형식으로 일관되게 표기해 주세요.
${practicalTargetRange ? `- [현실적 협상 목표액(비FA 구단 고과 타겟)]: ${practicalTargetRange.min} ~ ${practicalTargetRange.max}` : ""}
${faMarketRange ? `- [데이터 기반 FA 환산 가치]: ${faMarketRange.min} ~ ${faMarketRange.max}` : ""}
${serviceTimeInfo ? `- [1군 등록일수 현황]: ${serviceTimeInfo.display} (${serviceTimeInfo.statusLabel || (isNonFA ? "비FA 선수" : "FA 자격 충족")})` : ""}
${algorithmDetails ? `- [계산 알고리즘 적용 현황]: ${JSON.stringify(algorithmDetails)}` : ""}

현재 선수 데이터:
${JSON.stringify(playerData, null, 2)}

다음 시즌 목표 스탯:
${JSON.stringify(targetStats, null, 2)}`;
    
    const response = await aiClient.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_PROMPT,
      }
    });

    res.json({ text: response.text });
  } catch (error: any) {
    console.error("Gemini Simulator Error:", error);
    res.status(500).json({ error: error.message || "Failed to run simulator" });
  }
});

app.post("/api/gemini/reverse-engineer", async (req, res) => {
  try {
    const { teamName, batterData, pitcherData } = req.body;
    const aiClient = getAI();
    
    const prompt = `대상 구단: ${teamName}
타자 표본: ${JSON.stringify(batterData)}
투수 표본: ${JSON.stringify(pitcherData)}
요구사항:
1. stat_weights: 타자/투수 연봉 책정 시 가장 높은 상관관계를 보인 스탯 3가지와 가중치 추정(%)
2. overvalued_stat: 타 구단 대비 유독 오버페이하는 스탯과 그 추론 이유
3. outliers: 스탯 대비 연봉을 비정상적으로 많이/적게 받은 선수 2명과 그 정성적 이유 추론
4. player_evaluations: 입력된 모든 선수의 데이터를 바탕으로 [{player_name, calculated_salary, status}] 형태의 배열(Array)을 반환할 것.`;

    const systemInstruction = "당신은 KBO 리그의 연봉 중재(Arbitration) 전문가이자 데이터 사이언티스트입니다. 제공된 구단의 소속 선수 데이터(성적 및 연봉)를 분석하여, 해당 구단이 연봉 산정 시 어떤 스탯에 가장 큰 프리미엄을 주는지 역산(Reverse-Engineering)하고 JSON으로 출력하십시오.";
    
    const response = await aiClient.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            stat_weights: {
              type: "object",
              properties: {
                batter: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      stat: { type: "string" },
                      weight: { type: "number" }
                    },
                    required: ["stat", "weight"]
                  }
                },
                pitcher: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      stat: { type: "string" },
                      weight: { type: "number" }
                    },
                    required: ["stat", "weight"]
                  }
                }
              },
              required: ["batter", "pitcher"]
            },
            overvalued_stat: {
              type: "object",
              properties: {
                stat: { type: "string" },
                reason: { type: "string" }
              },
              required: ["stat", "reason"]
            },
            outliers: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  isOverpaid: { type: "boolean" },
                  reason: { type: "string" }
                },
                required: ["name", "isOverpaid", "reason"]
              }
            },
            player_evaluations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  player_name: { type: "string" },
                  calculated_salary: { type: "number" },
                  status: { type: "string" }
                },
                required: ["player_name", "calculated_salary", "status"]
              }
            }
          },
          required: ["stat_weights", "overvalued_stat", "outliers", "player_evaluations"]
        }
      }
    });

    let result;
    try {
      result = JSON.parse(response.text || "{}");
    } catch (e) {
      result = response.text;
    }
    res.json({ result });
  } catch (error: any) {
    console.error("Gemini Reverse Engineer Error:", error);
    res.status(500).json({ error: error.message || "Failed to reverse engineer team logic" });
  }
});



app.post("/api/gemini/parse-roster", async (req, res) => {
  try {
    const { fileData, mimeType, fileName, teamName } = req.body;
    const aiClient = getAI();
    
    let parts: any[] = [
      `이 데이터(또는 이미지)에서 선수들의 이름, 만 나이, 포지션, 2026 연봉(숫자형태로 변환), 프로 입단(입단 연도), 등록일수(있는 그대로의 문자열, 예: '10년 10일', '1년 0일' 등) 데이터를 추출해서 JSON 배열로 반환해줘. 주의: 데이터가 없는 항목(예: WAR 스탯 등)은 절대로 가상으로 만들어내지 말고 null이나 빈 문자열 등 빈 값으로 처리해줘. 자료의 내용은 제공된 데이터가 기준이 되어야 해. team 필드는 "${teamName}"으로 고정해줘.`
    ];

    if (fileData) {
      if ((mimeType && (mimeType.includes('excel') || mimeType.includes('spreadsheet') || mimeType.includes('csv'))) || (fileName && (fileName.endsWith('.xlsx') || fileName.endsWith('.csv')))) {
        // Parse excel/csv on server to text
        const buffer = Buffer.from(fileData, 'base64');
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const csvData = XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
        parts.push(`

데이터표:
${csvData}`);
      } else {
        parts.push({
          inlineData: {
            data: fileData,
            mimeType: mimeType
          }
        });
      }
    }

    const response = await aiClient.models.generateContent({
      model: "gemini-3.5-flash",
      contents: parts,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              team: { type: "string" },
              position: { type: "string" },
              age: { type: "number" },
              salaryCurrent: { type: "number" },
              draftYear: { type: "number" },
              serviceTime: { type: "string" },
              stats: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    year: { type: "number" },
                    avg: { type: "number" },
                    ops: { type: "number" },
                    war: { type: "number" },
                    hr: { type: "number" },
                    salary: { type: "number" }
                  }
                }
              }
            },
            required: ["name", "team", "position", "age", "salaryCurrent", "draftYear", "serviceTime", "stats"]
          }
        }
      }
    });

    let players: any[] = [];
    try {
      players = JSON.parse(response.text || "[]");
      players.forEach((p, i) => {
        if (!p.id) p.id = `parsed_p_${Date.now()}_${i}`;
      });
    } catch (e) {
      console.error(e);
    }
    res.json({ players });
  } catch (error: any) {
    console.error("Parse Roster Error:", error);
    res.status(500).json({ error: error.message || "Failed to parse roster" });
  }
});

const recentSaveRequests = new Map<string, number>();

app.get("/api/db/proxy-gas", async (req, res) => {
  try {
    const GAS_DB_URL = "https://script.google.com/macros/s/AKfycbzuv-TBMbIKSM0gUPrb3d99kG82BWvKTXrrdOyQhlYvWf1QKOG5dsNNC5xFM74c/exec";
    const queryString = new URLSearchParams(req.query as Record<string, string>).toString();
    const targetUrl = `${GAS_DB_URL}?${queryString}`;
    
    const response = await fetch(targetUrl, {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `GAS responded with status ${response.status}` });
    }

    const data = await response.json();
    res.json(data);
  } catch (error: any) {
    console.error("Proxy GAS GET Error:", error);
    res.status(500).json({ error: error.message || "Failed to proxy GAS request" });
  }
});

app.post("/api/db/save-player", async (req, res) => {
  try {
    const payload = req.body;
    const GAS_DB_URL = "https://script.google.com/macros/s/AKfycbzuv-TBMbIKSM0gUPrb3d99kG82BWvKTXrrdOyQhlYvWf1QKOG5dsNNC5xFM74c/exec";
    
    const playerId = payload.id || payload.ID || payload.name || payload["선수명"];
    const now = Date.now();
    const isForce = payload.force === true;
    
    // 동일 선수에 대해 1.5초 내 연속 저장 요청이 들어올 경우 GAS에 2중 기록되지 않도록 차단 (force 플래그 시 무조건 허용)
    if (!isForce && playerId && recentSaveRequests.has(playerId)) {
      const prevTime = recentSaveRequests.get(playerId)!;
      if (now - prevTime < 1500) {
        console.log(`[서버 중복 방지] 선수(${playerId}) 1.5초 내 중복 저장 요청 감지 -> 기존 저장 유지`);
        return res.json({ success: true, remoteSaved: true, deduplicated: true });
      }
    }
    if (playerId) {
      recentSaveRequests.set(playerId, now);
      if (recentSaveRequests.size > 100) {
        for (const [key, timestamp] of recentSaveRequests.entries()) {
          if (now - timestamp > 60000) recentSaveRequests.delete(key);
        }
      }
    }

    const isSample = payload.isSample === true || payload.type === "sample_player" || payload.sheetName === "Sample_Player_DB";
    const targetSheet = isSample ? "Sample_Player_DB" : (payload.sheetName || payload.targetSheet || "App_data_DB");
    const targetType = isSample ? "sample_player" : (payload.type || "agency");
    const targetAction = payload.action || (isSample ? "save_sample" : "update");
    const playerName = (payload["선수명"] || payload.name || "").trim();

    let remoteSaved = false;
    let details: string | undefined;

    // Google Apps Script 전송 헬퍼 함수
    const sendToGas = async (actionToUse: string) => {
      const requestUrl = `${GAS_DB_URL}?sheetName=${encodeURIComponent(targetSheet)}&targetSheet=${encodeURIComponent(targetSheet)}&type=${encodeURIComponent(targetType)}&action=${encodeURIComponent(actionToUse)}&name=${encodeURIComponent(playerName)}&선수명=${encodeURIComponent(playerName)}&t=${Date.now()}`;
      const payloadToSend = {
        ...payload,
        action: actionToUse,
        sheetName: targetSheet,
        targetSheet,
        type: targetType,
        "선수명": playerName,
        name: playerName,
      };

      const response = await fetch(requestUrl, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8",
        },
        body: JSON.stringify(payloadToSend),
        redirect: "follow",
      });

      let jsonRes: any = null;
      let textRes = "";
      try {
        textRes = await response.text();
        jsonRes = JSON.parse(textRes);
      } catch {
        jsonRes = null;
      }

      return { response, jsonRes, textRes };
    };

    try {
      if (isSample) {
        // 샘플 선수는 항상 save_sample
        const res = await sendToGas("save_sample");
        if (res.jsonRes?.status === "success" || res.response.ok) {
          remoteSaved = true;
          details = res.jsonRes?.message || "샘플 선수 저장 완료";
        } else {
          details = res.jsonRes?.error || res.textRes;
        }
      } else {
        // App_data_DB (소속 선수)의 경우:
        // 1순위: 기존 시트에 선수가 등록되어 있는지 update로 덮어쓰기 시도
        console.log(`[save-player] 선수(${playerName}) update 덮어쓰기 전송 시도...`);
        let res = await sendToGas("update");

        // 만약 update 결과 선수를 찾을 수 없거나 실패한 경우, 자동으로 'save'로 전환하여 신규 행으로 안전하게 추가
        if (res.jsonRes?.status === "fail" && (res.jsonRes?.error?.includes("찾을 수 없습니다") || res.jsonRes?.error?.includes("시트"))) {
          console.log(`[save-player] 선수(${playerName}) 기존 행 없음 -> 'save' 신규 등록으로 자동 전환 전송`);
          res = await sendToGas("save");
        }

        if (res.jsonRes?.status === "success") {
          remoteSaved = true;
          details = res.jsonRes?.message || "선수 정보 저장 완료";
        } else if (res.response.ok && !res.jsonRes?.error) {
          remoteSaved = true;
          details = "Saved successfully";
        } else {
          remoteSaved = false;
          details = res.jsonRes?.error || "GAS 처리 오류";
          console.warn(`[save-player] 선수(${playerName}) 최종 저장 실패:`, details);
        }
      }
    } catch (e: any) {
      console.warn("GAS save POST warning:", e);
      details = e.message;
    }

    res.json({
      success: remoteSaved,
      remoteSaved,
      details,
      payload
    });
  } catch (error: any) {
    console.error("Save Player API Error:", error);
    res.status(500).json({ success: false, error: error.message || "Internal server error" });
  }
});

app.post("/api/db/delete-player", async (req, res) => {
  try {
    const payload = req.body;
    const GAS_DB_URL = "https://script.google.com/macros/s/AKfycbzuv-TBMbIKSM0gUPrb3d99kG82BWvKTXrrdOyQhlYvWf1QKOG5dsNNC5xFM74c/exec";
    
    const playerName = (payload["선수명"] || payload.name || "").trim();
    const targetSheet = payload.sheetName || payload.targetSheet || "App_data_DB";
    const targetType = payload.type || "agency";
    // Google Apps Script doPost only executes sheet.deleteRow() when action === "delete_sample".
    // Any other action falls through to appendRow(), which creates empty rows.
    const targetAction = "delete_sample";

    let remoteDeleted = false;
    let totalDeleted = 0;
    let details: string | undefined;

    if (playerName) {
      // Delete all matching rows for this player (handles any duplicates as well)
      const maxAttempts = 10;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const requestUrl = `${GAS_DB_URL}?sheetName=${encodeURIComponent(targetSheet)}&targetSheet=${encodeURIComponent(targetSheet)}&type=${encodeURIComponent(targetType)}&action=${encodeURIComponent(targetAction)}&name=${encodeURIComponent(playerName)}&선수명=${encodeURIComponent(playerName)}&id=${encodeURIComponent(payload.id || "")}&t=${Date.now()}`;
        
        const deleteBody = {
          ...payload,
          action: targetAction,
          sheetName: targetSheet,
          targetSheet: targetSheet,
          sheet: targetSheet,
          type: targetType,
          name: playerName,
          "선수명": playerName,
          id: payload.id || "",
          ID: payload.id || "",
        };

        try {
          const response = await fetch(requestUrl, {
            method: "POST",
            headers: {
              "Content-Type": "text/plain;charset=utf-8",
            },
            body: JSON.stringify(deleteBody),
            redirect: "follow",
          });

          let json: any = null;
          try {
            json = await response.json();
          } catch {
            // Non-JSON response
          }

          if (json && json.status === "success") {
            totalDeleted++;
            remoteDeleted = true;
          } else {
            // Player row no longer found on sheet
            break;
          }
        } catch (e: any) {
          details = e.message;
          break;
        }
      }
    }

    res.json({
      success: true,
      remoteDeleted,
      totalDeleted,
      details,
      playerName
    });
  } catch (error: any) {
    console.error("Delete Player API Error:", error);
    res.status(500).json({ success: false, error: error.message || "Internal server error" });
  }
});

// In-memory cache for team rosters to prevent excessive concurrent hits to Google Apps Script
const teamRosterCache = new Map<string, { data: any[]; timestamp: number }>();
const ROSTER_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

const KBO_SHORT_TEAMS: Record<string, string> = {
  "LG 트윈스": "LG",
  "KT 위즈": "KT",
  "SSG 랜더스": "SSG",
  "NC 다이노스": "NC",
  "두산 베어스": "두산",
  "KIA 타이거즈": "KIA",
  "삼성 라이온즈": "삼성",
  "키움 히어로즈": "키움",
  "한화 이글스": "한화",
  "롯데 자이언츠": "롯데",
};

app.get("/api/db/team-roster", async (req, res) => {
  const team = String(req.query.team || "").trim();
  if (!team) {
    return res.status(400).json({ success: false, error: "구단명이 필요합니다." });
  }

  const cached = teamRosterCache.get(team);
  if (cached && Date.now() - cached.timestamp < ROSTER_CACHE_TTL) {
    return res.json({ success: true, fromCache: true, data: cached.data });
  }

  const GAS_DB_URL = "https://script.google.com/macros/s/AKfycbzuv-TBMbIKSM0gUPrb3d99kG82BWvKTXrrdOyQhlYvWf1QKOG5dsNNC5xFM74c/exec";
  const shortName = KBO_SHORT_TEAMS[team] || team.replace(/(트윈스|위즈|랜더스|다이노스|베어스|타이거즈|라이온즈|히어로즈|이글스|자이언츠)/g, "").trim();
  
  // 구글 Apps Script DB는 축약 구단명(LG, KIA, 롯데 등)으로 정확하게 매칭되므로 shortName을 최우선 조회
  const candidateNames = Array.from(new Set([shortName, team])).filter(Boolean);

  for (const name of candidateNames) {
    try {
      const url = `${GAS_DB_URL}?team=${encodeURIComponent(name)}&t=${Date.now()}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
      if (response.ok) {
        const json: any = await response.json();
        const rawList = Array.isArray(json?.data) ? json.data : (Array.isArray(json) ? json : []);
        if (rawList.length > 0) {
          teamRosterCache.set(team, { data: rawList, timestamp: Date.now() });
          return res.json({ success: true, data: rawList });
        }
      }
    } catch (e: any) {
      console.log(`[Proxy] GAS fetch notice for team '${name}':`, e?.message);
    }
  }

  // Cache empty result for 1 minute to prevent thundering herd
  teamRosterCache.set(team, { data: [], timestamp: Date.now() - ROSTER_CACHE_TTL + 60000 });
  return res.json({ success: true, data: [] });
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
