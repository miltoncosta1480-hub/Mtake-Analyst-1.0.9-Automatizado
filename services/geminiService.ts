
import { GoogleGenAI, Type } from "@google/genai";
import { MarketSnapshot, AnalysisResult, SignalType, NewsSource, PreMarketAnalysis, PostEntryAnalysis } from '../types';

// --- CONFIGURAÇÃO DE FONTES ---
const PREFERRED_SOURCES = `
FONTES DE ALTA CREDIBILIDADE OBRIGATÓRIAS:
- Bloomberg
- Valor Econômico
- Reuters
- InfoMoney
- Investing.com (Calendário e Cotações)
- BDM (Bom Dia Mercado)
- TC Mover
- Broadcast (Agência Estado)
`;

// --- FALLBACK: ANÁLISE MATEMÁTICA (CASO A IA FALHE) ---
function fallbackHeuristicAnalysis(snapshot: MarketSnapshot, newsSummary: string): AnalysisResult {
  let score = 0;
  const reasons: string[] = [];
  const positive: string[] = [];
  const negative: string[] = [];

  const assets = snapshot.assets || [];
  
  const ewz = assets.find(a => a.symbol === 'EWZ');
  if (ewz) {
    if (ewz.changePercent > 0.5) { score += 3; positive.push(`EWZ subindo forte (${ewz.changePercent}%)`); }
    else if (ewz.changePercent < -0.5) { score -= 3; negative.push(`EWZ caindo forte (${ewz.changePercent}%)`); }
  }

  const spy = assets.find(a => a.symbol === 'SPY');
  if (spy) {
    if (spy.changePercent > 0.3) { score += 2; positive.push("S&P 500 em alta"); }
    else if (spy.changePercent < -0.3) { score -= 2; negative.push("S&P 500 em baixa"); }
  }

  const usd = assets.find(a => a.symbol === 'USD');
  const dxy = assets.find(a => a.symbol === 'UUP');

  if (usd) {
    if (usd.changePercent < -0.2) { score += 1.5; positive.push("Dólar (BRL) perdendo força"); }
    else if (usd.changePercent > 0.2) { score -= 1.5; negative.push("Dólar (BRL) ganhando força"); }
  }

  if (dxy) {
    if (dxy.changePercent < -0.1) { score += 1.5; positive.push("DXY (Global) em queda (Risk-On)"); }
    else if (dxy.changePercent > 0.1) { score -= 1.5; negative.push("DXY (Global) em alta (Risk-Off)"); }
  }

  let signal = SignalType.NEUTRO;
  let confidence = 50;
  let outlook = "Lateralidade (Aguardar)";
  let entry = "Aguardar rompimento";
  let takeProfit = "N/A";
  let stopLoss = "N/A";

  if (score >= 3) {
    signal = SignalType.COMPRA;
    confidence = Math.min(60 + (score * 5), 95);
    outlook = "Tendência de Alta";
    entry = "Comprar Pullback";
    takeProfit = "+150 a +300 pts";
    stopLoss = "-150 pts";
  } else if (score <= -3) {
    signal = SignalType.VENDA;
    confidence = Math.min(60 + (Math.abs(score) * 5), 95);
    outlook = "Tendência de Baixa";
    entry = "Vender Repique";
    takeProfit = "+150 a +300 pts";
    stopLoss = "-150 pts";
  }

  return {
    signal,
    confidence,
    reasoning: "⚠️ MODO DE CONTINGÊNCIA (IA Indisponível): Sinal gerado por algoritmo quantitativo baseado no fluxo de EWZ, SPY, Dólar e DXY.",
    technicalOutlook: outlook,
    entryZone: entry,
    takeProfit,
    stopLoss,
    positiveFactors: positive.length > 0 ? positive : ["Fluxo comprador leve"],
    negativeFactors: negative.length > 0 ? negative : ["Fluxo vendedor leve"],
    newsSummary: newsSummary || "Não foi possível carregar notícias detalhadas no modo offline.",
    newsSources: [],
    timestamp: new Date().toISOString(),
    provider: 'FALLBACK'
  };
}

// Extract sources from GroundingChunks
function extractSources(response: any): NewsSource[] {
  try {
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    return chunks
      .filter((c: any) => c.web?.uri && c.web?.title)
      .map((c: any) => ({ title: c.web!.title!, uri: c.web!.uri! }))
      .filter((v: NewsSource, i: number, a: NewsSource[]) => a.findIndex(t => t.uri === v.uri) === i)
      .slice(0, 5); // Increased slightly to accommodate more sources
  } catch (e) {
    return [];
  }
}

async function fetchMarketNews(ai: GoogleGenAI): Promise<{ summary: string; sources: NewsSource[] }> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: `
        Atue como um terminal de notícias financeiras institucional.
        Pesquise as notícias MAIS RECENTES (última hora) que impactam o Day Trade no Brasil (WINFUT).
        
        ${PREFERRED_SOURCES}

        Foque em:
        1. "Ibovespa hoje" e "Mercado Financeiro Ao Vivo".
        2. "Dólar Futuro tendência" e "Swap Cambial".
        3. "Petrobras (PETR4) e Vale (VALE3)" (Moves corporativos).
        4. "Cenário Fiscal: Haddad, Tebet, Campos Neto, Lula" (Declarações recentes).
        5. "S&P 500 Futures" e "Treasuries US".

        Resuma os fatos, citando a fonte quando relevante (ex: "Segundo a Bloomberg...").
      `,
      config: { tools: [{ googleSearch: {} }] }
    });

    const sources = extractSources(response);

    return {
      summary: response.text || "Sem notícias relevantes encontradas no momento.",
      sources
    };

  } catch (error) {
    console.warn("Aviso: Busca de notícias indisponível.", error);
    return { summary: "Notícias indisponíveis (Modo Numérico Puro).", sources: [] };
  }
}

// Improved Helper to clean JSON response
const cleanJsonText = (text: string): string => {
  if (!text) return "{}";
  let clean = text.replace(/```json\s*/g, "").replace(/```\s*$/g, "");
  const firstOpen = clean.indexOf('{');
  const lastClose = clean.lastIndexOf('}');
  if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
    clean = clean.substring(firstOpen, lastClose + 1);
  }
  const trimmed = clean.trim();
  return trimmed || "{}"; // Fallback to empty object if trim results in empty string
};

// --- FUNÇÃO DE SINAL (DAY TRADE) ---
export const analyzeMarket = async (
  snapshot: MarketSnapshot, 
  imageBase64?: string,
  preSignalContext?: AnalysisResult | null
): Promise<AnalysisResult> => {
  let newsSummary = "Aguardando análise...";
  let newsSources: NewsSource[] = [];

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const newsData = await fetchMarketNews(ai);
    newsSummary = newsData.summary;
    newsSources = newsData.sources;

    const categories: Record<string, string[]> = {};
    (snapshot.assets || []).forEach(a => {
      if (!categories[a.category]) categories[a.category] = [];
      const change = typeof a.changePercent === 'number' ? a.changePercent : 0;
      const sign = change > 0 ? '+' : '';
      categories[a.category].push(`${a.symbol}: ${sign}${change}%`);
    });

    const marketDataSummary = Object.entries(categories)
      .map(([cat, items]) => `### ${cat}:\n${items.join(', ')}`)
      .join('\n\n');

    // CONSTRUÇÃO DO CONTEXTO DE PRÉ-SINAL (CONFLUÊNCIA)
    let preSignalPromptPart = "";
    if (preSignalContext) {
      preSignalPromptPart = `
        ===============================================================
        CONTEXTO DE PRÉ-SINAL (VIÉS MACRO DE FLUXO):
        ===============================================================
        O sistema já rodou uma análise de fluxo puro anteriormente.
        - Direção Sugerida pelo Fluxo: ${preSignalContext.signal}
        - Força do Movimento: ${preSignalContext.confidence}%
        - Raciocínio Macro Prévio: "${preSignalContext.reasoning}"

        INSTRUÇÃO DE CONFLUÊNCIA:
        Use este Pré-Sinal como base Macro.
        1. Se a sua análise técnica (Gráfico/Dados Agora) CONCORDAR com o Pré-Sinal -> AUMENTE a confiança do sinal final (Confluência Total).
        2. Se a sua análise técnica DISCORDAR do Pré-Sinal -> ALERTE sobre a divergência (ex: "Fluxo Macro é Venda, mas Gráfico pede Compra") e diminua a confiança.
      `;
    }

    const promptText = `
      Atue como um Trader Institucional Sênior.
      
      ## 1. CONTEXTO DE NOTÍCIAS (CRÍTICO - FONTES INSTITUCIONAIS):
      "${newsSummary}"
      (Se houver notícia de alto impacto contra o fluxo técnico, invalide o sinal. CITE a fonte - ex: BDM, Reuters - se ela for relevante).
      
      ${preSignalPromptPart}

      ## 2. DADOS REAIS (41 Ativos AGORA):
      ${marketDataSummary}

      **REGRAS MACRO:**
      1. Compare DXY (UUP) vs USDBRL. Se ambos sobem = Venda.
      2. Compare EWZ vs SPY. Se EWZ cai e SPY sobe = Venda (Desacoplamento).

      ${imageBase64 ? `
      ## 3. ANÁLISE VISUAL (PRICE ACTION + INDICADORES QUANT): 
      Olhe para a imagem anexa com atenção. 
      
      **DETECÇÃO DO INDICADOR "VOLATILIDADE DE AIRES":**
      - Procure por **LINHAS HORIZONTAIS LARANJAS** (Canais de Volatilidade / Frequência).
      - **Linha Laranja INFERIOR:** Funciona como SUPORTE ESTATÍSTICO. Se o preço tocar nela e o fluxo for de compra -> Oportunidade de Ouro (Retorno à Média).
      - **Linha Laranja SUPERIOR:** Funciona como RESISTÊNCIA ESTATÍSTICA (Exaustão). Se o preço tocar nela -> Risco de Venda ou Realização.
      
      **OUTROS PADRÕES:**
      - Suportes e Resistências clássicos.
      - Médias Móveis (Preço esticado?).
      
      **GATILHO DE ENTRADA:**
      - Use as LINHAS LARANJAS como referência de precisão.
      - Stop Loss: Deve ficar protegido ATRÁS da linha laranja ou suporte técnico.
      ` : '## ANÁLISE TÉCNICA: Estime níveis técnicos baseados na volatilidade.'}
      
      Gere um sinal e setup completo (Entrada, Stop, Alvo).
    `;

    const parts: any[] = [{ text: promptText }];
    if (imageBase64) {
      const base64Data = imageBase64.split(',')[1] || imageBase64;
      parts.push({ inlineData: { mimeType: "image/png", data: base64Data } });
    }

    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: { parts: parts },
      config: {
        thinkingConfig: { thinkingBudget: 2048 }, 
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            signal: { type: Type.STRING, enum: [SignalType.COMPRA, SignalType.VENDA, SignalType.NEUTRO] },
            confidence: { type: Type.INTEGER },
            reasoning: { type: Type.STRING, description: "Explicação do sinal. Se identificar linhas laranjas (Volatilidade de Aires), mencione-as." },
            technicalOutlook: { type: Type.STRING },
            entryZone: { type: Type.STRING },
            stopLoss: { type: Type.STRING },
            takeProfit: { type: Type.STRING },
            positiveFactors: { type: Type.ARRAY, items: { type: Type.STRING } },
            negativeFactors: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["signal", "confidence", "reasoning", "technicalOutlook", "entryZone", "stopLoss", "takeProfit", "positiveFactors", "negativeFactors"]
        }
      }
    });

    const resultText = response.text || "{}";
    const analysis = JSON.parse(cleanJsonText(resultText));

    return { ...analysis, newsSummary, newsSources, timestamp: new Date().toISOString(), provider: 'GEMINI' } as AnalysisResult;

  } catch (error) {
    console.error("Gemini Error:", error);
    return fallbackHeuristicAnalysis(snapshot, newsSummary);
  }
};

// --- FUNÇÃO PÓS-ENTRADA (GESTÃO DE RISCO) ---
export const analyzeTradeManagement = async (
  snapshot: MarketSnapshot, 
  direction: 'COMPRA' | 'VENDA', 
  imageBase64: string,
  previousAnalysis?: AnalysisResult | null
): Promise<PostEntryAnalysis> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const newsData = await fetchMarketNews(ai);

  const categories: Record<string, string[]> = {};
  (snapshot.assets || []).forEach(a => {
    if (!categories[a.category]) categories[a.category] = [];
    const change = typeof a.changePercent === 'number' ? a.changePercent : 0;
    const sign = change > 0 ? '+' : '';
    categories[a.category].push(`${a.symbol}: ${sign}${change}%`);
  });
  const marketDataSummary = Object.entries(categories)
    .map(([cat, items]) => `### ${cat}:\n${items.join(', ')}`)
    .join('\n\n');

  const base64Data = imageBase64.split(',')[1] || imageBase64;

  // CONSTRUÇÃO DO CONTEXTO DETALHADO DO SINAL ANTERIOR
  let previousSignalContext = "NENHUM SINAL PRÉVIO GERADO PELO SISTEMA (O usuário está operando sem referência técnica do App).";
  
  if (previousAnalysis) {
    previousSignalContext = `
      ======================================================
      O SISTEMA JÁ HAVIA GERADO UM SETUP TÉCNICO COMPLETO:
      ======================================================
      - DIREÇÃO SUGERIDA: ${previousAnalysis.signal} (Confiança: ${previousAnalysis.confidence}%)
      
      PARÂMETROS DE REFERÊNCIA (USE ISTO PARA VALIDAR A LINHA AMARELA):
      - Faixa/Ponto de Entrada Sugerido: "${previousAnalysis.entryZone}"
      - Stop Loss Sugerido: "${previousAnalysis.stopLoss}"
      - Alvo (Gain) Sugerido: "${previousAnalysis.takeProfit}"
      
      IMPORTANTE: O campo 'Faixa de Entrada' pode conter um intervalo (ex: 'Entre 128.000 e 128.500'). Interprete o texto inteligentemente para comparar com a linha amarela.
    `;
  }

  const promptText = `
    Você é um RISK MANAGER Institucional Sênior. O usuário já está posicionado em uma operação de ${direction}.
    
    ## 1. COMPARAÇÃO COM O SINAL ANTERIOR (CRÍTICO):
    ${previousSignalContext}
    
    ## 2. ANÁLISE VISUAL (ATENÇÃO ÀS CORES E INDICADOR AIRES):
    - Olhe para a imagem anexa.
    - **LINHA AMARELA** = PONTO DE ENTRADA (Onde o usuário comprou/vendeu).
    - **LINHAS VERDES** = PONTOS DE SAÍDA (Stop Loss ou Gain).
    - **LINHAS LARANJAS (Opcional):** Se existirem, são Canais de Volatilidade de Aires (Suportes/Resistências Fortes).
    
    TAREFA DE GESTÃO:
    - Verifique se a LINHA AMARELA (Entrada) está protegida por alguma LINHA LARANJA (Suporte Estatístico).
    - Verifique se o preço atual está batendo em uma LINHA LARANJA oposta (Alvo/Exaustão). Se sim -> Sugerir Realização.
    
    ## 3. AUDITORIA DE FLUXO (41 ATIVOS AGORA):
    ${marketDataSummary}
    Notícias (Fontes: Reuters, Bloomberg, etc): "${newsData.summary}"

    ## VEREDITO DE GESTÃO:
    Cruze (Gráfico + Indicador Aires + Fluxo Agora + Sinal Anterior).
    1. O fluxo Macro ainda apoia a direção ${direction}?
    2. O preço está "seguro" visualmente?
    3. As linhas de volatilidade (laranjas) confirmam a tese?

    Gere um relatório tático.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-pro-preview",
    contents: { 
      parts: [
        { text: promptText },
        { inlineData: { mimeType: "image/png", data: base64Data } }
      ]
    },
    config: {
      thinkingConfig: { thinkingBudget: 2048 },
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          tradeStatus: { type: Type.STRING, enum: ['SAUDÁVEL', 'ALERTA', 'CRÍTICO'] },
          actionRecommendation: { type: Type.STRING, enum: ['SEGURAR', 'ZERAR', 'MOVER STOP', 'REALIZAR PARCIAL'] },
          macroAlignment: { type: Type.STRING, enum: ['A FAVOR', 'CONTRA', 'NEUTRO'] },
          analysisText: { type: Type.STRING, description: "Explicação cruzando a linha amarela (entrada) com o indicador de Volatilidade (linhas laranjas)." },
          adjustmentSuggestion: { type: Type.STRING, description: "Sugestão tática usando os canais de volatilidade." },
          score: { type: Type.INTEGER, description: "Nota de 0 a 100 para a saúde do trade" }
        },
        required: ["tradeStatus", "actionRecommendation", "macroAlignment", "analysisText", "adjustmentSuggestion", "score"]
      }
    }
  });

  const resultText = response.text || "{}";
  const result = JSON.parse(cleanJsonText(resultText));
  // Pass news sources for display compliance
  return { ...result, newsSources: newsData.sources, timestamp: new Date().toISOString() };
};

// --- ANÁLISE PRÉ-MERCADO ---
export const generatePreMarketReport = async (snapshot: MarketSnapshot): Promise<PreMarketAnalysis> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const newsResponse = await ai.models.generateContent({
    model: "gemini-3-pro-preview",
    contents: `
      Pesquise informações para o Morning Call da B3 de hoje usando estas FONTES ESPECÍFICAS:
      ${PREFERRED_SOURCES}

      INVESTIGUE:
      1. AGENDA ECONÔMICA (Horários de Payroll, FOMC, PIB).
      2. FLUXO ESTRANGEIRO NA B3 ONTEM (Saldo).
      3. CONTEXTO TÉCNICO DE ONTEM (WINFUT) - Quem ganhou?
      4. NOTÍCIAS DA NOITE/MANHÃ (Ásia/Europa) que afetam o Brasil.
    `,
    config: { tools: [{ googleSearch: {} }] }
  });

  const context = newsResponse.text || "Sem notícias.";
  const sources = extractSources(newsResponse);
  
  const categories: Record<string, string[]> = {};
  (snapshot.assets || []).forEach(a => {
    if (!categories[a.category]) categories[a.category] = [];
    const change = typeof a.changePercent === 'number' ? a.changePercent : 0;
    const sign = change > 0 ? '+' : '';
    categories[a.category].push(`${a.symbol}: ${sign}${change}%`);
  });

  const fullMarketData = Object.entries(categories)
    .map(([cat, items]) => `### ${cat}:\n${items.join(', ')}`)
    .join('\n\n');

  const response = await ai.models.generateContent({
    model: "gemini-3-pro-preview",
    contents: `
      Você é um Estrategista Institucional. Crie um Morning Call baseado no Playbook e nas fontes citadas (Bloomberg, Valor, TC Mover, etc):
      
      CONTEXTO WEB: ${context}
      DADOS 41 ATIVOS: ${fullMarketData}
      
      Gere JSON estrito com os 5 pilares (Agenda, Fluxo, Correlacionados, Contexto Ontem, Viés).
    `,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          globalSentiment: { type: Type.STRING, enum: ['BULLISH', 'BEARISH', 'MIXED', 'NEUTRAL'] },
          openingBias: { type: Type.STRING },
          volatilitySchedule: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                time: { type: Type.STRING },
                event: { type: Type.STRING },
                impact: { type: Type.STRING, enum: ['ALTO', 'MÉDIO', 'BAIXO'] },
                action: { type: Type.STRING }
              }
            }
          },
          foreignFlow: { type: Type.STRING },
          correlations: {
            type: Type.OBJECT,
            properties: {
              sp500: { type: Type.STRING },
              dxy: { type: Type.STRING },
              ewz: { type: Type.STRING },
              treasuries: { type: Type.STRING }
            }
          },
          yesterdayContext: { type: Type.STRING },
          strategyPlan: { type: Type.STRING }
        },
        required: ["globalSentiment", "openingBias", "volatilitySchedule", "foreignFlow", "correlations", "yesterdayContext", "strategyPlan"]
      }
    }
  });

  const resultText = response.text || "{}";
  const result = JSON.parse(cleanJsonText(resultText));
  // Pass news sources for display compliance
  return { ...result, newsSources: sources, timestamp: new Date().toISOString() };
};
