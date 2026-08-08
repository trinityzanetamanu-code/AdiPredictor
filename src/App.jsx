import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import {
  Sparkles,
  BarChart3,
  BookOpen,
  Copy,
  Search,
  RefreshCw,
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
    btnGradient: 'from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950'
  }
};

const MOCK_DREAMS = [
  { kataKunci: 'Kucing', angka: '42 - 08 - 93', deskripsi: 'Simbol intuisi dan ketenangan dalam tradisi numerologi.' },
  { kataKunci: 'Terbang / Burung', angka: '19 - 77 - 54', deskripsi: 'Melambangkan kebebasan dan visi tinggi.' },
  { kataKunci: 'Air / Laut', angka: '03 - 26 - 88', deskripsi: 'Melambangkan kelimpahan energi dan kejernihan pikiran.' },
];

export function AppProvider({ children }) {
  const [activeTab, setActiveTab] = useState('generator');
  const [pasaran, setPasaran] = useState('Pasaran HK Pool');
  const [metode, setMetode] = useState('AI Neural Mesh');
  const [digitCount, setDigitCount] = useState(4);
  const [resultDigits, setResultDigits] = useState(['7', '4', '8', '2']);
  const [toastMessage, setToastMessage] = useState('');
  const [isSimulating, setIsSimulating] = useState(false);

  // Dynamic Data States
  const [hkData, setHkData] = useState([]);
  const [sgpData, setSgpData] = useState([]);
  const [sdyData, setSdyData] = useState([]);

  const toastTimerRef = useRef(null);
  const simIntervalRef = useRef(null);

  // Fetch JSON Data Realtime
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [resHk, resSgp, resSdy] = await Promise.all([
          fetch('./data/hk.json'),
          fetch('./data/sgp.json'),
          fetch('./data/sdy.json')
        ]);
        if (resHk.ok) setHkData(await resHk.json());
        if (resSgp.ok) setSgpData(await resSgp.json());
        if (resSdy.ok) setSdyData(await resSdy.json());
      } catch (err) {
        console.error('Gagal mengambil data:', err);
      }
    };
    fetchData();
  }, []);

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

  const theme = THEMES.dark;

  return (
    <AppContext.Provider value={{ activeTab, setActiveTab, theme, pasaran, setPasaran, metode, setMetode, digitCount, setDigitCount, resultDigits, toastMessage, showToast, isSimulating, runSimulation, copyToClipboard, hkData, sgpData, sdyData }}>
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
  const { theme, pasaran, setPasaran, metode, setMetode, resultDigits, isSimulating, runSimulation, copyToClipboard, hkData, sgpData, sdyData } = useApp();

  let activeData = hkData;
  if (pasaran === 'Pasaran SGP Pool') activeData = sgpData;
  if (pasaran === 'Pasaran SDY Pool') activeData = sdyData;

  const latest = activeData[0] || { tanggal: '-', nomor: '----', periode: '-' };

  return (
    <div className="space-y-6">
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

function ResultsPanel() {
  const { theme, copyToClipboard, hkData, sgpData, sdyData } = useApp();
  const [selectedMarket, setSelectedMarket] = useState('Pasaran HK Pool');

  let listData = hkData;
  if (selectedMarket === 'Pasaran SGP Pool') listData = sgpData;
  if (selectedMarket === 'Pasaran SDY Pool') listData = sdyData;

  return (
    <div className={`${theme.cardBg} rounded-2xl border ${theme.border} p-6 space-y-4 shadow-xl`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h3 className="text-lg font-bold text-slate-100">Data Keluaran Resmi</h3>
          <p className="text-xs text-slate-400">Arsip riwayat hasil keluaran nomor resmi.</p>
        </div>

        <select 
          value={selectedMarket} 
          onChange={(e) => setSelectedMarket(e.target.value)}
          className={`px-3 py-2 ${theme.innerBg} border ${theme.border} rounded-xl text-xs text-slate-200 focus:outline-none`}
        >
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
              <th className="py-3 px-4">Angka Result</th>
              <th className="py-3 px-4 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-medium">
            {listData.map((row) => (
              <tr key={row.id}>
                <td className="py-3.5 px-4 text-slate-400">{row.tanggal}</td>
                <td className="py-3.5 px-4 text-slate-400 font-mono">{row.periode}</td>
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
  const { theme, hkData, sgpData, sdyData } = useApp();
  const allData = [...hkData, ...sgpData, ...sdyData];

  const digitCounts = Array(10).fill(0);
  allData.forEach((item) => {
    item.nomor.split('').forEach((d) => { if (!isNaN(d)) digitCounts[d]++; });
  });
  const maxFreq = Math.max(...digitCounts, 1);

  return (
    <div className={`${theme.cardBg} rounded-2xl border ${theme.border} p-6 space-y-6 shadow-xl`}>
      <h3 className="text-lg font-bold text-slate-100 border-b border-slate-800 pb-4">Matriks Frekuensi Digit (0 - 9)</h3>
      <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
        {digitCounts.map((count, digit) => (
          <div key={digit} className={`${theme.innerBg} border ${theme.border} p-2 rounded-xl flex flex-col items-center justify-between h-40`}>
            <span className="text-[11px] font-mono text-slate-400">{count}x</span>
            <div className="w-full bg-slate-900 rounded-lg h-24 flex items-end p-1">
              <div style={{ height: `${Math.round((count / maxFreq) * 100)}%` }} className={`w-full rounded-md ${count === maxFreq && count > 0 ? `bg-gradient-to-t ${theme.btnGradient}` : 'bg-slate-600'}`}></div>
            </div>
            <span className="font-bold text-sm text-slate-100 font-mono">{digit}</span>
          </div>
        ))}
      </div>
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
