import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import {
  Sparkles,
  BarChart3,
  History as HistoryIcon,
  BookOpen,
  Copy,
  Search,
  RefreshCw,
  Palette,
  Check,
  Zap,
  Sliders,
  CheckCircle2,
  Database,
  Calendar
} from 'lucide-react';

const AppContext = createContext();

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
  }
};

// Data Simulasi Keluaran Terakhir (Akan diganti fetch API)
const LATEST_RESULTS = {
  'Pasaran HK Pool': { tanggal: '08 Ags 2026', nomor: '7482', periode: 'HK-2841' },
  'Pasaran SGP Pool': { tanggal: '07 Ags 2026', nomor: '1095', periode: 'SGP-1920' },
  'Pasaran SDY Pool': { tanggal: '08 Ags 2026', nomor: '9341', periode: 'SDY-3102' },
};

// Data Historis 3 Tahun
const HISTORICAL_DATA = [
  { id: 1, pasaran: 'Pasaran HK Pool', tanggal: '08 Ags 2026', nomor: '7482', periode: 'HK-2841' },
  { id: 2, pasaran: 'Pasaran HK Pool', tanggal: '07 Ags 2026', nomor: '3819', periode: 'HK-2840' },
  { id: 3, pasaran: 'Pasaran SGP Pool', tanggal: '07 Ags 2026', nomor: '1095', periode: 'SGP-1920' },
  { id: 4, pasaran: 'Pasaran SDY Pool', tanggal: '08 Ags 2026', nomor: '9341', periode: 'SDY-3102' },
  { id: 5, pasaran: 'Pasaran SDY Pool', tanggal: '07 Ags 2026', nomor: '5024', periode: 'SDY-3101' },
];

const MOCK_DREAMS = [
  { kataKunci: 'Kucing', angka: '42 - 08 - 93', deskripsi: 'Simbol intuisi dan ketenangan dalam tradisi numerologi.' },
  { kataKunci: 'Terbang / Burung', angka: '19 - 77 - 54', deskripsi: 'Melambangkan kebebasan dan visi tinggi.' },
  { kataKunci: 'Air / Laut', angka: '03 - 26 - 88', deskripsi: 'Melambangkan kelimpahan energi dan kejernihan pikiran.' },
];

export function AppProvider({ children }) {
  const [activeTab, setActiveTab] = useState('generator');
  const [themeKey, setThemeKey] = useState(() => localStorage.getItem('adi_theme') || 'dark');
  const [pasaran, setPasaran] = useState(() => localStorage.getItem('adi_pasaran') || 'Pasaran HK Pool');
  const [metode, setMetode] = useState(() => localStorage.getItem('adi_metode') || 'AI Neural Mesh');
  const [digitCount, setDigitCount] = useState(() => parseInt(localStorage.getItem('adi_digit_count')) || 4);
  const [resultDigits, setResultDigits] = useState(['7', '4', '8', '2']);
  const [toastMessage, setToastMessage] = useState('');
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationStepText, setSimulationStepText] = useState('');

  const toastTimerRef = useRef(null);
  const simIntervalRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('adi_theme', themeKey);
    localStorage.setItem('adi_pasaran', pasaran);
    localStorage.setItem('adi_metode', metode);
    localStorage.setItem('adi_digit_count', digitCount.toString());
  }, [themeKey, pasaran, metode, digitCount]);

  const showToast = (msg) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(msg);
    toastTimerRef.current = setTimeout(() => setToastMessage(''), 3000);
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`Disalin: ${text}`);
    } catch {
      showToast('Gagal menyalin.');
    }
  };

  const runSimulation = () => {
    if (isSimulating) return;
    setIsSimulating(true);
    setSimulationStepText('Proses Analisis Data...');

    let counter = 0;
    simIntervalRef.current = setInterval(() => {
      setResultDigits(Array.from({ length: digitCount }, () => Math.floor(Math.random() * 10).toString()));
      counter++;
      if (counter > 10) {
        clearInterval(simIntervalRef.current);
        setIsSimulating(false);
        showToast('Analisis selesai.');
      }
    }, 80);
  };

  const theme = THEMES[themeKey] || THEMES.dark;

  return (
    <AppContext.Provider value={{ activeTab, setActiveTab, themeKey, setThemeKey, theme, pasaran, setPasaran, metode, setMetode, digitCount, setDigitCount, resultDigits, toastMessage, showToast, isSimulating, simulationStepText, runSimulation, copyToClipboard }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);

function ToastNotification() {
  const { toastMessage } = useApp();
  if (!toastMessage) return null;
  return (
    <div className="fixed bottom-20 sm:bottom-6 right-6 z-50 bg-slate-900 border border-emerald-500/40 text-emerald-300 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2">
      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
      <span className="text-xs font-semibold">{toastMessage}</span>
    </div>
  );
}

function Navbar() {
  const { activeTab, setActiveTab, theme } = useApp();

  return (
    <header className={`sticky top-0 z-40 ${theme.headerBg} backdrop-blur-md border-b ${theme.border}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl ${theme.bgAccent} flex items-center justify-center text-slate-950 shadow-lg`}>
            <Zap className="w-6 h-6 fill-slate-950" />
          </div>
          <h1 className="font-bold text-lg tracking-tight text-white">AdiPredictor <span className={theme.textAccent}>AI</span></h1>
        </div>

        <nav className={`hidden md:flex items-center gap-1 ${theme.innerBg} p-1.5 rounded-xl border ${theme.border}`}>
          {[
            { id: 'generator', label: 'Analisis AI', icon: Sparkles },
            { id: 'results', label: 'Data Keluaran', icon: Database },
            { id: 'analytics', label: 'Statistik', icon: BarChart3 },
            { id: 'dreams', label: 'Tafsir', icon: BookOpen },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition ${activeTab === tab.id ? `${theme.bgAccent} text-slate-950 font-semibold` : 'text-slate-400 hover:text-slate-200'}`}>
                <Icon className="w-4 h-4" /> {tab.label}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

function GeneratorPanel() {
  const { theme, pasaran, setPasaran, metode, setMetode, digitCount, setDigitCount, resultDigits, isSimulating, runSimulation, copyToClipboard } = useApp();
  const latest = LATEST_RESULTS[pasaran] || { tanggal: '-', nomor: '----', periode: '-' };

  return (
    <div className="space-y-6">
      {/* Card Data Keluaran Terakhir */}
      <div className={`${theme.cardBg} border ${theme.border} rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-lg`}>
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl">
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-mono text-slate-400">Hasil Keluaran Terakhir ({latest.periode})</span>
            <h4 className="text-sm font-bold text-slate-200">{pasaran} - {latest.tanggal}</h4>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-2xl font-mono font-extrabold ${theme.textAccent} ${theme.innerBg} px-4 py-1.5 rounded-xl border ${theme.border}`}>
            {latest.nomor}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className={`${theme.cardBg} rounded-2xl border ${theme.border} p-5 space-y-5 shadow-xl`}>
          <h3 className="font-semibold text-slate-200 text-sm flex items-center gap-2 border-b border-slate-800 pb-3">
            <Sliders className={`w-4 h-4 ${theme.textAccent}`} /> Parameter Analisis
          </h3>

          <div className="space-y-2">
            <label className="text-xs text-slate-400 font-medium">Pilih Pasaran</label>
            <select value={pasaran} onChange={(e) => setPasaran(e.target.value)} className={`w-full ${theme.innerBg} border ${theme.border} rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none`}>
              <option value="Pasaran HK Pool">Pasaran HK Pool</option>
              <option value="Pasaran SGP Pool">Pasaran SGP Pool</option>
              <option value="Pasaran SDY Pool">Pasaran SDY Pool</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-slate-400 font-medium">Metode Analisis</label>
            <div className="grid grid-cols-1 gap-2">
              {['AI Neural Mesh', 'Frekuensi Tertinggi (Hot)', 'Monte Carlo Random', 'Numerologi Fengshui'].map((m) => (
                <button key={m} onClick={() => setMetode(m)} className={`p-3 rounded-xl border text-left text-xs ${metode === m ? `${theme.badgeBg} ${theme.border} font-bold` : `${theme.innerBg} border-slate-800 text-slate-400`}`}>
                  {m}
                </button>
              ))}
            </div>
          </div>

          <button onClick={runSimulation} disabled={isSimulating} className={`w-full py-3.5 rounded-xl bg-gradient-to-r ${theme.btnGradient} font-bold text-sm shadow-lg flex items-center justify-center gap-2`}>
            <RefreshCw className={`w-5 h-5 ${isSimulating ? 'animate-spin' : ''}`} />
            {isSimulating ? 'Memproses...' : 'Proses Prediksi Angka'}
          </button>
        </div>

        <div className={`lg:col-span-2 ${theme.cardBg} rounded-2xl border ${theme.border} p-6 flex flex-col justify-between shadow-xl space-y-6`}>
          <div className="border-b border-slate-800 pb-4">
            <span className={`text-xs ${theme.textAccent} font-mono uppercase`}>{pasaran}</span>
            <h3 className="text-lg font-bold text-slate-100">Rekomendasi Prediksi AI</h3>
          </div>

          <div className="py-8 flex flex-col items-center space-y-6">
            <div className="flex gap-3 sm:gap-5">
              {resultDigits.map((digit, idx) => (
                <div key={idx} className={`w-16 h-20 sm:w-20 sm:h-24 bg-slate-900 border ${theme.borderLight} rounded-2xl flex items-center justify-center text-3xl sm:text-4xl font-mono font-bold ${theme.textAccent}`}>
                  {digit}
                </div>
              ))}
            </div>
            <button onClick={() => copyToClipboard(resultDigits.join(''))} className="px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-2">
              <Copy className={`w-4 h-4 ${theme.textAccent}`} /> Salin Prediksi ({resultDigits.join('')})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

{/* Menu Baru: Data Keluaran 3 Tahun */}
function ResultsPanel() {
  const { theme, copyToClipboard } = useApp();
  const [selectedMarket, setSelectedMarket] = useState('Semua');

  const filteredData = selectedMarket === 'Semua' 
    ? HISTORICAL_DATA 
    : HISTORICAL_DATA.filter(item => item.pasaran === selectedMarket);

  return (
    <div className={`${theme.cardBg} rounded-2xl border ${theme.border} p-6 space-y-4 shadow-xl`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h3 className="text-lg font-bold text-slate-100">Data Keluaran Resmi (Historis 3 Tahun)</h3>
          <p className="text-xs text-slate-400">Arsip riwayat hasil keluaran nomor resmi HK, SGP, dan SDY.</p>
        </div>
        
        <select 
          value={selectedMarket} 
          onChange={(e) => setSelectedMarket(e.target.value)}
          className={`px-3 py-2 ${theme.innerBg} border ${theme.border} rounded-xl text-xs text-slate-200 focus:outline-none`}
        >
          <option value="Semua">Semua Pasaran</option>
          <option value="Pasaran HK Pool">Pasaran HK Pool</option>
          <option value="Pasaran SGP Pool">Pasaran SGP Pool</option>
          <option value="Pasaran SDY Pool">Pasaran SDY Pool</option>
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className={`${theme.innerBg} text-slate-400 font-mono uppercase border-b border-slate-800`}>
            <tr>
              <th className="py-3 px-4">Tanggal</th>
              <th className="py-3 px-4">Periode</th>
              <th className="py-3 px-4">Pasaran</th>
              <th className="py-3 px-4">Angka Result</th>
              <th className="py-3 px-4 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-medium">
            {filteredData.map((row) => (
              <tr key={row.id}>
                <td className="py-3.5 px-4 text-slate-400">{row.tanggal}</td>
                <td className="py-3.5 px-4 text-slate-400 font-mono">{row.periode}</td>
                <td className="py-3.5 px-4 text-slate-200">{row.pasaran}</td>
                <td className="py-3.5 px-4">
                  <span className={`font-mono ${theme.textAccent} font-bold ${theme.innerBg} px-2.5 py-1 rounded-md border ${theme.border}`}>
                    {row.nomor}
                  </span>
                </td>
                <td className="py-3.5 px-4 text-right">
                  <button onClick={() => copyToClipboard(row.nomor)} className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-400">
                    <Copy className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AnalyticsPanel() {
  const { theme } = useApp();
  return (
    <div className={`${theme.cardBg} rounded-2xl border ${theme.border} p-6 space-y-6 shadow-xl`}>
      <h3 className="text-lg font-bold text-slate-100 border-b border-slate-800 pb-4">Matriks Frekuensi Digit (0 - 9)</h3>
      <p className="text-xs text-slate-400">Statistik frekuensi kemunculan angka dari data historis.</p>
    </div>
  );
}

function DreamBookPanel() {
  const { theme, copyToClipboard } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const filtered = MOCK_DREAMS.filter(i => i.kataKunci.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className={`${theme.cardBg} rounded-2xl border ${theme.border} p-6 space-y-6 shadow-xl`}>
      <h3 className="text-lg font-bold text-slate-100 border-b border-slate-800 pb-4">Tafsir Kata Kunci</h3>
      <div className="relative">
        <Search className="w-5 h-5 absolute left-3.5 top-3 text-slate-500" />
        <input type="text" placeholder="Cari kata kunci..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className={`w-full ${theme.innerBg} border ${theme.border} rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-200 focus:outline-none`} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((item, i) => (
          <div key={i} className={`${theme.innerBg} border ${theme.border} p-4 rounded-xl flex justify-between items-center`}>
            <div>
              <span className="font-bold text-sm text-slate-200">{item.kataKunci}</span>
              <p className="text-xs text-slate-400 mt-1">{item.deskripsi}</p>
            </div>
            <button onClick={() => copyToClipboard(item.angka)} className={`font-mono text-xs ${theme.textAccent} ${theme.badgeBg} px-3 py-1.5 rounded-lg border font-bold shrink-0 ml-2`}>
              {item.angka}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Footer() {
  const { theme } = useApp();
  return (
    <footer className={`border-t ${theme.border} bg-slate-950 py-4 text-center text-xs text-slate-500 mt-auto`}>
      <p>© 2026 AdiPredictor Application. All rights reserved.</p>
    </footer>
  );
}

function MobileNavigation() {
  const { activeTab, setActiveTab, theme } = useApp();
  return (
    <nav className={`md:hidden sticky bottom-0 z-40 ${theme.headerBg} backdrop-blur-md border-t ${theme.border} px-2 py-2 flex justify-around`}>
      {[
        { id: 'generator', label: 'Analisis', icon: Sparkles },
        { id: 'results', label: 'Data', icon: Database },
        { id: 'analytics', label: 'Statistik', icon: BarChart3 },
        { id: 'dreams', label: 'Tafsir', icon: BookOpen },
      ].map((tab) => {
        const Icon = tab.icon;
        return (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] ${activeTab === tab.id ? `${theme.textAccent} font-bold` : 'text-slate-400'}`}>
            <Icon className="w-4 h-4" /> {tab.label}
          </button>
        );
      })}
    </nav>
  );
}

export default function App() {
  return (
    <AppProvider>
      <MainContent />
    </AppProvider>
  );
}

function MainContent() {
  const { activeTab, theme } = useApp();
  return (
    <div className={`min-h-screen ${theme.bg} text-slate-100 font-sans flex flex-col transition-colors duration-300`}>
      <Navbar />
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {activeTab === 'generator' && <GeneratorPanel />}
        {activeTab === 'results' && <ResultsPanel />}
        {activeTab === 'analytics' && <AnalyticsPanel />}
        {activeTab === 'dreams' && <DreamBookPanel />}
      </main>
      <MobileNavigation />
      <Footer />
      <ToastNotification />
    </div>
  );
}
