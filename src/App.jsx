import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import {
  Sparkles,
  BarChart3,
  History as HistoryIcon,
  BookOpen,
  ShieldCheck,
  Flame,
  Snowflake,
  Copy,
  Search,
  RefreshCw,
  Palette,
  Check,
  Zap,
  TrendingUp,
  Sliders,
  CheckCircle2,
  X
} from 'lucide-react';

// --- CONTEXT STATE MANAGEMENT ---
const AppContext = createContext();

// Theme Configuration Presets
const THEMES = {
  dark: {
    id: 'dark',
    name: 'Dark Slate',
    bg: 'bg-slate-950',
    headerBg: 'bg-slate-900/80',
    cardBg: 'bg-slate-900/90',
    innerBg: 'bg-slate-950/60',
    border: 'border-slate-800',
    borderLight: 'border-slate-700/60',
    textAccent: 'text-emerald-400',
    bgAccent: 'bg-emerald-500',
    badgeBg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    btnGradient: 'from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950',
    ring: 'focus:border-emerald-500'
  },
  midnight: {
    id: 'midnight',
    name: 'Midnight Blue',
    bg: 'bg-slate-950',
    headerBg: 'bg-indigo-950/80',
    cardBg: 'bg-indigo-950/60',
    innerBg: 'bg-slate-950/80',
    border: 'border-indigo-900/50',
    borderLight: 'border-indigo-800/60',
    textAccent: 'text-cyan-400',
    bgAccent: 'bg-cyan-500',
    badgeBg: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
    btnGradient: 'from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-slate-950',
    ring: 'focus:border-cyan-500'
  },
  emerald: {
    id: 'emerald',
    name: 'Emerald Gold',
    bg: 'bg-zinc-950',
    headerBg: 'bg-emerald-950/80',
    cardBg: 'bg-emerald-950/40',
    innerBg: 'bg-zinc-950/80',
    border: 'border-emerald-900/40',
    borderLight: 'border-emerald-800/50',
    textAccent: 'text-teal-300',
    bgAccent: 'bg-teal-400',
    badgeBg: 'bg-teal-500/10 text-teal-300 border-teal-500/20',
    btnGradient: 'from-teal-400 to-emerald-500 hover:from-teal-300 hover:to-emerald-400 text-slate-950',
    ring: 'focus:border-teal-400'
  },
  purple: {
    id: 'purple',
    name: 'Purple Violet',
    bg: 'bg-slate-950',
    headerBg: 'bg-purple-950/80',
    cardBg: 'bg-purple-950/50',
    innerBg: 'bg-slate-950/80',
    border: 'border-purple-900/50',
    borderLight: 'border-purple-800/60',
    textAccent: 'text-fuchsia-400',
    bgAccent: 'bg-fuchsia-500',
    badgeBg: 'bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20',
    btnGradient: 'from-fuchsia-500 to-violet-600 hover:from-fuchsia-400 hover:to-violet-500 text-white',
    ring: 'focus:border-fuchsia-500'
  },
  oled: {
    id: 'oled',
    name: 'OLED Black',
    bg: 'bg-black',
    headerBg: 'bg-zinc-900/90',
    cardBg: 'bg-zinc-900/90',
    innerBg: 'bg-black',
    border: 'border-zinc-800',
    borderLight: 'border-zinc-700',
    textAccent: 'text-emerald-400',
    bgAccent: 'bg-emerald-500',
    badgeBg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    btnGradient: 'from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950',
    ring: 'focus:border-emerald-500'
  }
};

const INITIAL_HISTORY = [
  { id: 101, pasaran: 'Pasaran Alpha (HK)', tanggal: '05 Ags 2026', nomor: '7482', tipe: '4D', shio: 'Kuda', ganjilGenap: 'Genap', metode: 'AI Neural Mesh' },
  { id: 102, pasaran: 'Pasaran Beta (SGP)', tanggal: '04 Ags 2026', nomor: '1095', tipe: '4D', shio: 'Naga', ganjilGenap: 'Ganjil', metode: 'Frekuensi Tertinggi (Hot)' },
  { id: 103, pasaran: 'Pasaran Gamma (SDY)', tanggal: '04 Ags 2026', nomor: '9341', tipe: '4D', shio: 'Ayam', ganjilGenap: 'Ganjil', metode: 'Monte Carlo Random' },
  { id: 104, pasaran: 'Pasaran Alpha (HK)', tanggal: '03 Ags 2026', nomor: '5820', tipe: '4D', shio: 'Tikus', ganjilGenap: 'Genap', metode: 'Numerologi Fengshui' },
  { id: 105, pasaran: 'Pasaran Beta (SGP)', tanggal: '02 Ags 2026', nomor: '3379', tipe: '4D', shio: 'Kelinci', ganjilGenap: 'Ganjil', metode: 'AI Neural Mesh' },
];

const MOCK_DREAMS = [
  { kataKunci: 'Kucing', angka: '42 - 08 - 93', deskripsi: 'Simbol intuisi dan ketenangan dalam tradisi numerologi klasik.' },
  { kataKunci: 'Terbang / Burung', angka: '19 - 77 - 54', deskripsi: 'Melambangkan kebebasan, visi tinggi, dan dinamika pemikiran.' },
  { kataKunci: 'Air / Laut', angka: '03 - 26 - 88', deskripsi: 'Melambangkan emosi, kelimpahan energi, dan kejernihan pikiran.' },
  { kataKunci: 'Mobil / Kendaraan', angka: '61 - 14 - 35', deskripsi: 'Simbol kemajuan karir, pergerakan cepat, dan fokus tujuan.' },
  { kataKunci: 'Uang / Emas', angka: '89 - 02 - 47', deskripsi: 'Gagasan peluang bisnis baru atau keberuntungan tak terduga.' },
  { kataKunci: 'Rumah / Bangunan', angka: '24 - 68 - 11', deskripsi: 'Simbol stabilitas, perlindungan, dan pondasi hidup yang kuat.' },
];

const SHIO_LIST = ['Tikus', 'Kerbau', 'Macan', 'Kelinci', 'Naga', 'Ular', 'Kuda', 'Kambing', 'Monyet', 'Ayam', 'Anjing', 'Babi'];

export function AppProvider({ children }) {
  const [activeTab, setActiveTab] = useState('generator');

  const [themeKey, setThemeKey] = useState(() => {
    try {
      return localStorage.getItem('adi_theme') || 'dark';
    } catch {
      return 'dark';
    }
  });

  const [pasaran, setPasaran] = useState(() => {
    try {
      return localStorage.getItem('adi_pasaran') || 'Pasaran Alpha (HK)';
    } catch {
      return 'Pasaran Alpha (HK)';
    }
  });

  const [metode, setMetode] = useState(() => {
    try {
      return localStorage.getItem('adi_metode') || 'AI Neural Mesh';
    } catch {
      return 'AI Neural Mesh';
    }
  });

  const [digitCount, setDigitCount] = useState(() => {
    try {
      return parseInt(localStorage.getItem('adi_digit_count')) || 4;
    } catch {
      return 4;
    }
  });

  const [history, setHistory] = useState(() => {
    try {
      const saved = localStorage.getItem('adi_history');
      return saved ? JSON.parse(saved) : INITIAL_HISTORY;
    } catch {
      return INITIAL_HISTORY;
    }
  });

  const [resultDigits, setResultDigits] = useState(['7', '4', '8', '2']);
  const [toastMessage, setToastMessage] = useState('');
  const [showDisclaimer, setShowDisclaimer] = useState(true);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationStepText, setSimulationStepText] = useState('');

  const toastTimerRef = useRef(null);
  const simIntervalRef = useRef(null);
  const stepIntervalRef = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem('adi_theme', themeKey);
      localStorage.setItem('adi_pasaran', pasaran);
      localStorage.setItem('adi_metode', metode);
      localStorage.setItem('adi_digit_count', digitCount.toString());
      localStorage.setItem('adi_history', JSON.stringify(history));
    } catch (e) {
      // LocalStorage non-blocking fallback
    }
  }, [themeKey, pasaran, metode, digitCount, history]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (simIntervalRef.current) clearInterval(simIntervalRef.current);
      if (stepIntervalRef.current) clearInterval(stepIntervalRef.current);
    };
  }, []);

  const showToast = (msg) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToastMessage(msg);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage('');
      toastTimerRef.current = null;
    }, 3000);
  };

  const copyToClipboard = async (text) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        showToast(`Disalin ke clipboard: ${text}`);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        if (successful) {
          showToast(`Disalin ke clipboard: ${text}`);
        } else {
          showToast('Gagal menyalin teks.');
        }
      }
    } catch (err) {
      showToast('Gagal menyalin ke clipboard.');
    }
  };

  const generateDigitForMethod = (selectedMetode, currentHistory) => {
    if (selectedMetode === 'Frekuensi Tertinggi (Hot)') {
      const hotPool = [7, 4, 8, 9, 2, 7, 4, 8];
      return Math.random() < 0.7
        ? hotPool[Math.floor(Math.random() * hotPool.length)].toString()
        : Math.floor(Math.random() * 10).toString();
    } else if (selectedMetode === 'Numerologi Fengshui') {
      const fengshuiPool = [8, 9, 6, 8, 9, 3, 2];
      return Math.random() < 0.75
        ? fengshuiPool[Math.floor(Math.random() * fengshuiPool.length)].toString()
        : Math.floor(Math.random() * 10).toString();
    } else if (selectedMetode === 'AI Neural Mesh') {
      const allDigits = currentHistory.flatMap(h => h.nomor.split('')).map(Number);
      if (allDigits.length > 0 && Math.random() < 0.65) {
        return allDigits[Math.floor(Math.random() * allDigits.length)].toString();
      }
      return Math.floor(Math.random() * 10).toString();
    } else {
      return Math.floor(Math.random() * 10).toString();
    }
  };

  const runSimulation = () => {
    if (isSimulating) return;

    if (simIntervalRef.current) clearInterval(simIntervalRef.current);
    if (stepIntervalRef.current) clearInterval(stepIntervalRef.current);

    setIsSimulating(true);
    const steps = [
      'Scanning Pattern...',
      'Building Matrix...',
      'Calculating Probability...',
      'Rendering Result...'
    ];
    let stepIdx = 0;
    setSimulationStepText(steps[0]);
    stepIntervalRef.current = setInterval(() => {
      stepIdx = (stepIdx + 1) % steps.length;
      setSimulationStepText(steps[stepIdx]);
    }, 350);

    let counter = 0;
    simIntervalRef.current = setInterval(() => {
      const tempDigits = Array.from({ length: digitCount }, () => generateDigitForMethod(metode, history));
      setResultDigits(tempDigits);
      counter++;
      if (counter > 14) {
        clearInterval(simIntervalRef.current);
        clearInterval(stepIntervalRef.current);
        simIntervalRef.current = null;
        stepIntervalRef.current = null;
        const finalDigits = Array.from({ length: digitCount }, () => generateDigitForMethod(metode, history));
        setResultDigits(finalDigits);

        const numStr = finalDigits.join('');
        const numSum = finalDigits.map(Number).reduce((a, b) => a + b, 0);
        const computedShio = SHIO_LIST[numSum % 12];
        const isOdd = numSum % 2 !== 0;
        const newRecord = {
          id: Date.now(),
          pasaran,
          tanggal: new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }),
          nomor: numStr,
          tipe: `${digitCount}D`,
          shio: computedShio,
          ganjilGenap: isOdd ? 'Ganjil' : 'Genap',
          metode
        };
        setHistory(prev => [newRecord, ...prev]);
        setIsSimulating(false);
        showToast('Simulasi selesai! Data masuk ke Riwayat & Matrix.');
      }
    }, 80);
  };

  const theme = THEMES[themeKey] || THEMES.dark;

  return (
    <AppContext.Provider
      value={{
        activeTab,
        setActiveTab,
        themeKey,
        setThemeKey,
        theme,
        pasaran,
        setPasaran,
        metode,
        setMetode,
        digitCount,
        setDigitCount,
        history,
        setHistory,
        resultDigits,
        toastMessage,
        showToast,
        showDisclaimer,
        setShowDisclaimer,
        isSimulating,
        simulationStepText,
        runSimulation,
        copyToClipboard
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);

// --- KOMPONEN SUB-MODULE ---

function ToastNotification() {
  const { toastMessage } = useApp();
  if (!toastMessage) return null;

  return (
    <div className="fixed bottom-20 sm:bottom-6 right-6 z-50 bg-slate-900 border border-emerald-500/40 text-emerald-300 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2 animate-bounce">
      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
      <span className="text-xs font-semibold">{toastMessage}</span>
    </div>
  );
}

function DisclaimerBanner() {
  const { showDisclaimer, setShowDisclaimer } = useApp();
  if (!showDisclaimer) return null;

  return (
    <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 text-amber-300 text-xs flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
        <p className="text-[11px] sm:text-xs">
          <strong>PROTOTIPE DESAIN UI/UX (MOCKUP) - AdiPredictor:</strong> Aplikasi ini murni dibuat sebagai portofolio tampilan & latihan antarmuka. Semua angka & data adalah simulasi acak (dummy data) tanpa kemampuan memprediksi hasil nyata.
        </p>
      </div>
      <button
        onClick={() => setShowDisclaimer(false)}
        className="px-3 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 rounded-lg text-xs transition border border-amber-500/30 whitespace-nowrap flex items-center gap-1 shrink-0"
      >
        Saya Mengerti
        <X className="w-3.5 h-3.5 ml-1" />
      </button>
    </div>
  );
}

function Navbar() {
  const { activeTab, setActiveTab, themeKey, setThemeKey, theme, showToast } = useApp();
  const [showThemeMenu, setShowThemeMenu] = useState(false);

  return (
    <header className={`sticky top-0 z-40 ${theme.headerBg} backdrop-blur-md border-b ${theme.border}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl ${theme.bgAccent} flex items-center justify-center text-slate-950 shadow-lg shadow-emerald-500/10`}>
            <Zap className="w-6 h-6 fill-slate-950" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                AdiPredictor <span className={theme.textAccent}>AI</span>
              </h1>
              <span className={`text-[10px] uppercase tracking-wider ${theme.badgeBg} px-2 py-0.5 rounded-full font-mono border`}>
                Sandbox v2.0
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">Interactive Analytics & Pattern Simulator</p>
          </div>
        </div>

        <nav className={`hidden md:flex items-center gap-1 ${theme.innerBg} p-1.5 rounded-xl border ${theme.border}`}>
          {[
            { id: 'generator', label: 'Simulator AI', icon: Sparkles },
            { id: 'analytics', label: 'Matrix Statistik', icon: BarChart3 },
            { id: 'history', label: 'Riwayat Data', icon: HistoryIcon },
            { id: 'dreams', label: 'Tafsir Hoki', icon: BookOpen },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
                  isActive
                    ? `${theme.bgAccent} text-slate-950 font-semibold shadow-md`
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setShowThemeMenu(!showThemeMenu)}
              className={`p-2.5 rounded-xl text-xs ${theme.innerBg} border ${theme.border} hover:border-slate-700 text-slate-300 transition flex items-center gap-1.5`}
              title="Ubah Tema Display"
            >
              <Palette className={`w-4 h-4 ${theme.textAccent}`} />
              <span className="hidden sm:inline text-xs font-medium">{THEMES[themeKey]?.name}</span>
            </button>
            {showThemeMenu && (
              <div className={`absolute right-0 mt-2 w-48 ${theme.cardBg} border ${theme.border} rounded-xl shadow-2xl p-2 z-50 space-y-1`}>
                <p className="text-[10px] text-slate-400 px-2 py-1 uppercase font-mono font-bold border-b border-slate-800">
                  Pilih Warna Tema
                </p>
                {Object.values(THEMES).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setThemeKey(t.id);
                      setShowThemeMenu(false);
                      showToast(`Tema diubah ke ${t.name}`);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs transition ${
                      themeKey === t.id ? 'bg-slate-800 text-white font-semibold' : 'text-slate-400 hover:bg-slate-800/50'
                    }`}
                  >
                    <span>{t.name}</span>
                    {themeKey === t.id && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => showToast('Status Sistem AdiPredictor: Optimal & Siap.')}
            className={`px-3 py-2 rounded-xl text-xs font-medium ${theme.innerBg} border ${theme.border} text-slate-300 transition flex items-center gap-1.5`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="hidden sm:inline">Active</span>
          </button>
        </div>
      </div>
    </header>
  );
}

function DigitDisplay({ resultDigits, isSimulating, simulationStepText }) {
  const { theme, copyToClipboard } = useApp();

  return (
    <div className="py-8 my-auto flex flex-col items-center justify-center space-y-6">
      {isSimulating && (
        <div className="text-center font-mono text-xs text-emerald-400 animate-pulse bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full">
          {simulationStepText}
        </div>
      )}
      <div className="flex items-center justify-center gap-3 sm:gap-5 flex-wrap">
        {resultDigits.map((digit, idx) => (
          <div key={idx} className="relative group">
            <div className={`absolute -inset-1 bg-gradient-to-r ${theme.btnGradient} rounded-2xl blur opacity-30 group-hover:opacity-75 transition duration-300`}></div>
            <div className={`relative w-16 h-20 sm:w-20 sm:h-24 bg-gradient-to-b from-slate-800 to-slate-950 border ${theme.borderLight} rounded-2xl flex items-center justify-center text-3xl sm:text-4xl font-extrabold ${theme.textAccent} font-mono shadow-2xl`}>
              {digit}
            </div>
          </div>
        ))}
      </div>
      <button
        onClick={() => copyToClipboard(resultDigits.join(''))}
        className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold transition flex items-center gap-2"
      >
        <Copy className={`w-4 h-4 ${theme.textAccent}`} />
        Salin Kombinasi ({resultDigits.join('')})
      </button>
    </div>
  );
}

function DynamicStatsCard({ resultDigits }) {
  const { theme } = useApp();

  const numArr = resultDigits.map(Number);
  const sum = numArr.reduce((a, b) => a + b, 0);
  const mean = numArr.length > 0 ? (sum / numArr.length).toFixed(1) : 0;
  const max = numArr.length > 0 ? Math.max(...numArr) : 0;
  const min = numArr.length > 0 ? Math.min(...numArr) : 0;
  const range = max - min;

  const sorted = [...numArr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? ((sorted[mid - 1] + sorted[mid]) / 2).toFixed(1) : sorted[mid];

  const oddCount = numArr.filter((n) => n % 2 !== 0).length;
  const evenCount = numArr.filter((n) => n % 2 === 0).length;

  const shio = SHIO_LIST[sum % 12];

  return (
    <div className={`grid grid-cols-2 sm:grid-cols-4 gap-3 ${theme.innerBg} p-4 rounded-xl border ${theme.border}`}>
      <div>
        <p className="text-[10px] uppercase text-slate-400 font-mono">Keseimbangan</p>
        <p className="text-xs font-bold text-slate-200 mt-0.5">{oddCount} Ganjil / {evenCount} Genap</p>
      </div>
      <div>
        <p className="text-[10px] uppercase text-slate-400 font-mono">Total & Rata-rata</p>
        <p className={`text-xs font-bold ${theme.textAccent} mt-0.5`}>∑ {sum} (μ {mean})</p>
      </div>
      <div>
        <p className="text-[10px] uppercase text-slate-400 font-mono">Median & Range</p>
        <p className="text-xs font-bold text-slate-200 mt-0.5">Med: {median} | R: {range}</p>
      </div>
      <div>
        <p className="text-[10px] uppercase text-slate-400 font-mono">Ekstrem & Shio</p>
        <p className="text-xs font-bold text-slate-200 mt-0.5">{min}-{max} ({shio})</p>
      </div>
    </div>
  );
}

function GeneratorPanel() {
  const {
    theme,
    pasaran,
    setPasaran,
    metode,
    setMetode,
    digitCount,
    setDigitCount,
    resultDigits,
    isSimulating,
    simulationStepText,
    runSimulation,
    history
  } = useApp();

  return (
    <div className="space-y-6">
      <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border ${theme.border} p-6 sm:p-8`}>
        <div className={`absolute top-0 right-0 w-96 h-96 ${theme.bgAccent}/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none`}></div>
        <div className="relative z-10 max-w-2xl space-y-2">
          <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full ${theme.badgeBg} text-xs font-semibold`}>
            <Sparkles className="w-3.5 h-3.5" />
            Engine Simulasi AdiPredictor
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Eksplorasi Pola Distribusi & Frekuensi Angka
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
            Pilih metode algoritma dan jalankan simulasi acak. Hasil simulasi secara otomatis langsung tersinkronisasi ke modul Riwayat dan Matrix Analytics.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className={`${theme.cardBg} rounded-2xl border ${theme.border} p-5 space-y-5 shadow-xl`}>
          <h3 className="font-semibold text-slate-200 text-sm flex items-center gap-2 border-b border-slate-800 pb-3">
            <Sliders className={`w-4 h-4 ${theme.textAccent}`} /> Parameter Simulasi
          </h3>

          <div className="space-y-2">
            <label className="text-xs text-slate-400 font-medium">Pilih Pasaran Simulasi</label>
            <select
              value={pasaran}
              onChange={(e) => setPasaran(e.target.value)}
              className={`w-full ${theme.innerBg} border ${theme.border} rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none ${theme.ring} transition`}
            >
              <option value="Pasaran Alpha (HK)">Pasaran Alpha (HK Pool)</option>
              <option value="Pasaran Beta (SGP)">Pasaran Beta (SGP Pool)</option>
              <option value="Pasaran Gamma (SDY)">Pasaran Gamma (SDY Pool)</option>
              <option value="Pasaran Omega (MAC)">Pasaran Omega (MAC Pool)</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-slate-400 font-medium">Metode Analisis Pola</label>
            <div className="grid grid-cols-1 gap-2">
              {[
                { name: 'AI Neural Mesh', desc: 'Sintesis frekuensi berbasis riwayat terkini' },
                { name: 'Frekuensi Tertinggi (Hot)', desc: 'Mengutamakan digit angka sering keluar' },
                { name: 'Monte Carlo Random', desc: 'Simulasi acak probabilistik murni' },
                { name: 'Numerologi Fengshui', desc: 'Pendekatan filosofi digit hoki' },
              ].map((m) => (
                <button
                  key={m.name}
                  onClick={() => setMetode(m.name)}
                  className={`p-3 rounded-xl border text-left transition flex flex-col gap-0.5 ${
                    metode === m.name ? `${theme.badgeBg} ${theme.border}` : `${theme.innerBg} border-slate-800 text-slate-400 hover:border-slate-700`
                  }`}
                >
                  <span className="text-xs font-semibold text-slate-200">{m.name}</span>
                  <span className="text-[11px] text-slate-400">{m.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-slate-400 font-medium">Format Digit</label>
            <div className="grid grid-cols-3 gap-2">
              {[2, 3, 4].map((d) => (
                <button
                  key={d}
                  onClick={() => setDigitCount(d)}
                  className={`py-2 rounded-xl text-xs font-semibold border transition ${
                    digitCount === d ? `${theme.bgAccent} text-slate-950 font-bold border-emerald-400` : `${theme.innerBg} border-slate-800 text-slate-400 hover:bg-slate-800`
                  }`}
                >
                  {d} Digit ({d}D)
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={runSimulation}
            disabled={isSimulating}
            className={`w-full py-3.5 rounded-xl bg-gradient-to-r ${theme.btnGradient} font-bold text-sm shadow-lg transition-all transform active:scale-98 flex items-center justify-center gap-2 disabled:opacity-50`}
          >
            <RefreshCw className={`w-5 h-5 ${isSimulating ? 'animate-spin' : ''}`} />
            {isSimulating ? 'Memproses Simulasi...' : 'Jalankan Simulasi Pola'}
          </button>
        </div>

        <div className={`lg:col-span-2 ${theme.cardBg} rounded-2xl border ${theme.border} p-6 flex flex-col justify-between shadow-xl space-y-6`}>
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <span className={`text-xs ${theme.textAccent} font-mono tracking-wider uppercase`}>{pasaran}</span>
              <h3 className="text-lg font-bold text-slate-100">Hasil Simulasi Prediksi</h3>
            </div>
            <span className={`text-xs ${theme.innerBg} text-slate-300 border ${theme.border} px-3 py-1 rounded-full font-mono`}>
              Model: {metode}
            </span>
          </div>

          <DigitDisplay resultDigits={resultDigits} isSimulating={isSimulating} simulationStepText={simulationStepText} />
          <DynamicStatsCard resultDigits={resultDigits} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className={`${theme.cardBg} border ${theme.border} rounded-xl p-4 flex items-center gap-4`}>
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl">
            <Flame className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-slate-400">Angka Panas (Hot Digits)</p>
            <p className="text-base font-bold text-slate-100 mt-0.5">
              Digit 7, 4 & 8 <span className="text-xs font-normal text-rose-400">(Tinggi)</span>
            </p>
          </div>
        </div>
        <div className={`${theme.cardBg} border ${theme.border} rounded-xl p-4 flex items-center gap-4`}>
          <div className="p-3 bg-sky-500/10 border border-sky-500/20 text-sky-400 rounded-xl">
            <Snowflake className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-slate-400">Angka Dingin (Cold Digits)</p>
            <p className="text-base font-bold text-slate-100 mt-0.5">
              Digit 0 & 3 <span className="text-xs font-normal text-sky-400">(Rendah)</span>
            </p>
          </div>
        </div>
        <div className={`${theme.cardBg} border ${theme.border} rounded-xl p-4 flex items-center gap-4`}>
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-slate-400">Total Riwayat Terhubung</p>
            <p className="text-base font-bold text-slate-100 mt-0.5">{history.length} Putaran Simulasi</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function AnalyticsPanel() {
  const { theme, history } = useApp();

  const digitCounts = Array(10).fill(0);
  let totalDigitsCounted = 0;
  let totalOddCount = 0;
  let totalEvenCount = 0;
  let totalHighCount = 0;
  let totalLowCount = 0;

  history.forEach((item) => {
    const digits = item.nomor.split('').map(Number);
    digits.forEach((d) => {
      if (!isNaN(d) && d >= 0 && d <= 9) {
        digitCounts[d]++;
        totalDigitsCounted++;
        if (d % 2 !== 0) totalOddCount++;
        else totalEvenCount++;

        if (d >= 5) totalHighCount++;
        else totalLowCount++;
      }
    });
  });

  const maxFreq = Math.max(...digitCounts, 1);

  const oddPct = totalDigitsCounted > 0 ? Math.round((totalOddCount / totalDigitsCounted) * 100) : 50;
  const evenPct = 100 - oddPct;

  const highPct = totalDigitsCounted > 0 ? Math.round((totalHighCount / totalDigitsCounted) * 100) : 50;
  const lowPct = 100 - highPct;

  return (
    <div className="space-y-6">
      <div className={`${theme.cardBg} rounded-2xl border ${theme.border} p-6 space-y-6 shadow-xl`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-100">Matriks Distribusi Frekuensi Real-Time (0 - 9)</h3>
            <p className="text-xs text-slate-400">
              Data di bawah dikalkulasi langsung secara otomatis dari {history.length} entri riwayat simulasi Anda.
            </p>
          </div>
          <span className={`text-xs ${theme.badgeBg} px-3 py-1 rounded-full font-mono self-start sm:self-auto`}>
            Total: {totalDigitsCounted} Digit Teranalisis
          </span>
        </div>

        <div className="grid grid-cols-5 sm:grid-cols-10 gap-2 sm:gap-3">
          {digitCounts.map((count, digit) => {
            const heightPercentage = `${Math.round((count / maxFreq) * 100)}%`;
            const isHighest = count === maxFreq && count > 0;
            return (
              <div key={digit} className={`${theme.innerBg} border ${theme.border} p-2 sm:p-3 rounded-xl flex flex-col items-center justify-between h-48`}>
                <span className="text-[11px] font-mono text-slate-400">{count}x</span>
                <div className="w-full bg-slate-900 rounded-lg h-28 flex items-end p-1">
                  <div
                    style={{ height: heightPercentage }}
                    className={`w-full rounded-md transition-all duration-500 ${
                      isHighest ? `bg-gradient-to-t ${theme.btnGradient}` : 'bg-gradient-to-t from-slate-700 to-slate-500'
                    }`}
                  ></div>
                </div>
                <span className="font-bold text-sm sm:text-base text-slate-100 font-mono">{digit}</span>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-800">
          <div className={`${theme.innerBg} p-4 rounded-xl border ${theme.border} space-y-2`}>
            <div className="flex justify-between text-xs text-slate-300 font-medium">
              <span>Rasio Ganjil vs Genap (Keseluruhan Riwayat)</span>
              <span className={`${theme.textAccent} font-bold`}>{oddPct}% / {evenPct}%</span>
            </div>
            <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden flex">
              <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${oddPct}%` }}></div>
              <div className="h-full bg-teal-600 transition-all duration-500" style={{ width: `${evenPct}%` }}></div>
            </div>
            <p className="text-[11px] text-slate-400">Total {totalOddCount} digit ganjil & {totalEvenCount} digit genap.</p>
          </div>

          <div className={`${theme.innerBg} p-4 rounded-xl border ${theme.border} space-y-2`}>
            <div className="flex justify-between text-xs text-slate-300 font-medium">
              <span>Rasio Besar (5-9) vs Kecil (0-4)</span>
              <span className={`${theme.textAccent} font-bold`}>{highPct}% / {lowPct}%</span>
            </div>
            <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden flex">
              <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${highPct}%` }}></div>
              <div className="h-full bg-indigo-600 transition-all duration-500" style={{ width: `${lowPct}%` }}></div>
            </div>
            <p className="text-[11px] text-slate-400">Total {totalHighCount} digit besar & {totalLowCount} digit kecil.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function HistoryPanel() {
  const { theme, history, setHistory, showToast, copyToClipboard } = useApp();

  const handleClearHistory = () => {
    setHistory([]);
    showToast('Riwayat simulasi berhasil dibersihkan.');
  };

  return (
    <div className="space-y-6">
      <div className={`${theme.cardBg} rounded-2xl border ${theme.border} p-6 space-y-4 shadow-xl`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-100">Riwayat Hasil Output Simulasi</h3>
            <p className="text-xs text-slate-400">Daftar kombinasi angka hasil generasi yang tersimpan di memori lokal.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleClearHistory}
              className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs rounded-xl border border-rose-500/20 transition"
            >
              Hapus Riwayat
            </button>
            <button
              onClick={() => showToast('Data riwayat tersinkronisasi.')}
              className={`px-3 py-1.5 ${theme.innerBg} hover:bg-slate-800 text-slate-200 text-xs rounded-xl border ${theme.border} transition`}
            >
              Sync Data
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className={`${theme.innerBg} text-slate-400 font-mono uppercase tracking-wider border-b border-slate-800`}>
              <tr>
                <th className="py-3 px-4">Tanggal</th>
                <th className="py-3 px-4">Pasaran</th>
                <th className="py-3 px-4">Metode</th>
                <th className="py-3 px-4">Hasil Output</th>
                <th className="py-3 px-4">Shio</th>
                <th className="py-3 px-4">Tipe</th>
                <th className="py-3 px-4 text-right">Opsi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-medium">
              {history.length > 0 ? (
                history.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-3.5 px-4 text-slate-400">{row.tanggal}</td>
                    <td className="py-3.5 px-4 text-slate-200 font-semibold">{row.pasaran}</td>
                    <td className="py-3.5 px-4 text-slate-400 text-[11px]">{row.metode || 'AI Mesh'}</td>
                    <td className="py-3.5 px-4">
                      <span className={`font-mono ${theme.textAccent} font-bold ${theme.innerBg} px-2.5 py-1 rounded-md border ${theme.border}`}>
                        {row.nomor}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-300">{row.shio}</td>
                    <td className="py-3.5 px-4">
                      <span className="bg-slate-800 text-slate-300 text-[10px] px-2 py-0.5 rounded-full border border-slate-700">
                        {row.ganjilGenap}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => copyToClipboard(row.nomor)}
                        className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-emerald-400 transition"
                        title="Salin Angka"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-500">
                    Belum ada riwayat simulasi. Jalankan simulasi di tab "Simulator AI".
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function DreamBookPanel() {
  const { theme, copyToClipboard } = useApp();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredDreams = MOCK_DREAMS.filter((item) =>
    item.kataKunci.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className={`${theme.cardBg} rounded-2xl border ${theme.border} p-6 space-y-6 shadow-xl`}>
        <div className="border-b border-slate-800 pb-4">
          <h3 className="text-lg font-bold text-slate-100">Buku Tafsir Kata Kunci Visual</h3>
          <p className="text-xs text-slate-400">Eksplorasi modul asosiasi angka simbolis untuk ilustrasi desain antarmuka.</p>
        </div>

        <div className="relative">
          <Search className="w-5 h-5 absolute left-3.5 top-3 text-slate-500" />
          <input
            type="text"
            placeholder="Cari simbol (contoh: Kucing, Air, Mobil, Uang)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full ${theme.innerBg} border ${theme.border} rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none ${theme.ring} transition`}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredDreams.length > 0 ? (
            filteredDreams.map((item, i) => (
              <div key={i} className={`${theme.innerBg} border ${theme.border} p-4 rounded-xl flex flex-col justify-between space-y-3 hover:border-slate-700 transition`}>
                <div className="flex justify-between items-start">
                  <span className="font-bold text-sm text-slate-200 flex items-center gap-2">
                    <BookOpen className={`w-4 h-4 ${theme.textAccent}`} /> {item.kataKunci}
                  </span>
                  <span className={`font-mono text-xs ${theme.textAccent} ${theme.badgeBg} px-2.5 py-1 rounded-lg border font-bold`}>
                    {item.angka}
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">{item.deskripsi}</p>
                <button
                  onClick={() => copyToClipboard(item.angka)}
                  className="text-[11px] text-slate-400 hover:text-emerald-400 flex items-center gap-1 self-end pt-2 transition"
                >
                  <Copy className="w-3.5 h-3.5" /> Salin Kombinasi
                </button>
              </div>
            ))
          ) : (
            <div className="col-span-2 text-center py-8 text-slate-500 text-xs">
              Simbol kata kunci tidak ditemukan. Silakan gunakan kata kunci lain.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Footer() {
  const { theme } = useApp();

  return (
    <footer className={`border-t ${theme.border} bg-slate-950 py-6 text-center text-xs text-slate-500 px-4 mt-auto`}>
      <p>© 2026 AdiPredictor UI/UX Design Concept. Proyek Portofolio Eksperimental.</p>
      <p className="mt-1 text-[11px] text-slate-600">
        Aplikasi ini merupakan prototipe antarmuka pengguna (UI/UX) buatan untuk tujuan hiburan dan latihan pemrograman. Tidak terhubung ke server asli dan tidak memprediksi hasil nyata.
      </p>
    </footer>
  );
}

function MobileNavigation() {
  const { activeTab, setActiveTab, theme } = useApp();

  return (
    <nav className={`md:hidden sticky bottom-0 z-40 ${theme.headerBg} backdrop-blur-md border-t ${theme.border} px-2 py-2 flex justify-around`}>
      {[
        { id: 'generator', label: 'Simulasi', icon: Sparkles },
        { id: 'analytics', label: 'Statistik', icon: BarChart3 },
        { id: 'history', label: 'Riwayat', icon: HistoryIcon },
        { id: 'dreams', label: 'Tafsir', icon: BookOpen },
      ].map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-medium transition ${
              isActive ? `${theme.textAccent} font-bold` : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Icon className="w-4 h-4" />
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}

function MainContent() {
  const { activeTab, theme } = useApp();

  return (
    <div className={`min-h-screen ${theme.bg} text-slate-100 font-sans flex flex-col selection:bg-emerald-500 selection:text-slate-950 transition-colors duration-300`}>
      <DisclaimerBanner />
      <Navbar />
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {activeTab === 'generator' && <GeneratorPanel />}
        {activeTab === 'analytics' && <AnalyticsPanel />}
        {activeTab === 'history' && <HistoryPanel />}
        {activeTab === 'dreams' && <DreamBookPanel />}
      </main>
      <MobileNavigation />
      <Footer />
      <ToastNotification />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <MainContent />
    </AppProvider>
  );
}
