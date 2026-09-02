import React, { useState, useMemo, useEffect } from 'react';
import { Driver, JobRecord, DailyShift, JobItem } from '../types';
import { 
  Calendar, 
  Check, 
  Plus, 
  Trash2, 
  Edit3, 
  Save, 
  RotateCcw, 
  ArrowRight,
  Briefcase,
  ChevronRight,
  ChevronLeft
} from 'lucide-react';

interface DailyManualJobLogProps {
  selectedMonth: string; // YYYY-MM
  driver: Driver;
  jobRecord: JobRecord | null;
  onSaveJobRecord: (data: Partial<JobRecord>) => void;
  onSwitchToDetails?: () => void;
  onMonthChange?: (newMonth: string) => void;
}

export const DailyManualJobLog: React.FC<DailyManualJobLogProps> = ({
  selectedMonth,
  driver,
  jobRecord,
  onSaveJobRecord,
  onSwitchToDetails,
  onMonthChange
}) => {
  // Days calculation for selected month
  const { daysList, monthLabel } = useMemo(() => {
    const [yStr, mStr] = selectedMonth.split('-');
    const year = parseInt(yStr, 10) || new Date().getFullYear();
    const month = parseInt(mStr, 10) || (new Date().getMonth() + 1);
    const totalDays = new Date(year, month, 0).getDate();

    const arabicDays = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

    const list = [];
    for (let day = 1; day <= totalDays; day++) {
      const dateObj = new Date(year, month - 1, day);
      const dayOfWeek = dateObj.getDay();
      const dayName = arabicDays[dayOfWeek];
      const isFriday = dayOfWeek === 5;

      list.push({
        dayNumber: day,
        dayName,
        isFriday,
        dateStr: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      });
    }

    const monthName = new Intl.DateTimeFormat('ar-EG', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1));

    return { daysList: list, monthLabel: monthName };
  }, [selectedMonth]);

  // Initialize or derive dailyShifts
  const initialShifts = useMemo((): DailyShift[] => {
    if (jobRecord?.dailyShifts && Array.isArray(jobRecord.dailyShifts) && jobRecord.dailyShifts.length > 0) {
      return jobRecord.dailyShifts;
    }
    
    // Check if there are existing items in jobRecord to preserve name and price
    const firstItem = jobRecord?.items?.[0];
    const defaultName = firstItem?.description && firstItem.description.trim() !== '' ? firstItem.description : 'وردية أساسية';
    const defaultPrice = (typeof firstItem?.price === 'number' && firstItem.price > 0) ? firstItem.price : 700;

    return [
      {
        id: 'shift_main',
        name: defaultName,
        price: defaultPrice,
        days: {}
      }
    ];
  }, [jobRecord?.dailyShifts, jobRecord?.items]);

  const [shifts, setShifts] = useState<DailyShift[]>(initialShifts);
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState<number>(700);
  const [savedFeedback, setSavedFeedback] = useState(false);

  // Keep local shifts in sync if jobRecord updates from outside (e.g. from the Details/Accounts tab)
  useEffect(() => {
    if (jobRecord?.dailyShifts && Array.isArray(jobRecord.dailyShifts) && jobRecord.dailyShifts.length > 0) {
      setShifts(jobRecord.dailyShifts);
    } else if (jobRecord?.items && Array.isArray(jobRecord.items) && jobRecord.items.length > 0) {
      const firstItem = jobRecord.items[0];
      const defaultName = firstItem.description && firstItem.description.trim() !== '' ? firstItem.description : 'وردية أساسية';
      const defaultPrice = (typeof firstItem.price === 'number' && firstItem.price >= 0) ? firstItem.price : 700;

      setShifts(prev => {
        if (prev.length === 1 && prev[0].id === 'shift_main') {
          return [{
            ...prev[0],
            name: defaultName,
            price: defaultPrice
          }];
        }
        return prev;
      });
    }
  }, [jobRecord?.dailyShifts, jobRecord?.items]);

  // Sync to JobRecord and calculate items
  const syncToJobRecord = (newShifts: DailyShift[]) => {
    setShifts(newShifts);

    // Calculate items for each shift
    const shiftItems: JobItem[] = newShifts.map(s => {
      let goCount = 0;
      let returnCount = 0;

      Object.values(s.days || {}).forEach(d => {
        if (d?.go) goCount++;
        if (d?.return) returnCount++;
      });

      const totalRounds = (goCount * 0.5) + (returnCount * 0.5);

      return {
        description: s.name,
        rounds: totalRounds,
        price: s.price
      };
    });

    // Also preserve non-shift items if any exist
    const existingItems = jobRecord?.items || [];
    const shiftNames = new Set(newShifts.map(s => s.name));
    const oldShiftNames = new Set(shifts.map(s => s.name));
    
    const otherItems = existingItems.filter(item => 
      !shiftNames.has(item.description) && !oldShiftNames.has(item.description)
    );

    const mergedItems = [...shiftItems, ...otherItems];

    onSaveJobRecord({
      dailyShifts: newShifts,
      items: mergedItems
    });

    setSavedFeedback(true);
    setTimeout(() => setSavedFeedback(false), 2000);
  };

  // Toggle single checkbox
  const handleToggle = (shiftId: string, dayNum: number, type: 'go' | 'return') => {
    const updated = shifts.map(s => {
      if (s.id !== shiftId) return s;
      const currentDays = { ...s.days };
      const dayData = currentDays[dayNum] || { go: false, return: false };
      
      currentDays[dayNum] = {
        ...dayData,
        [type]: !dayData[type]
      };

      return { ...s, days: currentDays };
    });

    syncToJobRecord(updated);
  };

  // Clear all checks for shift
  const handleClearShift = (shiftId: string) => {
    const updated = shifts.map(s => {
      if (s.id !== shiftId) return s;
      return { ...s, days: {} };
    });

    syncToJobRecord(updated);
  };

  // Start editing shift name/price
  const startEditingShift = (shift: DailyShift) => {
    setEditingShiftId(shift.id);
    setEditName(shift.name);
    setEditPrice(shift.price);
  };

  // Save shift name/price
  const saveShiftInfo = (shiftId: string) => {
    const trimmedName = editName.trim() || 'وردية';
    const validPrice = isNaN(editPrice) || editPrice < 0 ? 0 : editPrice;

    const updated = shifts.map(s => {
      if (s.id !== shiftId) return s;
      return {
        ...s,
        name: trimmedName,
        price: validPrice
      };
    });

    setEditingShiftId(null);
    syncToJobRecord(updated);
  };

  // Add new shift
  const handleAddShift = () => {
    const nextNum = shifts.length + 1;
    const newShift: DailyShift = {
      id: `shift_${Date.now()}`,
      name: `وردية إضافية ${nextNum}`,
      price: 700,
      days: {}
    };

    const updated = [...shifts, newShift];
    syncToJobRecord(updated);
    startEditingShift(newShift);
  };

  // Remove a shift
  const handleRemoveShift = (shiftId: string) => {
    if (shifts.length <= 1) {
      // Don't remove the last shift, just reset it
      handleClearShift(shiftId);
      return;
    }
    const updated = shifts.filter(s => s.id !== shiftId);
    syncToJobRecord(updated);
  };

  // Summary statistics
  const stats = useMemo(() => {
    let totalWorkDays = 0;
    let grandTotalRounds = 0;
    let grandTotalAmount = 0;

    const dayHasWork = new Set<number>();

    shifts.forEach(s => {
      let sRounds = 0;
      Object.entries(s.days || {}).forEach(([dayStr, dayVal]) => {
        const d = dayVal as { go?: boolean; return?: boolean } | undefined;
        const dNum = parseInt(dayStr, 10);
        if (d?.go || d?.return) {
          dayHasWork.add(dNum);
        }
        if (d?.go) sRounds += 0.5;
        if (d?.return) sRounds += 0.5;
      });

      grandTotalRounds += sRounds;
      grandTotalAmount += sRounds * s.price;
    });

    totalWorkDays = dayHasWork.size;

    return {
      totalWorkDays,
      grandTotalRounds,
      grandTotalAmount
    };
  }, [shifts]);

  const getPrevMonth = (mStr: string) => {
    const [y, m] = mStr.split('-').map(Number);
    let prevM = m - 1;
    let prevY = y;
    if (prevM === 0) {
      prevM = 12;
      prevY = y - 1;
    }
    return `${prevY}-${String(prevM).padStart(2, '0')}`;
  };

  const getNextMonth = (mStr: string) => {
    const [y, m] = mStr.split('-').map(Number);
    let nextM = m + 1;
    let nextY = y;
    if (nextM === 13) {
      nextM = 1;
      nextY = y + 1;
    }
    return `${nextY}-${String(nextM).padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Banner & Driver Overview */}
      <div className="bg-gradient-to-l from-emerald-700 via-emerald-600 to-teal-700 rounded-3xl p-5 sm:p-6 text-white shadow-xl shadow-emerald-900/10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="bg-emerald-500/30 text-emerald-100 text-[10px] font-black px-2.5 py-1 rounded-full border border-emerald-400/20">
                تسجيل الحضور والشغل اليومي
              </span>

              {/* Prominent Month Badge & Switcher */}
              <div className="flex items-center gap-1.5 bg-emerald-950/70 border border-emerald-400/30 p-1 px-2.5 rounded-xl shadow-inner">
                <span className="text-amber-300 text-xs font-black">
                  شهر: {monthLabel}
                </span>

                {onMonthChange && (
                  <div className="flex items-center gap-1 mr-1 border-r border-emerald-400/20 pr-1.5">
                    <button
                      type="button"
                      onClick={() => onMonthChange(getPrevMonth(selectedMonth))}
                      title="الشهر السابق"
                      className="p-1 text-white hover:bg-white/20 active:scale-95 rounded-lg transition-all flex items-center gap-0.5 text-[10px] font-bold px-1.5"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">السابق</span>
                    </button>
                    <input
                      type="month"
                      value={selectedMonth}
                      onChange={(e) => e.target.value && onMonthChange(e.target.value)}
                      className="bg-emerald-800 hover:bg-emerald-700 text-white text-[11px] font-black px-1.5 py-0.5 rounded-md border border-emerald-400/30 cursor-pointer focus:ring-0"
                    />
                    <button
                      type="button"
                      onClick={() => onMonthChange(getNextMonth(selectedMonth))}
                      title="الشهر التالي"
                      className="p-1 text-white hover:bg-white/20 active:scale-95 rounded-lg transition-all flex items-center gap-0.5 text-[10px] font-bold px-1.5"
                    >
                      <span className="hidden sm:inline">التالي</span>
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
            <h2 className="text-xl sm:text-2xl font-black flex items-center gap-2">
              <span>جدول ورديات: {driver.name}</span>
              <span className="text-xs bg-white/20 px-2 py-0.5 rounded-lg text-emerald-100 font-mono">
                كود {driver.code}
              </span>
            </h2>
            <p className="text-xs text-emerald-100 font-medium">
              اضغط على مربعات الذهاب والعودة لتسجيل الشغل اليومي — يتم احتساب إجمالي الورديات والمبالغ وتحديث بيان الشهر تلقائياً.
            </p>
          </div>

          {/* Quick Stats in Banner */}
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <div className="bg-white/10 backdrop-blur-md px-3.5 py-2 rounded-2xl border border-white/10 text-center min-w-[85px]">
              <span className="text-[10px] text-emerald-200 block font-bold">أيام العمل</span>
              <span className="text-base sm:text-lg font-black">{stats.totalWorkDays} <span className="text-[10px] font-normal">يوم</span></span>
            </div>
            <div className="bg-white/10 backdrop-blur-md px-3.5 py-2 rounded-2xl border border-white/10 text-center min-w-[85px]">
              <span className="text-[10px] text-emerald-200 block font-bold">إجمالي الورديات</span>
              <span className="text-base sm:text-lg font-black text-amber-300">{stats.grandTotalRounds} <span className="text-[10px] font-normal">وردية</span></span>
            </div>
            <div className="bg-white text-emerald-800 px-4 py-2 rounded-2xl shadow-lg text-center min-w-[100px]">
              <span className="text-[10px] text-emerald-600 block font-bold">إجمالي المبلغ</span>
              <span className="text-base sm:text-lg font-black">{stats.grandTotalAmount.toLocaleString()} <span className="text-[10px] font-normal">ج.م</span></span>
            </div>
          </div>
        </div>

        {/* Sync status indicator */}
        <div className="mt-4 pt-3 border-t border-emerald-500/30 flex items-center justify-between text-xs flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
            </span>
            <span className="font-bold text-emerald-100 text-[11px]">
              {savedFeedback ? '✓ تم التحديث والحفظ التلقائي في بيان الشهر' : 'متزامن لحظياً مع صفحة الحسابات'}
            </span>
          </div>

          {onSwitchToDetails && (
            <button
              onClick={onSwitchToDetails}
              className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 active:scale-95 text-white px-3 py-1 rounded-xl text-[11px] font-black transition-all"
            >
              <span>الانتقال لبيان الشهر والحسابات</span>
              <ArrowRight className="w-3.5 h-3.5 rotate-180" />
            </button>
          )}
        </div>
      </div>

      {/* Shifts Configuration & Quick Fill Bar */}
      <div className="space-y-4">
        {shifts.map((shift, shiftIndex) => {
          const isEditing = editingShiftId === shift.id;
          
          let sGo = 0;
          let sRet = 0;
          Object.values(shift.days || {}).forEach((dayVal) => {
            const d = dayVal as { go?: boolean; return?: boolean } | undefined;
            if (d?.go) sGo++;
            if (d?.return) sRet++;
          });
          const sRounds = (sGo * 0.5) + (sRet * 0.5);
          const sTotal = sRounds * shift.price;

          return (
            <div 
              key={shift.id} 
              className="bg-white rounded-3xl p-4 sm:p-5 border border-zinc-200/80 shadow-sm space-y-4"
            >
              {/* Shift Controls Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-100">
                <div className="flex items-center gap-3 flex-wrap">
                  {isEditing ? (
                    <div className="flex items-center gap-2 bg-zinc-50 p-2 rounded-2xl border border-emerald-300 flex-wrap">
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-zinc-400">اسم الوردية:</label>
                        <input 
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder="مثال: وردية أساسية"
                          className="text-xs font-bold bg-white border border-zinc-200 rounded-xl px-2.5 py-1.5 focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-zinc-400">سعر الوردية (ج.م):</label>
                        <input 
                          type="number"
                          value={editPrice}
                          onChange={(e) => setEditPrice(parseFloat(e.target.value) || 0)}
                          placeholder="700"
                          className="text-xs font-bold bg-white border border-zinc-200 rounded-xl px-2.5 py-1.5 w-24 focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                      <button
                        onClick={() => saveShiftInfo(shift.id)}
                        className="self-end mb-0.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1 shadow-sm transition-all"
                      >
                        <Save className="w-3.5 h-3.5" />
                        حفظ
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-2 rounded-2xl">
                        <Briefcase className="w-5 h-5 text-emerald-600" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-base font-black text-zinc-800">{shift.name}</h4>
                          <button
                            onClick={() => startEditingShift(shift)}
                            className="text-zinc-400 hover:text-emerald-600 p-1 rounded-lg hover:bg-emerald-50 transition-colors"
                            title="تعديل اسم الوردية والسعر"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          {shifts.length > 1 && (
                            <button
                              onClick={() => handleRemoveShift(shift.id)}
                              className="text-zinc-300 hover:text-red-500 p-1 rounded-lg hover:bg-red-50 transition-colors"
                              title="حذف هذه الوردية"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs font-bold text-zinc-500">
                          <span className="text-emerald-600 font-mono bg-emerald-50 px-2 py-0.5 rounded-md font-black">
                            سعر الوردية: {shift.price.toLocaleString()} ج.م
                          </span>
                          <span>•</span>
                          <span>المسجل: {sRounds} وردية ({sTotal.toLocaleString()} ج.م)</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    onClick={() => handleClearShift(shift.id)}
                    className="bg-zinc-100 hover:bg-rose-50 hover:text-rose-600 text-zinc-500 text-xs font-bold px-3 py-1.5 rounded-xl transition-colors flex items-center gap-1.5"
                    title="تفريغ التحديد لهذه الوردية للبدء من جديد"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>مسح التحديد</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {/* Add Another Shift Button */}
        <div className="flex justify-end">
          <button
            onClick={handleAddShift}
            className="flex items-center gap-2 text-xs font-black bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200 px-4 py-2 rounded-2xl shadow-sm hover:shadow transition-all active:scale-95"
          >
            <Plus className="w-4 h-4 text-emerald-600" />
            <span>إضافة وردية إضافية لليوم</span>
          </button>
        </div>
      </div>

      {/* Main Attendance Table (Matching Screenshot Layout) */}
      <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse" dir="rtl">
            {/* Table Header */}
            <thead>
              <tr className="bg-zinc-50/90 border-b border-zinc-200 text-zinc-700 text-xs">
                <th className="py-3 px-4 font-black w-48 text-right">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-zinc-400" />
                    <span>التاريخ</span>
                  </div>
                </th>

                {/* Columns for each shift */}
                {shifts.map((shift) => (
                  <th 
                    key={shift.id} 
                    className="py-2 px-4 text-center border-r border-zinc-200 bg-sky-50/40"
                    colSpan={2}
                  >
                    <div className="flex flex-col items-center justify-center">
                      <div className="flex items-center gap-1">
                        <span className="font-black text-sky-900 text-xs sm:text-sm">{shift.name}</span>
                        <button
                          onClick={() => startEditingShift(shift)}
                          className="text-sky-600 hover:text-sky-800 p-0.5"
                          title="تعديل"
                        >
                          <Edit3 className="w-3 h-3" />
                        </button>
                      </div>
                      <span className="text-[10px] font-bold text-sky-700 bg-sky-100/70 px-2 py-0.5 rounded-full mt-0.5">
                        {shift.price.toLocaleString()} ج.م
                      </span>
                    </div>
                  </th>
                ))}
              </tr>

              {/* Subheader: ذهاب / عودة for each shift */}
              <tr className="bg-zinc-100/70 border-b border-zinc-200 text-[11px] font-black text-zinc-500">
                <th className="py-2 px-4 text-right text-zinc-400 font-bold text-[10px]">
                  اليوم والرقم
                </th>
                {shifts.map((shift) => (
                  <React.Fragment key={`sub-${shift.id}`}>
                    <th className="py-1.5 px-3 text-center border-r border-zinc-200 font-black text-sky-800 bg-sky-50/20 w-24">
                      ذهاب
                    </th>
                    <th className="py-1.5 px-3 text-center border-r border-zinc-100 font-black text-sky-800 bg-sky-50/20 w-24">
                      عودة
                    </th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>

            {/* Table Body (Days of Month) */}
            <tbody className="divide-y divide-zinc-100 text-xs">
              {daysList.map((dayItem) => {
                const { dayNumber, dayName, isFriday } = dayItem;

                return (
                  <tr 
                    key={dayNumber}
                    className={`transition-colors hover:bg-zinc-50/80 ${
                      isFriday ? 'bg-rose-50/60 font-bold text-rose-800' : 'text-zinc-800'
                    }`}
                  >
                    {/* Day Column */}
                    <td className="py-3 px-4 font-bold">
                      <div className="flex items-center gap-2">
                        <span className={`inline-block w-2 h-2 rounded-full ${isFriday ? 'bg-rose-400' : 'bg-emerald-400'}`} />
                        <span className={isFriday ? 'text-rose-600 font-black' : 'text-zinc-800 font-bold'}>
                          {dayName} {dayNumber}
                        </span>
                        {isFriday && (
                          <span className="text-[9px] bg-rose-100 text-rose-700 px-1.5 py-0.2 rounded font-black mr-1">
                            جمعة
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Shift Checkboxes */}
                    {shifts.map((shift) => {
                      const dayData = shift.days?.[dayNumber] || { go: false, return: false };
                      const hasGo = Boolean(dayData.go);
                      const hasReturn = Boolean(dayData.return);

                      return (
                        <React.Fragment key={`cell-${shift.id}-${dayNumber}`}>
                          {/* ذهاب */}
                          <td className="py-2 px-3 text-center border-r border-zinc-200">
                            <button
                              type="button"
                              onClick={() => handleToggle(shift.id, dayNumber, 'go')}
                              aria-label={`ذهاب يوم ${dayNumber}`}
                              className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center transition-all mx-auto ${
                                hasGo 
                                  ? 'bg-[#0284c7] hover:bg-[#0369a1] text-white shadow-sm scale-100 active:scale-90 ring-2 ring-[#0284c7]/30' 
                                  : 'bg-white hover:bg-zinc-100 border-2 border-zinc-300 hover:border-zinc-400 text-transparent active:scale-95'
                              }`}
                            >
                              <Check className={`w-5 h-5 stroke-[3.5] ${hasGo ? 'opacity-100' : 'opacity-0'}`} />
                            </button>
                          </td>

                          {/* عودة */}
                          <td className="py-2 px-3 text-center border-r border-zinc-100">
                            <button
                              type="button"
                              onClick={() => handleToggle(shift.id, dayNumber, 'return')}
                              aria-label={`عودة يوم ${dayNumber}`}
                              className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center transition-all mx-auto ${
                                hasReturn 
                                  ? 'bg-[#0284c7] hover:bg-[#0369a1] text-white shadow-sm scale-100 active:scale-90 ring-2 ring-[#0284c7]/30' 
                                  : 'bg-white hover:bg-zinc-100 border-2 border-zinc-300 hover:border-zinc-400 text-transparent active:scale-95'
                              }`}
                            >
                              <Check className={`w-5 h-5 stroke-[3.5] ${hasReturn ? 'opacity-100' : 'opacity-0'}`} />
                            </button>
                          </td>
                        </React.Fragment>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>

            {/* Table Footer Totals */}
            <tfoot>
              <tr className="bg-zinc-900 text-white font-black text-xs border-t-2 border-zinc-800">
                <td className="py-4 px-4">
                  <span>الإجمالي الشهري ({monthLabel})</span>
                </td>
                {shifts.map((shift) => {
                  let sGo = 0;
                  let sRet = 0;
                  Object.values(shift.days || {}).forEach((dayVal) => {
                    const d = dayVal as { go?: boolean; return?: boolean } | undefined;
                    if (d?.go) sGo++;
                    if (d?.return) sRet++;
                  });
                  const sRounds = (sGo * 0.5) + (sRet * 0.5);
                  const sTotal = sRounds * shift.price;

                  return (
                    <React.Fragment key={`foot-${shift.id}`}>
                      <td className="py-4 px-2 text-center border-r border-zinc-800">
                        <span className="text-[10px] text-zinc-400 block font-normal">ذهاب</span>
                        <span className="font-mono text-emerald-400">{sGo}</span>
                      </td>
                      <td className="py-4 px-2 text-center border-r border-zinc-800">
                        <span className="text-[10px] text-zinc-400 block font-normal">عودة</span>
                        <span className="font-mono text-emerald-400">{sRet}</span>
                      </td>
                    </React.Fragment>
                  );
                })}
              </tr>

              <tr className="bg-emerald-800 text-white font-black text-sm">
                <td colSpan={shifts.length * 2 + 1} className="py-3.5 px-4 text-right">
                  <div className="flex items-center justify-between">
                    <span className="text-emerald-200 text-xs font-bold">
                      إجمالي مستحقات الشغل الشهري المسمعة في الحسابات:
                    </span>
                    <span className="text-xl font-black text-amber-300 font-mono">
                      {stats.grandTotalAmount.toLocaleString()} ج.م
                    </span>
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};
