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
    const { playerData, targetStats } = req.body;
    const aiClient = getAI();
    
    const prompt = `다음 선수의 현재 데이터와 다음 시즌 목표 스탯을 바탕으로 예상 연봉 범위를 계산하고, 구단 프런트와 협상할 핵심 논리를 도출해 주세요. 현재 연봉이 과대/과소 평가되었는지도 분석해 주세요.\n\n현재 선수 데이터:\n${JSON.stringify(playerData, null, 2)}\n\n다음 시즌 목표 스탯:\n${JSON.stringify(targetStats, null, 2)}`;
    
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

app.post("/api/db/save-player", async (req, res) => {
  try {
    const payload = req.body;
    const GAS_DB_URL = "https://script.google.com/macros/s/AKfycbzuv-TBMbIKSM0gUPrb3d99kG82BWvKTXrrdOyQhlYvWf1QKOG5dsNNC5xFM74c/exec";
    
    // Attempt sending to Google Apps Script from backend (Node.js avoids browser CORS errors)
    let remoteSaved = false;
    let details: string | undefined;

    try {
      const response = await fetch(GAS_DB_URL, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8",
        },
        body: JSON.stringify(payload),
      });

      const text = await response.text();
      // Check if GAS returned an error page (e.g. doPost not found)
      if (text.includes("doPost") || text.includes("エラー") || text.includes("Error") || !response.ok) {
        details = "Google Apps Script does not have doPost implemented";
      } else {
        remoteSaved = true;
      }
    } catch (e: any) {
      details = e.message;
    }

    res.json({
      success: true,
      remoteSaved,
      details,
      payload
    });
  } catch (error: any) {
    console.error("Save Player API Error:", error);
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
