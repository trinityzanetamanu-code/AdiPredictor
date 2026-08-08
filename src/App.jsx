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
  CheckCircle2
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
  { id: 101, pasaran: 'Pasaran HK Pool', tanggal: '08 Ags 2026', nomor: '7482', tipe: '4D', shio: 'Kuda', ganjilGenap: 'Genap', metode: 'AI Neural Mesh' },
  { id: 102, pasaran: 'Pasaran SGP Pool', tanggal: '07 Ags 2026', nomor: '1095', tipe: '4D', shio: 'Naga', ganjilGenap: 'Ganjil', metode: 'Frekuensi Tertinggi (Hot)' },
  { id: 103, pasaran: 'Pasaran SDY Pool', tanggal: '07 Ags 2026', nomor: '9341', tipe: '4D', shio: 'Ayam', ganjilGenap: 'Ganjil', metode: 'Monte Carlo Random' },
];

const MOCK_DREAMS = [
  { kataKunci: 'Kucing', angka: '42 - 08 - 93', deskripsi: 'Simbol intuisi dan ketenangan dalam tradisi numerologi.' },
  { kataKunci: 'Terbang / Burung', angka: '19 - 77 - 54', deskripsi: 'Melambangkan kebebasan dan visi tinggi.' },
  { kataKunci: 'Air / Laut', angka: '03 - 26 - 88', deskripsi: 'Melambangkan kelimpahan energi dan kejernihan pikiran.' },
  { kataKunci: 'Mobil / Kendaraan', angka: '61 - 14 - 35', deskripsi: 'Simbol kemajuan karir dan pergerakan cepat.' },
  { kataKunci: 'Uang / Emas', angka: '89 - 02 - 47', deskripsi: 'Gagasan peluang bisnis baru atau keberuntungan.' },
  { kataKunci: 'Rumah / Bangunan', angka: '24 - 68 - 11', deskripsi: 'Simbol stabilitas dan pondasi yang kuat.' },
];

const SHIO_LIST = ['Tikus', 'Kerbau', 'Macan', 'Kelinci', 'Naga', 'Ular', 'Kuda', 'Kambing', 'Monyet', 'Ayam', 'Anjing', 'Babi'];

export function AppProvider({ children }) {
  const [activeTab, setActiveTab] = useState('generator');
  const [themeKey, setThemeKey] = useState(() => localStorage.getItem('adi_theme') || 'dark');
  const [pasaran, setPasaran] = useState(() => localStorage.getItem('adi_pasaran') || 'Pasaran HK Pool');
  const [metode, setMetode] = useState(() => localStorage.getItem('adi_metode') || 'AI Neural Mesh');
  const [digitCount, setDigitCount] = useState(() => parseInt(localStorage.getItem('adi_digit_count')) || 4);
  const [history, setHistory] = useState(() => {
    const saved = localStorage.getItem('adi_history');
    return saved ? JSON.parse(saved) : INITIAL_HISTORY;
  });

  const [resultDigits, setResultDigits] = useState(['7', '4', '8', '2']);
  const [toastMessage, setToastMessage] = useState('');
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationStepText, setSimulationStepText] = useState('');

  const toastTimerRef = useRef(null);
  const simIntervalRef = useRef(null);
  const stepIntervalRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('adi_theme', themeKey);
    localStorage.setItem('adi_pasaran', pasaran);
    localStorage.setItem('adi_metode', metode);
    localStorage.setItem('adi_digit_count', digitCount.toString());
    localStorage.setItem('adi_history', JSON.stringify(history));
  }, [themeKey, pasaran, metode, digitCount, history]);

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

  const generateDigitForMethod = (selectedMetode, currentHistory) => {
    if (selectedMetode === 'Frekuensi Tertinggi (Hot)') {
      const hotPool = [7, 4, 8, 9, 2];
      return Math.random() < 0.7 ? hotPool[Math.floor(Math.random() * hotPool.length)].toString() : Math.floor(Math.random() * 10).toString();
    } else if (selectedMetode === 'Numerologi Fengshui') {
      const fengshuiPool = [8, 9, 6, 3, 2];
      return Math.random() < 0.75 ? fengshuiPool[Math.floor(Math.random() * fengshuiPool.length)].toString() : Math.floor(Math.random() * 10).toString();
    } else if (selectedMetode === 'AI Neural Mesh') {
      const allDigits = currentHistory.flatMap(h => h.nomor.split('')).map(Number);
      return (allDigits.length > 0 && Math.random() < 0.65) ? allDigits[Math.floor(Math.random() * allDigits.length)].toString() : Math.floor(Math.random() * 10).toString();
    }
    return Math.floor(Math.random() * 10).toString();
  };

  const runSimulation = () => {
    if (isSimulating) return;
    setIsSimulating(true);

    const steps = ['Analisis Pola...', 'Kalkulasi Matriks...', 'Proses Prediksi...'];
    let stepIdx = 0;
    setSimulationStepText(steps[0]);

    stepIntervalRef.current = setInterval(() => {
      stepIdx = (stepIdx + 1) % steps.length;
      setSimulationStepText(steps[stepIdx]);
    }, 350);

    let counter = 0;
    simIntervalRef.current = setInterval(() => {
      setResultDigits(Array.from({ length: digitCount }, () => generateDigitForMethod(metode, history)));
      counter++;
      if (counter > 12) {
        clearInterval(simIntervalRef.current);
        clearInterval(stepIntervalRef.current);
        const finalDigits = Array.from({ length: digitCount }, () => generateDigitForMethod(metode, history));
        setResultDigits(finalDigits);

        const numStr = finalDigits.join('');
        const numSum = finalDigits.map(Number).reduce((a, b) => a + b, 0);
        const newRecord = {
          id: Date.now(),
          pasaran,
          tanggal: new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }),
          nomor: numStr,
          tipe: `${digitCount}D`,
          shio: SHIO_LIST[numSum % 12],
          ganjilGenap: numSum % 2 !== 0 ? 'Ganjil' : 'Genap',
          metode
        };
        setHistory(prev => [newRecord, ...prev]);
        setIsSimulating(false);
        showToast('Prediksi selesai dan tersimpan.');
      }
    }, 80);
  };

  const theme = THEMES[themeKey] || THEMES.dark;

  return (
    <AppContext.Provider value={{ activeTab, setActiveTab, themeKey, setThemeKey, theme, pasaran, setPasaran, metode, setMetode, digitCount, setDigitCount, history, setHistory, resultDigits, toastMessage, showToast, isSimulating, simulationStepText, runSimulation, copyToClipboard }}>
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
  const { activeTab, setActiveTab, themeKey, setThemeKey, theme, showToast } = useApp();
  const [showThemeMenu, setShowThemeMenu] = useState(false);

  return (
    <header className={`sticky top-0 z-40 ${theme.headerBg} backdrop-blur-md border-b ${theme.border}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl ${theme.bgAccent} flex items-center justify-center text-slate-950 shadow-lg`}>
            <Zap className="w-6 h-6 fill-slate-950" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-lg tracking-tight text-white">AdiPredictor <span className={theme.textAccent}>AI</span></h1>
              <span className={`text-[10px] uppercase ${theme.badgeBg} px-2 py-0.5 rounded-full font-mono border`}>v1.0 PROD</span>
            </div>
          </div>
        </div>

        <nav className={`hidden md:flex items-center gap-1 ${theme.innerBg} p-1.5 rounded-xl border ${theme.border}`}>
          {[
            { id: 'generator', label: 'Analisis AI', icon: Sparkles },
            { id: 'analytics', label: 'Statistik', icon: BarChart3 },
            { id: 'history', label: 'Riwayat', icon: HistoryIcon },
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

        <div className="flex items-center gap-2">
          <div className="relative">
            <button onClick={() => setShowThemeMenu(!showThemeMenu)} className={`p-2.5 rounded-xl text-xs ${theme.innerBg} border ${theme.border} text-slate-300 flex items-center gap-1.5`}>
              <Palette className={`w-4 h-4 ${theme.textAccent}`} />
              <span className="hidden sm:inline text-xs">{THEMES[themeKey]?.name}</span>
            </button>
            {showThemeMenu && (
              <div className={`absolute right-0 mt-2 w-48 ${theme.cardBg} border ${theme.border} rounded-xl p-2 z-50 space-y-1`}>
                {Object.values(THEMES).map((t) => (
                  <button key={t.id} onClick={() => { setThemeKey(t.id); setShowThemeMenu(false); showToast(`Tema: ${t.name}`); }} className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs text-slate-300 hover:bg-slate-800">
                    <span>{t.name}</span>
                    {themeKey === t.id && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

function DigitDisplay({ resultDigits, isSimulating, simulationStepText }) {
  const { theme, copyToClipboard } = useApp();
  return (
    <div className="py-8 flex flex-col items-center space-y-6">
      {isSimulating && <div className="font-mono text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full">{simulationStepText}</div>}
      <div className="flex gap-3 sm:gap-5">
        {resultDigits.map((digit, idx) => (
          <div key={idx} className={`w-16 h-20 sm:w-20 sm:h-24 bg-slate-900 border ${theme.borderLight} rounded-2xl flex items-center justify-center text-3xl sm:text-4xl font-mono font-bold ${theme.textAccent}`}>
            {digit}
          </div>
        ))}
      </div>
      <button onClick={() => copyToClipboard(resultDigits.join(''))} className="px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-2">
        <Copy className={`w-4 h-4 ${theme.textAccent}`} /> Salin ({resultDigits.join('')})
      </button>
    </div>
  );
}

function GeneratorPanel() {
  const { theme, pasaran, setPasaran, metode, setMetode, digitCount, setDigitCount, resultDigits, isSimulating, simulationStepText, runSimulation } = useApp();
  return (
    <div className="space-y-6">
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

          <div className="space-y-2">
            <label className="text-xs text-slate-400 font-medium">Format Digit</label>
            <div className="grid grid-cols-3 gap-2">
              {[2, 3, 4].map((d) => (
                <button key={d} onClick={() => setDigitCount(d)} className={`py-2 rounded-xl text-xs font-semibold border ${digitCount === d ? `${theme.bgAccent} text-slate-950` : `${theme.innerBg} border-slate-800 text-slate-400`}`}>
                  {d}D
                </button>
              ))}
            </div>
          </div>

          <button onClick={runSimulation} disabled={isSimulating} className={`w-full py-3.5 rounded-xl bg-gradient-to-r ${theme.btnGradient} font-bold text-sm shadow-lg flex items-center justify-center gap-2`}>
            <RefreshCw className={`w-5 h-5 ${isSimulating ? 'animate-spin' : ''}`} />
            {isSimulating ? 'Memproses...' : 'Proses Analisis Angka'}
          </button>
        </div>

        <div className={`lg:col-span-2 ${theme.cardBg} rounded-2xl border ${theme.border} p-6 flex flex-col justify-between shadow-xl space-y-6`}>
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <span className={`text-xs ${theme.textAccent} font-mono uppercase`}>{pasaran}</span>
              <h3 className="text-lg font-bold text-slate-100">Hasil Prediksi Output</h3>
            </div>
            <span className={`text-xs ${theme.innerBg} text-slate-300 border ${theme.border} px-3 py-1 rounded-full font-mono`}>Model: {metode}</span>
          </div>

          <DigitDisplay resultDigits={resultDigits} isSimulating={isSimulating} simulationStepText={simulationStepText} />
        </div>
      </div>
    </div>
  );
}

function AnalyticsPanel() {
  const { theme, history } = useApp();
  const digitCounts = Array(10).fill(0);
  history.forEach((item) => {
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

function HistoryPanel() {
  const { theme, history, setHistory, showToast, copyToClipboard } = useApp();
  return (
    <div className={`${theme.cardBg} rounded-2xl border ${theme.border} p-6 space-y-4 shadow-xl`}>
      <div className="flex justify-between items-center border-b border-slate-800 pb-4">
        <h3 className="text-lg font-bold text-slate-100">Riwayat Hasil Analisis</h3>
        <button onClick={() => { setHistory([]); showToast('Riwayat dibersihkan.'); }} className="px-3 py-1.5 bg-rose-500/10 text-rose-400 text-xs rounded-xl border border-rose-500/20">Hapus Riwayat</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className={`${theme.innerBg} text-slate-400 font-mono uppercase border-b border-slate-800`}>
            <tr>
              <th className="py-3 px-4">Tanggal</th>
              <th className="py-3 px-4">Pasaran</th>
              <th className="py-3 px-4">Hasil</th>
              <th className="py-3 px-4">Shio</th>
              <th className="py-3 px-4 text-right">Opsi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-medium">
            {history.map((row) => (
              <tr key={row.id}>
                <td className="py-3.5 px-4 text-slate-400">{row.tanggal}</td>
                <td className="py-3.5 px-4 text-slate-200">{row.pasaran}</td>
                <td className="py-3.5 px-4"><span className={`font-mono ${theme.textAccent} font-bold ${theme.innerBg} px-2.5 py-1 rounded-md border ${theme.border}`}>{row.nomor}</span></td>
                <td className="py-3.5 px-4 text-slate-300">{row.shio}</td>
                <td className="py-3.5 px-4 text-right">
                  <button onClick={() => copyToClipboard(row.nomor)} className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-400"><Copy className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
        { id: 'analytics', label: 'Statistik', icon: BarChart3 },
        { id: 'history', label: 'Riwayat', icon: HistoryIcon },
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

function MainContent() {
  const { activeTab, theme } = useApp();
  return (
    <div className={`min-h-screen ${theme.bg} text-slate-100 font-sans flex flex-col transition-colors duration-300`}>
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
