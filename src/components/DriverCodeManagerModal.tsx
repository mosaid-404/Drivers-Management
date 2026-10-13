import React, { useState, useMemo, useEffect } from 'react';
import { 
  X, 
  Search, 
  Hash, 
  AlertTriangle, 
  CheckCircle2, 
  ArrowUp, 
  ArrowDown, 
  Wand2, 
  Save, 
  RefreshCw, 
  Filter, 
  Building2, 
  Sparkles,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Driver } from '../types';

interface DriverCodeManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  drivers: Driver[];
  userId: string;
  onSuccess?: (msg: string) => void;
}

interface EditableDriverItem {
  id: string;
  name: string;
  code: string;
  originalCode: string;
  factory: string;
  route: string;
  status: 'active' | 'retired';
}

export function DriverCodeManagerModal({
  isOpen,
  onClose,
  drivers,
  userId,
  onSuccess
}: DriverCodeManagerModalProps) {
  const [items, setItems] = useState<EditableDriverItem[]>([]);
  const [factoryFilter, setFactoryFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'retired'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showDuplicatesOnly, setShowDuplicatesOnly] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Initialize or re-sync when modal opens or drivers list updates
  useEffect(() => {
    if (isOpen) {
      // Sort drivers by factory first, then by code numerically
      const sorted = [...drivers].sort((a, b) => {
        const facA = (a.factory || '').trim();
        const facB = (b.factory || '').trim();
        if (facA !== facB) {
          return facA.localeCompare(facB, 'ar');
        }
        return (a.code || '').localeCompare(b.code || '', undefined, { numeric: true });
      });

      setItems(
        sorted.map(d => ({
          id: d.id,
          name: d.name,
          code: d.code || '',
          originalCode: d.code || '',
          factory: d.factory || '',
          route: d.route || '',
          status: d.status
        }))
      );
      setFeedbackMessage(null);
    }
  }, [isOpen, drivers]);

  // Map codes to count and list of drivers who share it
  const codeFrequencyMap = useMemo(() => {
    const map = new Map<string, { count: number; driverNames: string[]; driverIds: string[] }>();
    items.forEach(item => {
      const trimmed = item.code.trim();
      if (!trimmed) return;
      if (!map.has(trimmed)) {
        map.set(trimmed, { count: 0, driverNames: [], driverIds: [] });
      }
      const entry = map.get(trimmed)!;
      entry.count += 1;
      entry.driverNames.push(item.name);
      entry.driverIds.push(item.id);
    });
    return map;
  }, [items]);

  // Set of duplicate codes
  const duplicateCodesSet = useMemo(() => {
    const set = new Set<string>();
    codeFrequencyMap.forEach((entry, code) => {
      if (entry.count > 1) {
        set.add(code);
      }
    });
    return set;
  }, [codeFrequencyMap]);

  // Total drivers who have a duplicate code
  const duplicateDriversCount = useMemo(() => {
    return items.filter(i => duplicateCodesSet.has(i.code.trim())).length;
  }, [items, duplicateCodesSet]);

  // Count of items whose code changed from original
  const modifiedCount = useMemo(() => {
    return items.filter(i => i.code.trim() !== i.originalCode.trim()).length;
  }, [items]);

  // Available unique factories
  const uniqueFactories = useMemo(() => {
    return Array.from(new Set(items.map(i => i.factory.trim()))).filter(Boolean).sort();
  }, [items]);

  // Find next lowest unused positive integer code
  const getNextAvailableCode = (existingItems: EditableDriverItem[]): string => {
    const usedCodes = new Set(
      existingItems
        .map(i => parseInt(i.code.trim(), 10))
        .filter(n => !isNaN(n) && n > 0)
    );
    let candidate = 1;
    while (usedCodes.has(candidate)) {
      candidate++;
    }
    return candidate.toString();
  };

  // Filtered list
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      // Duplicate filter
      if (showDuplicatesOnly && !duplicateCodesSet.has(item.code.trim())) {
        return false;
      }
      // Factory filter
      if (factoryFilter && item.factory !== factoryFilter) {
        return false;
      }
      // Status filter
      if (statusFilter !== 'all' && item.status !== statusFilter) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = item.name.toLowerCase().includes(q);
        const matchesCode = item.code.toLowerCase().includes(q);
        const matchesFactory = item.factory.toLowerCase().includes(q);
        const matchesRoute = item.route.toLowerCase().includes(q);
        if (!matchesName && !matchesCode && !matchesFactory && !matchesRoute) {
          return false;
        }
      }
      return true;
    });
  }, [items, showDuplicatesOnly, duplicateCodesSet, factoryFilter, statusFilter, searchQuery]);

  // Update a single driver's code in local state
  const handleCodeChange = (id: string, newCode: string) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, code: newCode } : item));
  };

  // Suggest a free code for a specific driver
  const handleAutoSuggestCode = (id: string) => {
    const nextCode = getNextAvailableCode(items.filter(i => i.id !== id));
    handleCodeChange(id, nextCode);
  };

  // Move driver Up / Down inside the list (within their factory or visible list)
  const handleMove = (id: string, direction: 'up' | 'down') => {
    setItems(prev => {
      const idx = prev.findIndex(i => i.id === id);
      if (idx === -1) return prev;
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;

      const newArr = [...prev];
      const temp = newArr[idx];
      newArr[idx] = newArr[targetIdx];
      newArr[targetIdx] = temp;
      return newArr;
    });
  };

  // Automatically resolve all duplicates by assigning unique sequential numbers to duplicates
  const handleAutoResolveAllDuplicates = () => {
    const usedCodes = new Set<string>();
    let candidateNum = 1;

    // First collect all codes from items that will keep their unique code
    items.forEach(item => {
      const c = item.code.trim();
      if (c && !duplicateCodesSet.has(c)) {
        usedCodes.add(c);
      }
    });

    // For duplicates, let the first one keep it, and give new ones to the rest
    const seenDuplicates = new Set<string>();
    const updated = items.map(item => {
      const c = item.code.trim();
      if (!c) {
        // Empty code -> assign next free integer
        while (usedCodes.has(candidateNum.toString())) {
          candidateNum++;
        }
        const assigned = candidateNum.toString();
        usedCodes.add(assigned);
        return { ...item, code: assigned };
      }

      if (duplicateCodesSet.has(c)) {
        if (!seenDuplicates.has(c)) {
          // First driver keeps the code
          seenDuplicates.add(c);
          usedCodes.add(c);
          return item;
        } else {
          // Subsequent driver gets next unique code
          while (usedCodes.has(candidateNum.toString())) {
            candidateNum++;
          }
          const assigned = candidateNum.toString();
          usedCodes.add(assigned);
          return { ...item, code: assigned };
        }
      }

      return item;
    });

    setItems(updated);
    setFeedbackMessage({
      type: 'success',
      text: 'تم حل جميع التكرارات وتوليد أكواد فريدة تلقائياً! تذكر الضغط على "حفظ التغييرات" لتأكيدها.'
    });
  };

  // Renumber filtered factory or all drivers sequentially
  const handleRenumberSequentially = (target: 'current_filter' | 'all') => {
    const isFiltered = target === 'current_filter' && factoryFilter;
    const targetFactory = isFiltered ? factoryFilter : null;

    let counter = 1;
    if (isFiltered) {
      // Find starting code or start after other factories
      const otherFactoryMaxCode = items
        .filter(i => i.factory !== targetFactory)
        .map(i => parseInt(i.code.trim(), 10))
        .filter(n => !isNaN(n) && n > 0);
      
      // If user wants, they can start from 1 or sequentially
      counter = otherFactoryMaxCode.length > 0 ? Math.max(...otherFactoryMaxCode) + 1 : 1;
    }

    setItems(prev => {
      return prev.map(item => {
        if (targetFactory && item.factory !== targetFactory) {
          return item;
        }
        const newCode = counter.toString();
        counter++;
        return { ...item, code: newCode };
      });
    });

    setFeedbackMessage({
      type: 'success',
      text: targetFactory 
        ? `تمت إعادة ترقيم سائقي مصنع (${targetFactory}) تسلسلياً بنجاح! اضغط "حفظ التغييرات".`
        : 'تمت إعادة ترقيم جميع السائقين تسلسلياً (1, 2, 3...) بنجاح! اضغط "حفظ التغييرات".'
    });
  };

  // Save all modified codes to Firestore
  const handleSaveAll = async () => {
    const changedItems = items.filter(i => i.code.trim() !== i.originalCode.trim());
    if (changedItems.length === 0) {
      setFeedbackMessage({ type: 'info', text: 'لم يتم إجراء أي تعديلات على الأكواد.' });
      return;
    }

    // Check if duplicate codes still exist among the changed items or whole list
    if (duplicateCodesSet.size > 0) {
      const confirmSaveWithDuplicates = window.confirm(
        `تنبيه: لا يزال هناك ${duplicateDriversCount} سائق بأكواد مكررة.\nهل أنت متأكد من الحفظ رغم وجود التكرار؟`
      );
      if (!confirmSaveWithDuplicates) return;
    }

    setIsSaving(true);
    setFeedbackMessage(null);

    try {
      // Firestore batches support up to 500 ops per batch
      const BATCH_SIZE = 400;
      for (let i = 0; i < changedItems.length; i += BATCH_SIZE) {
        const batchChunk = changedItems.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);

        batchChunk.forEach(item => {
          const docRef = doc(db, 'drivers', item.id);
          batch.update(docRef, {
            code: item.code.trim(),
            updatedAt: serverTimestamp()
          });
        });

        await batch.commit();
      }

      // Update originalCodes in local state
      setItems(prev => prev.map(i => ({ ...i, originalCode: i.code.trim() })));
      setIsSaving(false);
      setFeedbackMessage({
        type: 'success',
        text: `تم حفظ وتحديث ${changedItems.length} كود سائق بنجاح في السحابة!`
      });

      if (onSuccess) {
        onSuccess(`تم حفظ ${changedItems.length} كود سائق بنجاح`);
      }
    } catch (err: any) {
      console.error('Error updating driver codes:', err);
      setIsSaving(false);
      setFeedbackMessage({
        type: 'error',
        text: 'حدث خطأ أثناء حفظ الأكواد في قاعدة البيانات. يرجى المحاولة مرة أخرى.'
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto font-sans" dir="rtl">
      {/* Backdrop */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-zinc-950/65 backdrop-blur-md"
      />

      {/* Modal Dialog */}
      <motion.div 
        initial={{ scale: 0.94, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.94, opacity: 0, y: 16 }}
        transition={{ duration: 0.2 }}
        className="bg-white rounded-3xl sm:rounded-[36px] w-full max-w-4xl p-4 sm:p-7 relative z-10 shadow-2xl my-auto flex flex-col max-h-[92vh] border border-zinc-100"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-500/20">
              <Hash className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-xl font-black text-zinc-900">إدارة وتعديل أكواد السائقين</h2>
                <span className="text-[10px] sm:text-xs font-bold bg-zinc-100 text-zinc-600 px-2.5 py-0.5 rounded-full">
                  {items.length} سائق
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-zinc-500 font-medium mt-0.5">
                تعديل الأكواد المكررة، ترتيب السائقين داخل المصانع، وإعادة الترقيم التسلسلي بسهولة
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 sm:p-2.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-full transition-colors"
            title="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status & Alerts Bar */}
        <div className="mt-4 shrink-0 space-y-2">
          {duplicateDriversCount > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 sm:p-3.5 bg-amber-50/90 border border-amber-200/90 rounded-2xl">
              <div className="flex items-center gap-2 text-amber-900 text-xs sm:text-sm font-bold">
                <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600 shrink-0" />
                <span>
                  يوجد <strong className="font-black text-amber-800 underline decoration-amber-400">{duplicateDriversCount} سائق</strong> يشتركون في نفس الأكواد!
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowDuplicatesOnly(prev => !prev)}
                  className={`text-[11px] sm:text-xs font-black px-3 py-1.5 rounded-xl border transition-all ${
                    showDuplicatesOnly 
                      ? 'bg-amber-600 text-white border-amber-600 shadow-sm' 
                      : 'bg-white text-amber-800 border-amber-300 hover:bg-amber-100/60'
                  }`}
                >
                  {showDuplicatesOnly ? 'عرض كل السائقين' : 'فلترة الأكواد المكررة فقط'}
                </button>
                <button
                  type="button"
                  onClick={handleAutoResolveAllDuplicates}
                  className="text-[11px] sm:text-xs font-black px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white transition-all shadow-xs flex items-center gap-1.5"
                  title="تخصيص أكواد فريدة لجميع السائقين المكررين تلقائياً"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>حل كل التكرارات تلقائياً</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 p-2.5 sm:p-3 bg-emerald-50/80 border border-emerald-200/70 rounded-2xl text-emerald-800 text-xs font-bold">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>ممتاز! جميع أكواد السائقين فريدة ولا توجد أي أكواد مكررة حالياً.</span>
            </div>
          )}

          {feedbackMessage && (
            <div className={`p-3 rounded-2xl text-xs sm:text-sm font-bold flex items-center justify-between border ${
              feedbackMessage.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
              feedbackMessage.type === 'error' ? 'bg-rose-50 text-rose-800 border-rose-200' :
              'bg-blue-50 text-blue-800 border-blue-200'
            }`}>
              <div className="flex items-center gap-2">
                {feedbackMessage.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                {feedbackMessage.type === 'error' && <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />}
                {feedbackMessage.type === 'info' && <Info className="w-4 h-4 text-blue-600 shrink-0" />}
                <span>{feedbackMessage.text}</span>
              </div>
              <button onClick={() => setFeedbackMessage(null)} className="p-1 hover:bg-black/5 rounded-lg">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Controls, Filters & Bulk Tools */}
        <div className="mt-3 shrink-0 bg-zinc-50/80 p-3 rounded-2xl border border-zinc-200/80 space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
            {/* Search */}
            <div className="sm:col-span-4 relative">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="بحث بالسائق أو الكود أو المصنع..."
                className="w-full bg-white border border-zinc-200 rounded-xl pr-8 pl-3 py-1.5 text-xs font-bold text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              />
            </div>

            {/* Factory Filter */}
            <div className="sm:col-span-3">
              <select
                value={factoryFilter}
                onChange={e => setFactoryFilter(e.target.value)}
                className="w-full bg-white border border-zinc-200 rounded-xl px-2.5 py-1.5 text-xs font-bold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              >
                <option value="">كل المصانع ({uniqueFactories.length})</option>
                {uniqueFactories.map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>

            {/* Status Filter */}
            <div className="sm:col-span-2">
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as any)}
                className="w-full bg-white border border-zinc-200 rounded-xl px-2.5 py-1.5 text-xs font-bold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              >
                <option value="all">كل الحالات</option>
                <option value="active">نشط فقط</option>
                <option value="retired">متوقف فقط</option>
              </select>
            </div>

            {/* Renumbering Actions */}
            <div className="sm:col-span-3 flex items-center gap-1.5">
              {factoryFilter ? (
                <button
                  type="button"
                  onClick={() => handleRenumberSequentially('current_filter')}
                  className="w-full py-1.5 px-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/80 rounded-xl text-[11px] font-black transition-all flex items-center justify-center gap-1"
                  title={`إعادة ترقيم سائقي مصنع ${factoryFilter} تسلسلياً`}
                >
                  <Wand2 className="w-3 h-3 text-emerald-600" />
                  <span>ترقيم {factoryFilter}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleRenumberSequentially('all')}
                  className="w-full py-1.5 px-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border border-zinc-200/80 rounded-xl text-[11px] font-black transition-all flex items-center justify-center gap-1"
                  title="إعادة ترقيم كل السائقين تسلسلياً 1, 2, 3..."
                >
                  <Wand2 className="w-3 h-3 text-zinc-500" />
                  <span>ترقيم تسلسلي للكل</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Driver List Table / Grid */}
        <div className="mt-3 flex-1 overflow-y-auto pr-1 no-scrollbar space-y-2 border border-zinc-100 rounded-2xl p-2 bg-zinc-50/40 min-h-[260px]">
          {filteredItems.length === 0 ? (
            <div className="py-16 text-center text-zinc-400 font-bold text-sm flex flex-col items-center justify-center gap-2">
              <Hash className="w-8 h-8 text-zinc-300" />
              <span>لا يوجد سائقين يطابقون خيارات البحث أو التصفية</span>
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const isDuplicate = duplicateCodesSet.has(item.code.trim());
              const isModified = item.code.trim() !== item.originalCode.trim();
              const duplicatesInfo = isDuplicate ? codeFrequencyMap.get(item.code.trim()) : null;
              const otherDrivers = duplicatesInfo 
                ? duplicatesInfo.driverNames.filter(name => name !== item.name)
                : [];

              return (
                <div
                  key={item.id}
                  className={`p-3 rounded-2xl transition-all border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    isDuplicate 
                      ? 'bg-rose-50/70 border-rose-300/80 shadow-2xs' 
                      : isModified
                      ? 'bg-amber-50/60 border-amber-300/80'
                      : 'bg-white border-zinc-200/80 hover:border-zinc-300'
                  }`}
                >
                  {/* Driver Details & Factory */}
                  <div className="flex items-center gap-2.5 sm:gap-3 flex-1 min-w-0">
                    {/* Move Up/Down Controls for ordering inside factory */}
                    <div className="flex flex-col gap-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleMove(item.id, 'up')}
                        disabled={idx === 0}
                        title="تحريك لأعلى في الترتيب"
                        className="p-1 hover:bg-zinc-100 disabled:opacity-20 text-zinc-500 rounded-md transition-colors"
                      >
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMove(item.id, 'down')}
                        disabled={idx === filteredItems.length - 1}
                        title="تحريك لأسفل في الترتيب"
                        className="p-1 hover:bg-zinc-100 disabled:opacity-20 text-zinc-500 rounded-md transition-colors"
                      >
                        <ArrowDown className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-sm text-zinc-900 truncate">
                          {item.name}
                        </span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                          item.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'
                        }`}>
                          {item.status === 'active' ? 'نشط' : 'متوقف'}
                        </span>
                        {isModified && (
                          <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-md">
                            معدل (الأصلي: {item.originalCode || 'بدون'})
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 mt-1 text-[11px] text-zinc-500 flex-wrap">
                        {item.factory && (
                          <span className="flex items-center gap-1 font-bold text-zinc-600 bg-zinc-100/80 px-2 py-0.5 rounded-lg">
                            <Building2 className="w-3 h-3 text-zinc-400" />
                            {item.factory}
                          </span>
                        )}
                        {item.route && (
                          <span className="text-zinc-400">
                            خط: {item.route}
                          </span>
                        )}
                      </div>

                      {/* Duplicate Warning indicator */}
                      {isDuplicate && (
                        <div className="mt-1.5 text-[11px] font-bold text-rose-700 flex items-center gap-1 bg-rose-100/70 px-2 py-1 rounded-lg">
                          <AlertTriangle className="w-3 h-3 shrink-0 text-rose-600" />
                          <span>
                            كود مكرر! مشترك مع: {otherDrivers.length > 0 ? otherDrivers.slice(0, 3).join('، ') : 'سائق آخر'}
                            {otherDrivers.length > 3 && ` (+${otherDrivers.length - 3})`}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Code Input Field & Action Buttons */}
                  <div className="flex items-center gap-2 shrink-0 justify-end">
                    <div className="relative">
                      <input
                        type="text"
                        inputMode="numeric"
                        dir="ltr"
                        autoComplete="off"
                        value={item.code}
                        onChange={e => handleCodeChange(item.id, e.target.value)}
                        placeholder="الكود"
                        className={`w-24 sm:w-28 text-center text-sm font-black py-2 px-2 rounded-xl border focus:outline-none transition-all ${
                          isDuplicate 
                            ? 'bg-white border-rose-400 text-rose-800 focus:ring-2 focus:ring-rose-200' 
                            : isModified
                            ? 'bg-amber-50/50 border-amber-400 text-amber-900 focus:ring-2 focus:ring-amber-200'
                            : 'bg-zinc-50 border-zinc-200 text-zinc-800 focus:bg-white focus:ring-2 focus:ring-emerald-200'
                        }`}
                      />
                    </div>

                    {/* Auto Suggest Free Code button */}
                    <button
                      type="button"
                      onClick={() => handleAutoSuggestCode(item.id)}
                      title="اقتراح أول كود رقمي متاح وغير مستخدم"
                      className="p-2 sm:px-2.5 sm:py-2 text-[11px] font-bold bg-zinc-100 hover:bg-emerald-50 text-zinc-600 hover:text-emerald-700 border border-zinc-200 rounded-xl transition-all flex items-center gap-1 shrink-0 active:scale-95"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="hidden sm:inline">كود متاح</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer with Save / Close */}
        <div className="mt-4 pt-3 border-t border-zinc-100 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-zinc-500 font-bold flex items-center gap-2">
            {modifiedCount > 0 ? (
              <span className="text-amber-700 bg-amber-50 px-2.5 py-1 rounded-xl border border-amber-200">
                ✏️ لديك <strong>{modifiedCount}</strong> تعديلات غير محفوظة
              </span>
            ) : (
              <span className="text-zinc-400">
                لم يتم تعديل أي أكواد حتى الآن
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-initial px-5 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs sm:text-sm font-bold transition-all"
            >
              إغلاق
            </button>

            <button
              type="button"
              onClick={handleSaveAll}
              disabled={isSaving || modifiedCount === 0}
              className="flex-1 sm:flex-initial px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-200 disabled:text-zinc-400 disabled:cursor-not-allowed text-white rounded-xl text-xs sm:text-sm font-black shadow-lg shadow-emerald-200/50 transition-all flex items-center justify-center gap-2 active:scale-95"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>جاري الحفظ...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>حفظ جميع التعديلات ({modifiedCount})</span>
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
