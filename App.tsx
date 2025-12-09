
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MarketSnapshot, AnalysisResult, AssetGroup, PreMarketAnalysis, PostEntryAnalysis } from './types';
import { getMarketData } from './services/mockData';
import { analyzeMarket, generatePreMarketReport, analyzeTradeManagement } from './services/geminiService';
import AssetCard from './components/AssetCard';
import SignalDisplay from './components/SignalDisplay';
import PreSignalDisplay from './components/PreSignalDisplay';
import PreMarketDisplay from './components/PreMarketDisplay';
import PostEntryDisplay from './components/PostEntryDisplay';
import { LineChart, RefreshCw, Globe, Zap, List, Info, Sunrise, ShieldCheck, Radar, Clock, PlayCircle, PauseCircle } from 'lucide-react';

const AUTO_UPDATE_INTERVAL_MS = 300000; // 5 Minutos

const App: React.FC = () => {
  const [marketData, setMarketData] = useState<MarketSnapshot | null>(null);
  
  // Estado para Pré-Sinal (Sem Gráfico - Automático)
  const [preSignalAnalysis, setPreSignalAnalysis] = useState<AnalysisResult | null>(null);
  const [isAnalyzingPreSignal, setIsAnalyzingPreSignal] = useState<boolean>(false);

  // Estado para Análise Normal (Com Gráfico - Manual)
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  
  // Estado para Pré-Mercado (Automático)
  const [preMarketReport, setPreMarketReport] = useState<PreMarketAnalysis | null>(null);
  const [isGeneratingPreMarket, setIsGeneratingPreMarket] = useState<boolean>(false);

  // Estado para Pós-Entrada (Gestão)
  const [postEntryAnalysis, setPostEntryAnalysis] = useState<PostEntryAnalysis | null>(null);
  const [isAnalyzingPostEntry, setIsAnalyzingPostEntry] = useState<boolean>(false);

  const [error, setError] = useState<string | null>(null);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(false);
  
  const [activeTab, setActiveTab] = useState<'premarket' | 'presignal' | 'analysis' | 'postentry' | 'assets'>('premarket');

  // --- AUTOMATION STATES ---
  const [isAutoPilot, setIsAutoPilot] = useState<boolean>(true);
  const [timeToNextUpdate, setTimeToNextUpdate] = useState<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastExecutionTimeRef = useRef<number>(0);

  // 1. Data Fetching (Runs frequently to keep prices fresh)
  const fetchData = useCallback(async () => {
    setIsLoadingData(true);
    try {
      const data = await getMarketData();
      if (data && data.assets.length > 0) {
        setMarketData(data);
        return data;
      }
    } catch (err) {
      console.error("Erro ao buscar dados", err);
    } finally {
      setIsLoadingData(false);
    }
    return null;
  }, []);

  useEffect(() => {
    fetchData(); // Initial fetch
    const interval = setInterval(fetchData, 10000); // Update prices every 10s
    return () => clearInterval(interval);
  }, [fetchData]);

  // 2. Logic Wrappers
  const runPreMarketLogic = useCallback(async (data: MarketSnapshot) => {
    setIsGeneratingPreMarket(true);
    try {
      const report = await generatePreMarketReport(data);
      setPreMarketReport(report);
      setActiveTab('premarket');
    } catch (e) {
      console.error(e);
    } finally {
      setIsGeneratingPreMarket(false);
    }
  }, []);

  const runPreSignalLogic = useCallback(async (data: MarketSnapshot) => {
    setIsAnalyzingPreSignal(true);
    try {
      const result = await analyzeMarket(data, undefined); // No image for auto mode
      setPreSignalAnalysis(result);
      setActiveTab('presignal');
    } catch (e) {
      console.error(e);
    } finally {
      setIsAnalyzingPreSignal(false);
    }
  }, []);

  // 3. Automation Engine (Execute Logic)
  const executeAutoPilot = useCallback(async () => {
    if (!isAutoPilot) return;
    
    // Prevent double execution within the same minute window (Throttle)
    const now = Date.now();
    if (now - lastExecutionTimeRef.current < 60000) {
      return; 
    }
    lastExecutionTimeRef.current = now;

    // Ensure we have fresh data right now
    const currentData = await fetchData();
    if (!currentData || currentData.assets.length === 0) {
      console.warn("AutoPilot: Sem dados de mercado, pulando ciclo.");
      return;
    }

    const hour = new Date().getHours();
    
    // Logic: Before 9am -> PreMarket. After 9am -> PreSignal (Radar).
    if (hour < 9) {
      console.log("AutoPilot: Executando Pré-Mercado (Sync)");
      await runPreMarketLogic(currentData);
    } else {
      console.log("AutoPilot: Executando Radar de Fluxo (Sync)");
      await runPreSignalLogic(currentData);
    }

  }, [isAutoPilot, fetchData, runPreMarketLogic, runPreSignalLogic]);

  // 4. Timer Effect (Wall Clock Sync)
  useEffect(() => {
    if (!isAutoPilot) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    // Function to calculate time until next 5-minute mark (xx:00, xx:05, xx:10...)
    const syncWithClock = () => {
      const now = new Date();
      const minutes = now.getMinutes();
      const seconds = now.getSeconds();
      const milliseconds = now.getMilliseconds();

      // Milliseconds in 5 minutes
      const intervalMs = 5 * 60 * 1000;
      
      // Calculate how many ms have passed in the current hour block
      const msPastHour = (minutes * 60 * 1000) + (seconds * 1000) + milliseconds;
      
      // Calculate remaining ms until next 5 min mark
      const remainder = msPastHour % intervalMs;
      const msUntilNextMark = remainder === 0 ? 0 : intervalMs - remainder;
      
      setTimeToNextUpdate(msUntilNextMark);

      // Trigger Logic: If we are very close to the mark (less than 1.1s), execute.
      // We use a threshold > 1000ms because the interval is 1000ms.
      // e.g. if msUntil is 800ms, execute. Next tick it will be ~299800ms.
      if (msUntilNextMark <= 1100) {
        executeAutoPilot();
      }
    };

    // Run immediately to set initial state
    syncWithClock();

    // Check every second
    timerRef.current = setInterval(syncWithClock, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isAutoPilot, executeAutoPilot]);

  // 5. BOOT LOGIC (Initial Run)
  // If AutoPilot is ON, data is loaded, but we have NO analysis yet -> Run immediately.
  // Do not wait for the 5-minute sync for the FIRST run.
  useEffect(() => {
    if (!isAutoPilot || !marketData || marketData.assets.length === 0) return;

    const hour = new Date().getHours();

    // Pre-Market Boot
    if (hour < 9 && !preMarketReport && !isGeneratingPreMarket) {
      console.log("AutoPilot: Boot Run (Pre-Market)");
      runPreMarketLogic(marketData);
    } 
    // Market Open Boot
    else if (hour >= 9 && !preSignalAnalysis && !isAnalyzingPreSignal) {
      console.log("AutoPilot: Boot Run (Pre-Signal)");
      runPreSignalLogic(marketData);
    }
  }, [isAutoPilot, marketData, preMarketReport, preSignalAnalysis, isGeneratingPreMarket, isAnalyzingPreSignal, runPreMarketLogic, runPreSignalLogic]);


  // --- MANUAL HANDLERS (Overrides) ---

  const handlePreSignalAnalyze = useCallback(async () => {
    if (!marketData) return;
    runPreSignalLogic(marketData);
  }, [marketData, runPreSignalLogic]);

  const handleAnalyze = useCallback(async (image?: string) => {
    if (!marketData || marketData.assets.length === 0) {
      setError("Aguarde o carregamento dos dados de mercado.");
      return;
    }
    setIsAnalyzing(true);
    setError(null);
    try {
      const result = await analyzeMarket(marketData, image, preSignalAnalysis);
      setAnalysis(result);
    } catch (err) {
      console.error(err);
      setError("Falha ao gerar análise IA.");
    } finally {
      setIsAnalyzing(false);
    }
  }, [marketData, preSignalAnalysis]);

  const handlePreMarket = useCallback(async () => {
    if (!marketData) return;
    runPreMarketLogic(marketData);
  }, [marketData, runPreMarketLogic]);

  const handlePostEntryAnalyze = useCallback(async (direction: 'COMPRA' | 'VENDA', image: string) => {
    if (!marketData || marketData.assets.length === 0) return;
    setIsAnalyzingPostEntry(true);
    setPostEntryAnalysis(null);
    try {
      const result = await analyzeTradeManagement(marketData, direction, image, analysis);
      setPostEntryAnalysis(result);
    } catch (err) {
      console.error(err);
      setError("Falha na gestão do trade.");
    } finally {
      setIsAnalyzingPostEntry(false);
    }
  }, [marketData, analysis]);

  const getAssetGroups = (data: MarketSnapshot): AssetGroup[] => {
    return [
      {
        title: "Commodities & Metais",
        assets: data.assets.filter(a => a.category === 'Commodities'),
        color: "text-amber-500"
      },
      {
        title: "Índices Globais",
        assets: data.assets.filter(a => a.category === 'Índices Globais'),
        color: "text-blue-400"
      },
      {
        title: "Moedas & Cripto",
        assets: data.assets.filter(a => a.category === 'Moedas'),
        color: "text-emerald-400"
      },
      {
        title: "Treasuries & Juros",
        assets: data.assets.filter(a => a.category === 'Treasuries & Juros'),
        color: "text-rose-400"
      },
      {
        title: "Brasil Blue-Chips",
        assets: data.assets.filter(a => a.category === 'Brasil Blue-Chips'),
        color: "text-green-500"
      }
    ];
  };

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-inter">
      <div className="max-w-6xl mx-auto p-4 md:p-6 pb-20">
        
        <header className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-tr from-blue-600 to-indigo-600 p-3 rounded-xl shadow-lg shadow-blue-900/30">
              <LineChart size={28} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
                Mtake Analyst
              </h1>
              <div className="flex items-center gap-2">
                <p className="text-xs text-slate-400 font-medium tracking-wide">
                  CO-PILOTO INSTITUCIONAL
                </p>
                {/* Auto Pilot Badge */}
                <button 
                  onClick={() => setIsAutoPilot(!isAutoPilot)}
                  className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border transition-all ${
                    isAutoPilot 
                      ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/20' 
                      : 'bg-slate-700 border-slate-600 text-slate-400 hover:bg-slate-600'
                  }`}
                >
                  {isAutoPilot ? <PlayCircle size={10} /> : <PauseCircle size={10} />}
                  {isAutoPilot ? 'AUTO PILOT ON' : 'AUTO PAUSADO'}
                </button>
              </div>
            </div>
          </div>
          
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2 bg-slate-800/60 backdrop-blur px-4 py-2 rounded-full border border-slate-700">
              {isLoadingData ? (
                <RefreshCw size={14} className="animate-spin text-blue-400" />
              ) : (
                <Globe size={14} className="text-emerald-400" />
              )}
              <span className="text-xs text-slate-300 font-mono">
                {isLoadingData ? 'Sincronizando...' : 'Mercado Online'}
              </span>
            </div>

            {/* Countdown Timer */}
            {isAutoPilot && (
               <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono bg-slate-900/50 px-3 py-1 rounded-full border border-slate-800 animate-in fade-in">
                 <Clock size={10} className="text-indigo-400" />
                 Próxima Análise: <span className="text-indigo-300 font-bold">{formatTime(timeToNextUpdate)}</span>
               </div>
            )}
          </div>
        </header>

        {/* Tab Navigation */}
        <div className="flex justify-center mb-8 overflow-x-auto">
          <div className="bg-slate-800 p-1 rounded-xl inline-flex shadow-inner border border-slate-700 min-w-fit">
            <button
              onClick={() => setActiveTab('premarket')}
              className={`flex items-center gap-2 px-4 md:px-6 py-2.5 rounded-lg text-sm font-semibold transition-all whitespace-nowrap relative ${
                activeTab === 'premarket' 
                  ? 'bg-amber-600 text-white shadow-md' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
              }`}
            >
              <Sunrise size={16} />
              Pré-Mercado
              {isAutoPilot && (new Date().getHours() < 9) && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('presignal')}
              className={`flex items-center gap-2 px-4 md:px-6 py-2.5 rounded-lg text-sm font-semibold transition-all whitespace-nowrap relative ${
                activeTab === 'presignal' 
                  ? 'bg-indigo-600 text-white shadow-md' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
              }`}
            >
              <Radar size={16} />
              Pré-Sinal (Auto)
              {isAutoPilot && (new Date().getHours() >= 9) && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('analysis')}
              className={`flex items-center gap-2 px-4 md:px-6 py-2.5 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${
                activeTab === 'analysis' 
                  ? 'bg-blue-600 text-white shadow-md' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
              }`}
            >
              <Zap size={16} />
              Sinal Gráfico
            </button>
            <button
              onClick={() => setActiveTab('postentry')}
              className={`flex items-center gap-2 px-4 md:px-6 py-2.5 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${
                activeTab === 'postentry' 
                  ? 'bg-purple-600 text-white shadow-md' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
              }`}
            >
              <ShieldCheck size={16} />
              Gestão
            </button>
            <button
              onClick={() => setActiveTab('assets')}
              className={`flex items-center gap-2 px-4 md:px-6 py-2.5 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${
                activeTab === 'assets' 
                  ? 'bg-emerald-600 text-white shadow-md' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
              }`}
            >
              <List size={16} />
              Monitor
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 bg-rose-500/10 border border-rose-500/50 text-rose-200 px-4 py-3 rounded-lg flex items-center gap-2 text-sm max-w-2xl mx-auto">
            <Info size={16} />
            {error}
          </div>
        )}

        <main className="min-h-[400px]">
          
          {activeTab === 'premarket' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 max-w-5xl mx-auto">
              <PreMarketDisplay 
                report={preMarketReport} 
                isLoading={isGeneratingPreMarket} 
                onGenerate={handlePreMarket} 
              />
              {isAutoPilot && (new Date().getHours() < 9) && !isGeneratingPreMarket && preMarketReport && (
                 <div className="text-center mt-4 text-[10px] text-slate-500 font-mono opacity-60">
                   * Atualizado automaticamente pelo Auto-Pilot Morning Call.
                 </div>
              )}
            </div>
          )}

          {activeTab === 'presignal' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 max-w-4xl mx-auto">
              <PreSignalDisplay 
                analysis={preSignalAnalysis}
                isLoading={isAnalyzingPreSignal}
                onAnalyze={handlePreSignalAnalyze}
                onReset={() => setPreSignalAnalysis(null)}
              />
              {isAutoPilot && (new Date().getHours() >= 9) && !isAnalyzingPreSignal && preSignalAnalysis && (
                <div className="text-center mt-4 text-[10px] text-slate-500 font-mono opacity-60">
                  * Sincronizado com o Mercado: Atualização automática em {formatTime(timeToNextUpdate)}.
                </div>
              )}
            </div>
          )}

          {activeTab === 'analysis' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 max-w-4xl mx-auto">
              <SignalDisplay 
                analysis={analysis} 
                isLoading={isAnalyzing} 
                onAnalyze={handleAnalyze}
                onReset={() => setAnalysis(null)} 
              />
            </div>
          )}

          {activeTab === 'postentry' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 max-w-4xl mx-auto">
              <PostEntryDisplay 
                analysis={postEntryAnalysis} 
                isLoading={isAnalyzingPostEntry} 
                onAnalyze={handlePostEntryAnalyze}
                onReset={() => setPostEntryAnalysis(null)}
              />
            </div>
          )}

          {activeTab === 'assets' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
              {marketData && marketData.assets.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                  {getAssetGroups(marketData).map((group) => (
                    <div key={group.title} className="bg-slate-800/40 rounded-xl p-4 border border-slate-700/50 flex flex-col h-full">
                      <h3 className={`text-[11px] font-bold uppercase tracking-wider mb-3 pb-2 border-b border-slate-700/50 flex items-center justify-between ${group.color}`}>
                        {group.title}
                        <span className="bg-slate-700/50 text-slate-400 px-1.5 py-0.5 rounded text-[9px]">{group.assets.length}</span>
                      </h3>
                      <div className="space-y-2 overflow-y-auto max-h-[300px] pr-1 custom-scrollbar">
                        {group.assets.map((asset) => (
                          <AssetCard key={asset.symbol} asset={asset} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="w-full bg-slate-800/30 rounded-xl p-16 border border-slate-700/50 flex flex-col items-center justify-center text-center">
                   <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                   <p className="text-slate-300 font-medium">Sincronizando Feed Global...</p>
                   <p className="text-slate-500 text-sm mt-1">Conectando a Commodities, Forex e Bolsas.</p>
                </div>
              )}
            </div>
          )}
        </main>
        
        <footer className="text-center text-slate-600 text-[10px] mt-12 border-t border-slate-800/50 pt-6">
          <p>
            Monitoramento Global: NYSE, NASDAQ, CME (Commodities via ETF), Forex (AwesomeAPI), B3 (Brapi/HG).
          </p>
          <p className="mt-1 opacity-50">Powered by Google Gemini 3 Pro</p>
        </footer>
      </div>
    </div>
  );
};

export default App;
