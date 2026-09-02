const fs = require('fs');

let code = fs.readFileSync('src/components/DailyManualJobLog.tsx', 'utf8');

// 1. Update imports
code = code.replace(
  `import {\n  Calendar,\n  Check,\n  Plus,\n  Trash2,\n  Edit3,\n  Save,\n  RotateCcw,\n  ArrowRight,\n  Briefcase\n} from 'lucide-react';`,
  `import {\n  Calendar,\n  Check,\n  Plus,\n  Trash2,\n  Edit3,\n  Save,\n  RotateCcw,\n  ArrowRight,\n  Briefcase,\n  ChevronRight,\n  ChevronLeft\n} from 'lucide-react';`
);

// If format was slightly different with different spacing
if (!code.includes('ChevronRight')) {
  code = code.replace(
    "Briefcase\n} from 'lucide-react';",
    "Briefcase,\n  ChevronRight,\n  ChevronLeft\n} from 'lucide-react';"
  );
}

// 2. Update props
code = code.replace(
  "  onSwitchToDetails?: () => void;\n}",
  "  onSwitchToDetails?: () => void;\n  onMonthChange?: (newMonth: string) => void;\n}"
);

code = code.replace(
  "  onSwitchToDetails\n}) => {",
  "  onSwitchToDetails,\n  onMonthChange\n}) => {"
);

// 3. Add helper fns
const helperFns = `
  const getPrevMonth = (mStr: string) => {
    const [y, m] = mStr.split('-').map(Number);
    let prevM = m - 1;
    let prevY = y;
    if (prevM === 0) {
      prevM = 12;
      prevY = y - 1;
    }
    return \`\${prevY}-\${String(prevM).padStart(2, '0')}\`;
  };

  const getNextMonth = (mStr: string) => {
    const [y, m] = mStr.split('-').map(Number);
    let nextM = m + 1;
    let nextY = y;
    if (nextM === 13) {
      nextM = 1;
      nextY = y + 1;
    }
    return \`\${nextY}-\${String(nextM).padStart(2, '0')}\`;
  };
`;

code = code.replace('  return (\n    <div className="space-y-6 animate-in fade-in duration-200">', helperFns + '\n  return (\n    <div className="space-y-6 animate-in fade-in duration-200">');

// 4. Update banner
const bannerOld = `            <div className="flex items-center gap-2">
              <span className="bg-emerald-500/30 text-emerald-100 text-[10px] font-black px-2.5 py-0.5 rounded-full border border-emerald-400/20">
                تسجيل الحضور والشغل اليومي
              </span>
              <span className="text-emerald-200 text-xs font-bold">
                {monthLabel}
              </span>
            </div>`;

const bannerNew = `            <div className="flex flex-wrap items-center gap-2 bg-emerald-800/60 p-1.5 px-3 rounded-2xl border border-emerald-400/30 w-fit">
              <div className="flex items-center gap-1.5">
                <span className="bg-amber-400 text-emerald-950 text-[10px] font-black px-2 py-0.5 rounded-lg shadow-sm">
                  الشهر الحالي المعروض:
                </span>
                <span className="text-white font-black text-xs sm:text-sm tracking-wide bg-emerald-950/60 px-2.5 py-0.5 rounded-lg border border-emerald-400/30 font-sans">
                  {monthLabel} ({selectedMonth})
                </span>
              </div>
              
              {onMonthChange && (
                <div className="flex items-center gap-1 bg-emerald-950/80 p-0.5 px-1 rounded-xl border border-emerald-400/40 mr-1">
                  <button
                    onClick={() => onMonthChange(getPrevMonth(selectedMonth))}
                    title="الشهر السابق"
                    className="p-1 text-white hover:bg-white/20 active:scale-95 rounded-lg transition-all flex items-center gap-0.5 text-[10px] font-bold px-2"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                    <span>السابق</span>
                  </button>
                  <div className="w-px h-3.5 bg-emerald-400/30" />
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => e.target.value && onMonthChange(e.target.value)}
                    className="bg-emerald-700/90 hover:bg-emerald-700 text-white text-[11px] font-black px-2 py-0.5 rounded-lg border border-emerald-400/30 cursor-pointer focus:ring-0"
                  />
                  <div className="w-px h-3.5 bg-emerald-400/30" />
                  <button
                    onClick={() => onMonthChange(getNextMonth(selectedMonth))}
                    title="الشهر التالي"
                    className="p-1 text-white hover:bg-white/20 active:scale-95 rounded-lg transition-all flex items-center gap-0.5 text-[10px] font-bold px-2"
                  >
                    <span>التالي</span>
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>`;

code = code.replace(bannerOld, bannerNew);

fs.writeFileSync('src/components/DailyManualJobLog.tsx', code, 'utf8');
console.log('DONE_DAILY_UPDATE');
