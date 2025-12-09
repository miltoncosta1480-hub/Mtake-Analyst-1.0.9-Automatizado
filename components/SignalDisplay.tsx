
import React, { useState, useRef } from 'react';
import { AnalysisResult, SignalType } from '../types';
import { Activity, ArrowUpCircle, ArrowDownCircle, MinusCircle, Target, Zap, BrainCircuit, ShieldAlert, ImagePlus, X, Shield, Crosshair, Globe, ExternalLink } from 'lucide-react';

interface SignalDisplayProps {
  analysis: AnalysisResult | null;
  isLoading: boolean;
  onAnalyze: (image?: string) => void;
  onReset: () => void;
}

const SignalDisplay: React.FC<SignalDisplayProps> = ({ analysis, isLoading, onAnalyze, onReset }) => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleClearImage = () => {
    setSelectedImage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleStartAnalysis = () => {
    onAnalyze(selectedImage || undefined);
  };
  
  if (!analysis && !isLoading) {
    return (
      <div className="w-full bg-slate-800/50 rounded-xl p-8 md:p-12 border border-slate-700/50 flex flex-col items-center justify-center text-center shadow-lg backdrop-blur-sm transition-all">
        <div className="bg-slate-700/50 p-4 rounded-full mb-6">
          <Zap className="w-12 h-12 text-blue-400" />
        </div>
        <h2 className="text-2xl font-bold text-slate-100 mb-2">Painel de Estratégia WINFUT</h2>
        <p className="text-slate-400 mb-8 max-w-md">
          O <strong>Gemini 3 Pro</strong> analisará o fluxo global (41 Ativos), Notícias e a sua tela operacional (Gráfico + Fluxo).
        </p>

        {/* Image Upload Zone */}
        <div className="w-full max-w-md mb-8">
          {!selectedImage ? (
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-600 hover:border-blue-500 hover:bg-slate-700/30 rounded-xl p-6 cursor-pointer transition-all flex flex-col items-center gap-2 group"
            >
              <ImagePlus className="text-slate-500 group-hover:text-blue-400 transition-colors" size={32} />
              <p className="text-sm text-slate-400 font-medium">Anexar Print do Gráfico</p>
              <p className="text-[10px] text-amber-400/80 uppercase font-bold tracking-wide">
                 DICA: Se usar "Volatilidade de Aires" (Linhas Laranjas), a precisão aumenta.
              </p>
            </div>
          ) : (
            <div className="relative rounded-xl overflow-hidden border border-blue-500/50 shadow-lg group">
              <img src={selectedImage} alt="Preview" className="w-full h-48 object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
              <button 
                onClick={handleClearImage}
                className="absolute top-2 right-2 bg-slate-900/80 text-white p-1.5 rounded-full hover:bg-rose-500 transition-colors"
              >
                <X size={16} />
              </button>
              <div className="absolute bottom-0 w-full bg-slate-900/80 py-1 text-xs text-blue-200 font-mono">
                Imagem Anexada
              </div>
            </div>
          )}
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleImageUpload} 
            accept="image/*" 
            className="hidden" 
          />
        </div>

        <button 
          onClick={handleStartAnalysis}
          className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-4 rounded-xl font-bold text-lg transition-all shadow-xl hover:shadow-blue-500/25 active:scale-95 flex items-center gap-3 w-full max-w-md justify-center"
        >
          <Activity size={24} />
          Analisar
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="w-full bg-slate-800/50 rounded-xl p-12 border border-slate-700/50 flex flex-col items-center justify-center min-h-[400px] shadow-lg animate-pulse">
        <div className="relative mb-8">
           <div className="w-20 h-20 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
           <div className="absolute inset-0 flex items-center justify-center">
             <Activity className="text-blue-500" size={24} />
           </div>
        </div>
        <h3 className="text-2xl font-semibold text-slate-200 mb-2">Gemini 3 Pensando...</h3>
        <p className="text-slate-400 mb-1">Passo 1: Investigando Notícias Globais...</p>
        <p className="text-slate-500 text-xs mb-1">Passo 2: Cruzando Fluxo dos 41 Ativos...</p>
        {selectedImage && <p className="text-blue-400 text-xs font-bold animate-pulse">Passo 3: Lendo Price Action e Indicadores Quant...</p>}
      </div>
    );
  }

  const getSignalColor = (s: SignalType) => {
    switch (s) {
      case 'COMPRA': return 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400';
      case 'VENDA': return 'bg-rose-500/10 border-rose-500/50 text-rose-400';
      default: return 'bg-slate-500/10 border-slate-500/50 text-slate-400';
    }
  };

  const getSignalIcon = (s: SignalType) => {
    switch (s) {
      case 'COMPRA': return <ArrowUpCircle size={56} className="text-emerald-500" />;
      case 'VENDA': return <ArrowDownCircle size={56} className="text-rose-500" />;
      default: return <MinusCircle size={56} className="text-slate-500" />;
    }
  };

  const isAI = analysis?.provider === 'GEMINI';

  return (
    <div className="space-y-6">
      
      {/* AI Status Badge */}
      <div className="flex justify-center">
        <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold border uppercase tracking-wider ${
          isAI 
            ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300' 
            : 'bg-amber-500/20 border-amber-500/50 text-amber-300'
        }`}>
          {isAI ? <BrainCircuit size={12} /> : <ShieldAlert size={12} />}
          {isAI ? 'Análise IA (Gemini 3 Pro)' : 'Modo Contingência (Backup)'}
        </div>
      </div>
      
      {/* Top Row: Signal & Confidence */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Main Signal Card */}
        <div className={`col-span-1 md:col-span-1 rounded-2xl p-6 border-2 flex flex-col items-center justify-center text-center shadow-xl backdrop-blur-md ${getSignalColor(analysis!.signal)}`}>
          <div className="mb-4 transform hover:scale-110 transition-transform duration-300">
            {getSignalIcon(analysis!.signal)}
          </div>
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] mb-1 opacity-70">Sinal</h2>
          <h1 className="text-4xl lg:text-5xl font-black mb-4 tracking-tighter">{analysis!.signal}</h1>
          
          <div className="w-full bg-slate-900/40 rounded-full h-2 mb-2 overflow-hidden">
            <div 
              className={`h-full transition-all duration-1000 ease-out ${
                analysis!.signal === SignalType.COMPRA ? 'bg-emerald-500' : 
                analysis!.signal === SignalType.VENDA ? 'bg-rose-500' : 'bg-slate-500'
              }`}
              style={{ width: `${analysis!.confidence}%` }}
            />
          </div>
          <p className="text-xs font-mono font-bold opacity-80">{analysis!.confidence}% Confiança</p>
        </div>

        {/* Technical Strategy Card */}
        <div className="col-span-1 md:col-span-2 bg-slate-800 rounded-2xl p-0 border border-slate-700 shadow-lg flex flex-col overflow-hidden">
          
          {/* Header Simplified */}
          <div className="bg-slate-900/50 p-4 border-b border-slate-700/50 flex items-center gap-2">
            <Target className="text-blue-400" size={18} />
            <h3 className="text-slate-200 font-bold text-sm uppercase tracking-wide">Setup Operacional</h3>
            <span className="ml-auto text-xs text-slate-500">{analysis!.technicalOutlook}</span>
          </div>

          {/* Trade Setup Grid (Entry, Stop, Target) */}
          <div className="grid grid-cols-3 divide-x divide-slate-700/50 border-b border-slate-700/50">
            {/* Entry */}
            <div className="p-4 flex flex-col items-center justify-center text-center bg-blue-500/5">
              <span className="text-[10px] uppercase font-bold text-blue-400 mb-1 flex items-center gap-1">
                <Crosshair size={10} /> Entrada
              </span>
              <span className="text-sm font-mono font-semibold text-blue-100 leading-tight">
                {analysis!.entryZone}
              </span>
            </div>

            {/* Stop Loss */}
            <div className="p-4 flex flex-col items-center justify-center text-center bg-rose-500/5">
              <span className="text-[10px] uppercase font-bold text-rose-400 mb-1 flex items-center gap-1">
                <Shield size={10} /> Stop Loss
              </span>
              <span className="text-sm font-mono font-semibold text-rose-100 leading-tight">
                {analysis!.stopLoss}
              </span>
            </div>

            {/* Take Profit */}
            <div className="p-4 flex flex-col items-center justify-center text-center bg-emerald-500/5">
              <span className="text-[10px] uppercase font-bold text-emerald-400 mb-1 flex items-center gap-1">
                <Target size={10} /> Alvo (Gain)
              </span>
              <span className="text-sm font-mono font-semibold text-emerald-100 leading-tight">
                {analysis!.takeProfit}
              </span>
            </div>
          </div>

          {/* Content Body */}
          <div className="p-5 flex-1 flex flex-col gap-4">
             <div>
                <h4 className="text-slate-500 text-[10px] font-bold uppercase mb-1 flex items-center gap-1">
                  <BrainCircuit size={12} /> Lógica do Trade
                </h4>
                <p className="text-slate-300 text-sm leading-relaxed border-l-2 border-slate-600 pl-3">
                  {analysis!.reasoning}
                </p>
             </div>
          </div>

        </div>
      </div>

      {/* Bottom Row: Factors */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-800/80 rounded-xl p-5 border border-slate-700">
          <h4 className="text-emerald-400 text-xs font-bold uppercase mb-4 flex items-center gap-2 border-b border-slate-700 pb-2">
            <ArrowUpCircle size={14} /> Fatores de Alta
          </h4>
          <ul className="space-y-3">
            {analysis!.positiveFactors.length > 0 ? (
              analysis!.positiveFactors.map((f, i) => (
                <li key={i} className="text-emerald-100/90 text-sm flex items-start gap-3 bg-emerald-500/5 p-2 rounded">
                  <span className="mt-1 w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                  {f}
                </li>
              ))
            ) : (
              <li className="text-slate-600 text-sm italic p-2">Sem drivers de alta claros.</li>
            )}
          </ul>
        </div>

        <div className="bg-slate-800/80 rounded-xl p-5 border border-slate-700">
          <h4 className="text-rose-400 text-xs font-bold uppercase mb-4 flex items-center gap-2 border-b border-slate-700 pb-2">
            <ArrowDownCircle size={14} /> Fatores de Baixa
          </h4>
          <ul className="space-y-3">
            {analysis!.negativeFactors.length > 0 ? (
              analysis!.negativeFactors.map((f, i) => (
                <li key={i} className="text-rose-100/90 text-sm flex items-start gap-3 bg-rose-500/5 p-2 rounded">
                  <span className="mt-1 w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0"></span>
                  {f}
                </li>
              ))
            ) : (
              <li className="text-slate-600 text-sm italic p-2">Sem drivers de baixa claros.</li>
            )}
          </ul>
        </div>
      </div>

      {/* Grounding Sources (Mandatory per Gemini API Guidelines) */}
      {analysis!.newsSources && analysis!.newsSources.length > 0 && (
        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
          <h4 className="text-[10px] font-bold uppercase text-slate-500 mb-3 flex items-center gap-2">
            <Globe size={12} /> Fontes de Notícias (Grounding)
          </h4>
          <div className="flex flex-wrap gap-2">
            {analysis!.newsSources.map((source, idx) => (
              <a 
                key={idx} 
                href={source.uri} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="flex items-center gap-2 text-xs text-blue-400 hover:text-blue-300 bg-blue-500/10 px-3 py-1.5 rounded border border-blue-500/20 transition-colors"
              >
                <span className="truncate max-w-[200px]">{source.title}</span>
                <ExternalLink size={10} />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Footer Actions (Reset) */}
      <div className="flex justify-end pt-2">
        <button 
          onClick={onReset} 
          disabled={isLoading}
          className="text-slate-500 hover:text-blue-400 text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-2 disabled:opacity-50"
        >
          <Activity size={14} />
          Nova Análise
        </button>
      </div>

    </div>
  );
};

export default SignalDisplay;
