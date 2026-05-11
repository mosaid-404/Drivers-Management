import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  Users, 
  Settings, 
  ChevronRight, 
  ChevronLeft, 
  Phone, 
  Download, 
  FileText, 
  Search, 
  Filter,
  LogOut,
  UserPlus,
  Trash2,
  Save,
  Share2,
  X,
  CreditCard,
  History,
  ClipboardList,
  StickyNote,
  HardDriveDownload,
  HardDriveUpload,
  BarChart3,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  serverTimestamp, 
  query, 
  orderBy, 
  where,
  getDoc,
  setDoc,
  writeBatch,
  getDocs,
  deleteDoc
} from 'firebase/firestore';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut, User } from 'firebase/auth';
import { db, auth } from './lib/firebase';
import { handleFirestoreError, OperationType } from './lib/api';
import { Driver, JobRecord, JobItem, Deduction } from './types';
import { toPng } from 'html-to-image';
import { utils, writeFile } from 'xlsx';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Format date to YYYY-MM
const getCurrentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingDriverId, setEditingDriverId] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [currentJobRecord, setCurrentJobRecord] = useState<JobRecord | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const savedDefaultMonth = localStorage.getItem('defaultMonthSetting');
    if (savedDefaultMonth && savedDefaultMonth !== 'current') {
      return savedDefaultMonth;
    }
    return getCurrentMonth();
  });
  
  const [defaultMonthMode, setDefaultMonthMode] = useState<'current' | 'custom'>(() => {
    const savedDefaultMonth = localStorage.getItem('defaultMonthSetting');
    return (savedDefaultMonth && savedDefaultMonth !== 'current') ? 'custom' : 'current';
  });

  const handleUpdateDefaultMonth = (mode: 'current' | 'custom', month?: string) => {
    setDefaultMonthMode(mode);
    if (mode === 'current') {
      localStorage.setItem('defaultMonthSetting', 'current');
    } else if (month) {
      localStorage.setItem('defaultMonthSetting', month);
    }
  };
  
  const handleExportMonthlyReport = async () => {
    try {
      const q = query(collection(db, 'jobRecords'), where('month', '==', selectedMonth));
      const res = await getDocs(q);
      const records = res.docs.map(doc => doc.data() as JobRecord);
      
      // 1. Detailed Data Generation
      const detailedData: any[] = [];
      const summaryData = drivers
        .filter(d => !factoryFilter || d.factory === factoryFilter)
        .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
        .map(driver => {
          const record = records.find(r => r.driverId === driver.id);
          const workTotal = record?.items?.reduce((sum, item) => sum + (item.rounds * item.price), 0) || 0;
          const dedsTotal = record?.deductions?.reduce((sum, item) => sum + item.amount, 0) || 0;

          // Add items to detailed report
          record?.items?.forEach(item => {
            detailedData.push({
              'الكود': driver.code,
              'السائق': driver.name,
              'المصنع/الخط': driver.factory,
              'النوع': 'عمل / شغل',
              'التاريخ': item.date || '',
              'البيان': item.description || 'عمل',
              'التفاصيل': `${item.rounds} نقلة × ${item.price} ج.م`,
              'المبلغ': item.rounds * item.price
            });
          });

          // Add deductions to detailed report
          record?.deductions?.forEach(ded => {
            detailedData.push({
              'الكود': driver.code,
              'السائق': driver.name,
              'المصنع/الخط': driver.factory,
              'النوع': 'خصم / سلف',
              'التاريخ': ded.date || '',
              'البيان': ded.type,
              'التفاصيل': '-',
              'المبلغ': ded.amount
            });
          });

          return {
            'الكود': driver.code,
            'السائق': driver.name,
            'المصنع/الخط': driver.factory,
            'إجمالي العمل': workTotal,
            'الخصومات': dedsTotal,
            'الصافي': workTotal - dedsTotal
          };
        })
        .filter(d => d['إجمالي العمل'] > 0 || d['الخصومات'] > 0);

      const wb = utils.book_new();

      // Summary Sheet
      const wsSummary = utils.json_to_sheet(summaryData, { 
        header: ['الكود', 'السائق', 'المصنع/الخط', 'إجمالي العمل', 'الخصومات', 'الصافي'] 
      });
      wsSummary['!cols'] = [
        { wch: 10 }, { wch: 30 }, { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 15 }
      ];
      utils.book_append_sheet(wb, wsSummary, "ملخص الشهر");

      // Detailed Sheet
      if (detailedData.length > 0) {
        const wsDetailed = utils.json_to_sheet(detailedData, {
          header: ['الكود', 'السائق', 'المصنع/الخط', 'النوع', 'التاريخ', 'البيان', 'التفاصيل', 'المبلغ']
        });
        wsDetailed['!cols'] = [
          { wch: 10 }, { wch: 25 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 20 }, { wch: 12 }
        ];
        utils.book_append_sheet(wb, wsDetailed, "تفاصيل البنود والخصومات");
      }

      writeFile(wb, `تقرير_مفصل_${selectedMonth}.xlsx`);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, 'jobRecords');
    }
  };
  
  // Auth & Data Sync
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) {
      setDrivers([]);
      return;
    }
    const q = query(collection(db, 'drivers'), orderBy('code', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setDrivers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Driver));
    }, (err) => handleFirestoreError(err, OperationType.GET, 'drivers'));
    return unsubscribe;
  }, [user]);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error(err);
    }
  };

  // Filters & Sorting
  const [factoryFilter, setFactoryFilter] = useState('');
  const [sortBy, setSortBy] = useState<'code' | 'name' | 'newest' | 'oldest'>('code');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'details' | 'job' | 'notes'>('details');
  const [sidebarTab, setSidebarTab] = useState<'active' | 'retired'>('active');
  const [showDriverSelector, setShowDriverSelector] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showReports, setShowReports] = useState(false);
  
  const nextSuggestedCode = useMemo(() => {
    const numericalCodes = drivers
      .map(d => parseInt(d.code))
      .filter(n => !isNaN(n));
    return numericalCodes.length > 0 ? (Math.max(...numericalCodes) + 1).toString() : '1';
  }, [drivers]);

  const [confirmDelete, setConfirmDelete] = useState<{
    type: 'driver' | 'item' | 'deduction',
    index?: number,
    title: string,
    message: string
  } | null>(null);

  const reportRef = React.useRef<HTMLDivElement>(null);

  // Derived Drivers
  const filteredDrivers = useMemo(() => {
    let result = [...drivers];
    
    if (factoryFilter) {
      result = result.filter(d => d.factory === factoryFilter);
    }
    
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(d => 
        d.name.toLowerCase().includes(q) || 
        d.code.toLowerCase().includes(q) || 
        (d.mobile && d.mobile.includes(q))
      );
    }

    result.sort((a, b) => {
      if (sortBy === 'code') return a.code.localeCompare(b.code, undefined, { numeric: true });
      if (sortBy === 'name') return a.name.localeCompare(b.name, 'ar');
      if (sortBy === 'newest') return (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0);
      if (sortBy === 'oldest') return (a.createdAt?.toMillis() || 0) - (b.createdAt?.toMillis() || 0);
      return 0;
    });

    return result;
  }, [drivers, factoryFilter, searchQuery, sortBy]);

  const activeDrivers = filteredDrivers.filter(d => d.status === 'active');
  const retiredDrivers = filteredDrivers.filter(d => d.status === 'retired');
  const currentDriverList = sidebarTab === 'active' ? activeDrivers : retiredDrivers;

  const currentDriver = useMemo(() => {
    if (!selectedDriverId) return currentDriverList[0];
    return currentDriverList.find(d => d.id === selectedDriverId) || currentDriverList[0];
  }, [selectedDriverId, currentDriverList]);

  const currentIndex = useMemo(() => {
    if (!currentDriver) return -1;
    return currentDriverList.findIndex(d => d.id === currentDriver.id);
  }, [currentDriver, currentDriverList]);

  useEffect(() => {
    if (currentDriver) {
      setActiveTab('details');
    }
  }, [currentDriver?.id]);

  useEffect(() => {
    if (!currentDriver || !user) {
      setCurrentJobRecord(null);
      return;
    }

    const recordId = `${currentDriver.id}_${selectedMonth}`;
    const unsubscribe = onSnapshot(doc(db, 'jobRecords', recordId), (snapshot) => {
      if (snapshot.exists()) {
        setCurrentJobRecord({ id: snapshot.id, ...snapshot.data() } as JobRecord);
      } else {
        setCurrentJobRecord(null);
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, `jobRecords/${recordId}`));

    return unsubscribe;
  }, [currentDriver, selectedMonth, user]);

  const handleNextDriver = () => {
    if (currentIndex < currentDriverList.length - 1) {
      const nextDriver = currentDriverList[currentIndex + 1];
      setSelectedDriverId(nextDriver.id);
    }
  };

  const handlePrevDriver = () => {
    if (currentIndex > 0) {
      const prevDriver = currentDriverList[currentIndex - 1];
      setSelectedDriverId(prevDriver.id);
    }
  };

  const handleAddDriver = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const mobile = formData.get('mobile') as string;

    // Validation for mobile: exactly 11 digits if provided
    if (mobile && !/^\d{11}$/.test(mobile)) {
      alert('رقم الموبايل يجب أن يتكون من 11 رقم بالضبط');
      return;
    }

    const driverData = {
      code: formData.get('code') as string,
      name: formData.get('name') as string,
      route: formData.get('route') as string,
      factory: formData.get('factory') as string,
      carType: formData.get('carType') as string,
      mobile: mobile,
      status: editingDriverId ? currentDriver.status : ('active' as const),
      updatedAt: serverTimestamp(),
    };

    try {
      if (editingDriverId) {
        await updateDoc(doc(db, 'drivers', editingDriverId), driverData);
      } else {
        await addDoc(collection(db, 'drivers'), {
          ...driverData,
          createdAt: serverTimestamp(),
        });
      }
      setShowAddForm(false);
      setEditingDriverId(null);
    } catch (err) {
      handleFirestoreError(err, editingDriverId ? OperationType.UPDATE : OperationType.CREATE, 'drivers');
    }
  };

  const handleImportExcel = async (text: string) => {
    const lines = text.split('\n').filter(l => l.trim());
    for (const line of lines) {
      // Assuming format: Code Name Route Factory CarType Mobile
      const [code, name, route, factory, carType, mobile] = line.split('\t').map(s => s?.trim());
      if (code && name) {
        await addDoc(collection(db, 'drivers'), {
          code, name, route: route || '', factory: factory || '', carType: carType || '', mobile: mobile || '',
          status: 'active',
          createdAt: serverTimestamp(),
        });
      }
    }
    setShowImportModal(false);
  };

  const saveJobRecord = async (updatedData: Partial<JobRecord>) => {
    if (!currentDriver) return;
    const recordId = `${currentDriver.id}_${selectedMonth}`;
    const baseRecord: JobRecord = currentJobRecord || {
      id: recordId,
      driverId: currentDriver.id,
      month: selectedMonth,
      items: [],
      deductions: [],
      totalWork: 0,
      totalDeductions: 0,
      netPay: 0,
      updatedAt: serverTimestamp(),
    };

    const newData = { ...baseRecord, ...updatedData, updatedAt: serverTimestamp() };
    
    // Recalculate totals
    newData.totalWork = newData.items.reduce((sum, item) => sum + (item.rounds * item.price), 0);
    newData.totalDeductions = newData.deductions.reduce((sum, d) => sum + d.amount, 0);
    newData.netPay = newData.totalWork - newData.totalDeductions;

    // Remove id before saving to comply with strict 10-key security rule
    const { id: _, ...dataToSave } = newData;

    try {
      await setDoc(doc(db, 'jobRecords', recordId), dataToSave);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `jobRecords/${recordId}`);
    }
  };

  const handleShareReport = async () => {
    if (reportRef.current === null) return;
    
    try {
      const dataUrl = await toPng(reportRef.current, { 
        cacheBust: true, 
        backgroundColor: '#fff',
        pixelRatio: 2 // Higher quality for sharing
      });
      
      const fileName = `تقرير_${currentDriver?.name}_${selectedMonth}.png`;
      
      // Convert dataUrl to File for sharing
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], fileName, { type: 'image/png' });

      // Try Web Share API first
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: `تقرير شغل: ${currentDriver?.name}`,
            text: `تقرير مستحقات السائق ${currentDriver?.name} لشهر ${selectedMonth}`,
          });
          return; // Success
        } catch (shareErr) {
          // If share was cancelled or failed, we'll continue to download fallback
          if ((shareErr as Error).name !== 'AbortError') {
            console.error('Share failed:', shareErr);
          } else {
            return; // User cancelled, don't download
          }
        }
      }

      // Fallback: Download
      const link = document.createElement('a');
      link.download = fileName;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('oops, something went wrong!', err);
      alert('حدث خطأ أثناء إنشاء التقرير');
    }
  };

  const handleExportData = async () => {
    try {
      const driversSnap = await getDocs(collection(db, 'drivers'));
      const jobRecordsSnap = await getDocs(collection(db, 'jobRecords'));
      
      const data = {
        drivers: driversSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
        jobRecords: jobRecordsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
        exportedAt: new Date().toISOString()
      };

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `driver_manager_backup_${new Date().toISOString().split('T')[0]}.json`;
      link.click();
    } catch (err) {
      alert('حدث خطأ أثناء التصدير');
    }
  };

  const handleImportData = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      alert('الرجاء اختيار ملف نسخة احتياطية بصيغة JSON. ملفات الإكسل لا يمكن استيرادها من هنا.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        let data;
        try {
          data = JSON.parse(text);
        } catch (jsonErr) {
          throw new Error('الملف ليس بتنسيق JSON صحيح. تأكد من جودة الملف.');
        }

        if (!data || (!data.drivers && !data.jobRecords)) {
          throw new Error('تنسيق الملف غير مدعوم. البيانات المطلوبة مفقودة.');
        }

        const driversToImport = data.drivers || [];
        const recordsToImport = data.jobRecords || [];

        if (!confirm(`هل أنت متأكد من استيراد ${driversToImport.length} سائق و ${recordsToImport.length} سجل شغل؟ قد يتم الكتابة فوق البيانات الحالية.`)) return;

        // Fetch existing drivers to preserve createdAt and satisfy security rules
        const currentDriversSnap = await getDocs(collection(db, 'drivers'));
        const existingDriversMap = new Map(currentDriversSnap.docs.map(d => [d.id, d.data().createdAt]));

        const CHUNK_SIZE = 400;
        const allOps: { ref: any, data: any }[] = [];

        // Prepare Driver Operations
        for (const driver of driversToImport) {
          const { id, createdAt: jsonCreatedAt, updatedAt: jsonUpdatedAt, ...driverData } = driver;
          const existingCreatedAt = existingDriversMap.get(id);
          
          allOps.push({
            ref: doc(db, 'drivers', id),
            data: {
              ...driverData,
              createdAt: existingCreatedAt || serverTimestamp(), // Use existing if update, serverTimestamp if new
            }
          });
        }

        // Prepare Job Record Operations
        for (const record of recordsToImport) {
          const { id, updatedAt: jsonUpdatedAt, ...recordData } = record;
          allOps.push({
            ref: doc(db, 'jobRecords', id),
            data: {
              ...recordData,
              updatedAt: serverTimestamp() // jobRecords rule requires this for any write
            }
          });
        }

        // Execute in chunks
        let successfulBatches = 0;
        for (let i = 0; i < allOps.length; i += CHUNK_SIZE) {
          const chunk = allOps.slice(i, i + CHUNK_SIZE);
          const batch = writeBatch(db);
          chunk.forEach(op => batch.set(op.ref, op.data));
          try {
            await batch.commit();
            successfulBatches++;
          } catch (batchErr: any) {
            console.error(`Batch ${successfulBatches + 1} failed:`, batchErr);
            throw new Error(`تعذر استيراد بعض البيانات: ${batchErr.message}`);
          }
        }

        alert('تم استيراد البيانات بنجاح!');
        e.target.value = ''; // Reset input
        setShowImportModal(false);
        setShowSettings(false);
      } catch (err: any) {
        console.error('Import error:', err);
        alert(err.message || 'حدث خطأ أثناء استيراد البيانات. تأكد من أن الملف سليم وصلاحياتك كافية.');
      }
    };
    reader.readAsText(file);
  };

  const handleDeleteAction = async () => {
    if (!confirmDelete) return;

    try {
      if (confirmDelete.type === 'driver' && currentDriver) {
        await deleteDoc(doc(db, 'drivers', currentDriver.id));
        setSelectedDriverId(null);
      } else if (confirmDelete.type === 'item' && confirmDelete.index !== undefined) {
        const newItems = [...(currentJobRecord?.items || [])];
        newItems.splice(confirmDelete.index, 1);
        await saveJobRecord({ items: newItems });
      } else if (confirmDelete.type === 'deduction' && confirmDelete.index !== undefined) {
        const newDeds = [...(currentJobRecord?.deductions || [])];
        newDeds.splice(confirmDelete.index, 1);
        await saveJobRecord({ deductions: newDeds });
      }
      setConfirmDelete(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, confirmDelete.type === 'driver' ? 'drivers' : 'jobRecords');
    }
  };

  if (loading) return <div className="flex items-center justify-center h-screen rtl">جاري التحميل...</div>;

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-emerald-50 rtl p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-8 rounded-3xl shadow-xl max-w-sm w-full text-center space-y-6"
        >
          <div className="bg-emerald-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto">
            <CreditCard className="text-emerald-600 w-10 h-10" />
          </div>
          <h1 className="text-2xl font-bold text-zinc-800">نظام إدارة السائقين</h1>
          <p className="text-zinc-500">سجل الدخول لإدارة ورديات وحسابات السائقين</p>
          <button 
            onClick={handleLogin}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl font-medium transition-all shadow-lg shadow-emerald-200"
          >
            تسجيل الدخول بجوجل
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 rtl font-sans pb-20 lg:pb-0">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200 sticky top-0 z-30 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-bold text-lg hidden sm:block">مدير السائقين</span>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-emerald-700 shadow-lg shadow-emerald-100 transition-all font-sans"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة سائق</span>
          </button>
          
          <div className="flex items-center gap-1 border-r border-zinc-100 pr-2 mr-2">
            <button 
              onClick={() => { setSidebarTab('active'); setShowDriverSelector(true); }}
              title="بحث سريع"
              className="p-2 text-zinc-400 hover:text-emerald-600 transition-colors bg-zinc-50 rounded-lg hover:bg-emerald-50"
            >
              <Search className="w-5 h-5" />
            </button>
            <button 
              onClick={() => setShowReports(true)}
              title="التقارير والإحصائيات"
              className="p-2 text-zinc-400 hover:text-blue-600 transition-colors bg-zinc-50 rounded-lg hover:bg-blue-50"
            >
              <BarChart3 className="w-5 h-5" />
            </button>
            <button 
              onClick={() => setShowSettings(true)}
              title="الإعدادات والنسخ الاحتياطي"
              className="p-2 text-zinc-400 hover:text-emerald-600 transition-colors bg-zinc-50 rounded-lg hover:bg-emerald-50"
            >
              <Settings className="w-5 h-5" />
            </button>
            <button 
              onClick={() => signOut(auth)}
              className="p-2 text-zinc-400 hover:text-red-500"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Mobile Filters (Compact Row) */}
        <div className="lg:hidden flex items-center gap-2 bg-white p-2 rounded-2xl border border-zinc-200 shadow-sm mb-2 overflow-x-auto no-scrollbar">
          <div className="relative flex-1 min-w-[140px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
            <input 
              type="text" 
              placeholder="بحث بالسائق..." 
              className="w-full bg-zinc-50 border-none focus:ring-1 focus:ring-emerald-500/20 text-xs py-2 pr-8 rounded-xl font-medium"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <select 
            className="bg-zinc-50 border-none rounded-xl text-[10px] font-bold py-2 px-2 min-w-[90px] focus:ring-1 focus:ring-emerald-500/20"
            value={factoryFilter}
            onChange={(e) => setFactoryFilter(e.target.value)}
          >
            <option value="">كل المصانع</option>
            {Array.from(new Set(drivers.map(d => d.factory))).filter(Boolean).sort().map(f => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
          <select 
            className="bg-zinc-50 border-none rounded-xl text-[10px] font-bold py-2 px-2 min-w-[80px] focus:ring-1 focus:ring-emerald-500/20"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
          >
            <option value="code">الكود</option>
            <option value="name">الاسم</option>
            <option value="newest">الأحدث</option>
            <option value="oldest">الأقدم</option>
          </select>
        </div>
        <div className="hidden lg:block lg:col-span-4 space-y-4">
          <div className="bg-white rounded-2xl border border-zinc-200 p-4 sticky top-24 max-h-[85vh] flex flex-col">
            
            {/* Sidebar Tabs */}
            <div className="flex bg-zinc-100 p-1 rounded-xl mb-4">
               <button 
                 onClick={() => setSidebarTab('active')}
                 className={cn(
                   "flex-1 py-2 text-xs font-bold rounded-lg transition-all",
                   sidebarTab === 'active' ? "bg-white text-emerald-600 shadow-sm" : "text-zinc-400"
                 )}
               >نشط ({activeDrivers.length})</button>
               <button 
                 onClick={() => setSidebarTab('retired')}
                 className={cn(
                   "flex-1 py-2 text-xs font-bold rounded-lg transition-all",
                   sidebarTab === 'retired' ? "bg-white text-orange-600 shadow-sm" : "text-zinc-400"
                 )}
               >متوقف ({retiredDrivers.length})</button>
            </div>

            <div className="flex items-center gap-2 mb-4">
              <Search className="w-4 h-4 text-zinc-400" />
              <input 
                type="text" 
                placeholder="بحث بالسائق..." 
                className="w-full bg-zinc-50 border-none focus:ring-0 text-sm py-2"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            
            <div className="space-y-4 mb-4">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-zinc-500">المصنع</label>
                <select 
                  className="bg-zinc-50 border-zinc-200 rounded-lg text-sm py-2"
                  value={factoryFilter}
                  onChange={(e) => setFactoryFilter(e.target.value)}
                >
                  <option value="">كل المصانع</option>
                  {Array.from(new Set(drivers.map(d => d.factory))).filter(Boolean).map(f => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-zinc-500">الترتيب</label>
                <select 
                  className="bg-zinc-50 border-zinc-200 rounded-lg text-sm py-2"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                >
                  <option value="code">بالكود</option>
                  <option value="name">بالاسم</option>
                  <option value="newest">الأحدث</option>
                  <option value="oldest">الأقدم</option>
                </select>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 pr-2 space-y-2 no-scrollbar">
              {currentDriverList.map((driver, listIdx) => {
                return (
                  <button
                    key={driver.id}
                    onClick={() => setSelectedDriverId(driver.id)}
                    className={cn(
                      "w-full text-right p-4 rounded-xl transition-all border flex items-center justify-between group",
                      currentDriver?.id === driver.id 
                        ? (sidebarTab === 'active' ? "bg-emerald-50 border-emerald-200 text-emerald-800 shadow-sm" : "bg-orange-50 border-orange-200 text-orange-800 shadow-sm")
                        : "bg-white border-zinc-100 hover:border-zinc-300 text-zinc-600"
                    )}
                  >
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                         <span className="font-bold">{driver.name}</span>
                         {driver.notes && (
                           <span title="يوجد ملاحظات" className="flex items-center justify-center w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
                         )}
                      </div>
                      <span className="text-xs opacity-70">كود: {driver.code}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <ChevronLeft className={cn("w-4 h-4 transition-transform", currentDriver?.id === driver.id ? "translate-x-1" : "opacity-0")} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="lg:col-span-8 space-y-6">
          {!currentDriver ? (
            <div className="h-64 flex flex-col items-center justify-center text-zinc-400 bg-white rounded-3xl border-2 border-dashed border-zinc-200">
              <Users className="w-12 h-12 mb-2 opacity-20" />
              <p>لا يوجد سائقين حالياً</p>
            </div>
          ) : (
            <>
              {/* Driver Navigation (Always Visible) */}
              <div className="flex items-center justify-between bg-white px-4 py-3 rounded-2xl border border-zinc-200 shadow-sm mb-4">
                <button 
                  onClick={handlePrevDriver}
                  disabled={currentIndex === 0}
                  className="p-2 disabled:opacity-30 text-zinc-400 hover:text-emerald-600 transition-colors"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
                <button 
                  onClick={() => setShowDriverSelector(true)}
                  className="flex flex-col items-center flex-1 min-w-0 hover:bg-zinc-50 rounded-xl py-1 transition-colors group"
                >
                  <p className="text-[10px] text-zinc-400 font-bold mb-0.5">كود: {currentDriver.code} • {currentDriver.factory}{currentDriver.carType ? ` • ${currentDriver.carType}` : ''}</p>
                  <h2 className="font-black text-zinc-800 text-sm truncate w-full px-2 text-center group-hover:text-emerald-600 transition-colors">{currentDriver.name}</h2>
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg">{currentIndex + 1} / {currentDriverList.length}</span>
                    <Search className="w-2.5 h-2.5 text-zinc-300 group-hover:text-emerald-400 transition-colors" />
                  </div>
                </button>
                <button 
                  onClick={handleNextDriver}
                  disabled={currentIndex === currentDriverList.length - 1}
                  className="p-2 disabled:opacity-30 text-zinc-400 hover:text-emerald-600 transition-colors"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
              </div>

              {/* Driver Details Card */}
              <div className="bg-white rounded-3xl border border-zinc-200 overflow-hidden shadow-sm">
                <div className="bg-emerald-600 px-6 py-6 text-white relative">
                  <div className="absolute top-4 left-4 flex gap-2">
                    <button 
                      onClick={() => {
                        setEditingDriverId(currentDriver.id);
                        setShowAddForm(true);
                      }}
                      className="bg-white/10 border border-white/20 p-2 rounded-full hover:bg-white/30 transition-colors"
                      title="تعديل البيانات"
                    >
                      <Save className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={handleShareReport}
                      className="bg-white/10 border border-white/20 p-2 rounded-full hover:bg-white/30 transition-colors"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  
                  <button 
                    onClick={() => setShowDriverSelector(true)}
                    className="space-y-0.5 text-right w-full"
                  >
                    <div className="flex items-center gap-2">
                      <p className="text-emerald-100 text-[10px] font-bold bg-emerald-700/50 px-2 py-0.5 rounded">كود: {currentDriver.code}</p>
                      {currentDriver.notes && <StickyNote className="w-3 h-3 text-orange-300" />}
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2 group">
                      {currentDriver.name}
                      <Search className="w-4 h-4 opacity-0 group-hover:opacity-50 transition-opacity" />
                    </h1>
                  </button>

                  <div className="grid grid-cols-2 gap-3 mt-4">
                    <div className="bg-emerald-700/30 p-2.5 rounded-xl border border-emerald-500/20 flex items-center justify-between col-span-2 sm:col-span-1">
                      <div className="truncate">
                        <p className="text-[10px] text-emerald-100 mb-0.5 opacity-70">المصنع / الخط / السيارة</p>
                        <p className="text-xs font-semibold truncate">
                          {currentDriver.factory || '---'} - {currentDriver.route || '---'}
                          {currentDriver.carType && ` - ${currentDriver.carType}`}
                        </p>
                      </div>
                      <button 
                        onClick={() => {
                          const status = currentDriver.status === 'active' ? 'retired' : 'active';
                          updateDoc(doc(db, 'drivers', currentDriver.id), { 
                            status,
                            updatedAt: serverTimestamp()
                          });
                        }}
                        className={cn(
                          "text-[9px] px-2 py-1 rounded-lg font-bold border transition-all active:scale-95",
                          currentDriver.status === 'active' 
                            ? "bg-zinc-900 border-zinc-800 text-white hover:bg-black" 
                            : "bg-orange-500 border-orange-400 text-white hover:bg-orange-600"
                        )}
                      >
                        {currentDriver.status === 'active' ? 'أرشفة' : 'تنشيط'}
                      </button>
                    </div>
                    {currentDriver.mobile && (
                      <div className="bg-emerald-700/30 p-2.5 rounded-xl border border-emerald-500/20 flex items-center justify-center">
                        <a 
                          href={`tel:${currentDriver.mobile}`}
                          className="flex items-center gap-2 bg-white text-emerald-600 px-6 py-2 rounded-xl text-xs font-black shadow-lg active:scale-95 transition-all w-full justify-center"
                        >
                          <Phone className="w-4 h-4 fill-emerald-600" />
                          <span>اتصــــال</span>
                        </a>
                      </div>
                    )}
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-zinc-100 bg-zinc-50/50">
                   {[
                     { id: 'details', label: 'الحسابات', icon: <CreditCard className="w-4 h-4" /> },
                     { id: 'notes', label: 'الملاحظات', icon: <StickyNote className="w-4 h-4" /> }
                   ].map(tab => (
                     <button
                       key={tab.id}
                       onClick={() => setActiveTab(tab.id as any)}
                       className={cn(
                         "flex-1 flex items-center justify-center gap-2 py-3 text-xs font-bold transition-all border-b-2",
                         activeTab === tab.id 
                           ? "border-emerald-600 text-emerald-600 bg-white" 
                           : "border-transparent text-zinc-400 hover:text-zinc-600"
                       )}
                     >
                       {tab.icon}
                       {tab.label}
                       {tab.id === 'notes' && (
                         <>
                           {Array.isArray(currentDriver.notes) && currentDriver.notes.some(n => n.isImportant) ? (
                             <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse ml-1" />
                           ) : Array.isArray(currentDriver.notes) && currentDriver.notes.length > 0 ? (
                             <span className="w-1.5 h-1.5 rounded-full bg-orange-400 ml-1" />
                           ) : null}
                         </>
                       )}
                     </button>
                   ))}
                </div>

                <div className="p-4 sm:p-6 space-y-6">
                  {activeTab === 'details' ? (
                    <>
                      {/* Month Picker */}
                      <div className="flex items-center justify-between pb-2">
                        <h3 className="text-sm font-bold text-zinc-800">بيان شهر</h3>
                        <input 
                          type="month" 
                          value={selectedMonth}
                          onChange={(e) => setSelectedMonth(e.target.value)}
                          className="bg-zinc-100 border-none rounded-xl text-xs px-3 py-1.5 font-bold shadow-inner"
                        />
                      </div>

                      {/* Summary Grid - SMALLER */}
                      <div className="grid grid-cols-3 gap-2">
                        <div className="bg-zinc-50 border border-zinc-100 p-2.5 rounded-2xl text-center">
                          <p className="text-[9px] text-zinc-400 font-bold mb-1">شغل</p>
                          <p className="text-sm font-black text-zinc-800">{currentJobRecord?.totalWork || 0}</p>
                        </div>
                        <div className="bg-orange-50/50 border border-orange-100 p-2.5 rounded-2xl text-center">
                          <p className="text-[9px] text-orange-400 font-bold mb-1">خصم</p>
                          <p className="text-sm font-black text-orange-600">{currentJobRecord?.totalDeductions || 0}</p>
                        </div>
                        <div className="bg-emerald-600 p-2.5 rounded-2xl text-center text-white shadow-md shadow-emerald-100">
                          <p className="text-[9px] text-emerald-100 font-bold mb-1">صافي</p>
                          <p className="text-sm font-black">{currentJobRecord?.netPay || 0}</p>
                        </div>
                      </div>

                      {/* Editor Sections Redesign */}
                      <div className="space-y-8 pb-20">
                        <SectionBox 
                          title="بنود الشغل" 
                          icon={<ClipboardList className="w-5 h-5" />}
                          items={currentJobRecord?.items || []}
                          onAdd={() => saveJobRecord({ items: [...(currentJobRecord?.items || []), { description: '', rounds: 1, price: 0 }] })}
                          onUpdate={(idx, field, val) => {
                            const newItems = [...(currentJobRecord?.items || [])];
                            newItems[idx] = { ...newItems[idx], [field]: val };
                            saveJobRecord({ items: newItems });
                          }}
                          onRemove={(idx) => {
                            setConfirmDelete({
                              type: 'item',
                              index: idx,
                              title: 'حذف بند شغل',
                              message: 'هل أنت متأكد من حذف هذا البند؟ لا يمكن التراجع عن هذا الإجراء.'
                            });
                          }}
                          renderItem={(item, idx, update, remove) => (
                            <motion.div 
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              key={idx} 
                              className="bg-white border border-zinc-200 p-2 sm:p-3 rounded-2xl shadow-sm hover:shadow-md transition-shadow relative"
                            >
                              <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-2">
                                  <div className="bg-emerald-100 p-2 rounded-lg text-emerald-600 hidden sm:block">
                                    <FileText className="w-4 h-4" />
                                  </div>
                                  <input 
                                    autoFocus={item.description === ''}
                                    placeholder="وصف العمل (مثال: نقلة وردية صباحية)" 
                                    className="flex-1 text-sm bg-zinc-50 border-none rounded-xl px-3 py-2 font-bold focus:ring-2 focus:ring-emerald-500 transition-all placeholder:font-normal" 
                                    value={item.description}
                                    onChange={(e) => update(idx, 'description', e.target.value)}
                                    onFocus={(e) => e.target.select()}
                                  />
                                  <button onClick={() => remove(idx)} className="p-2 text-zinc-300 hover:text-red-500 transition-colors">
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                                
                                <div className="grid grid-cols-3 gap-3 items-end">
                                  <div className="space-y-1">
                                    <span className="text-[9px] font-black text-zinc-400 mr-2">التاريخ</span>
                                    <input 
                                      type="date"
                                      className="w-full text-center text-[10px] font-bold bg-zinc-50 rounded-xl px-2 py-2 border border-transparent focus:ring-2 focus:ring-emerald-500" 
                                      value={item.date || ''}
                                      onChange={(e) => update(idx, 'date', e.target.value)}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <span className="text-[9px] font-black text-zinc-400 mr-2">العدد / الورديات</span>
                                    <div className="flex items-center justify-between bg-zinc-50 rounded-xl px-2 py-2 border border-transparent focus-within:border-emerald-200" dir="ltr">
                                      <NumericInput 
                                        className="w-full text-center text-sm font-black bg-transparent border-none p-0 focus:ring-0 text-emerald-600 font-mono" 
                                        value={item.rounds}
                                        onChange={(val) => update(idx, 'rounds', val)}
                                      />
                                    </div>
                                  </div>
                                  <div className="space-y-1">
                                    <span className="text-[9px] font-black text-zinc-400 mr-2">سعر البند الواحد</span>
                                    <div className="flex items-center justify-between bg-zinc-50 rounded-xl px-2 py-2 border border-transparent focus-within:border-emerald-200" dir="ltr">
                                      <NumericInput 
                                        className="w-full text-center text-sm font-black bg-transparent border-none p-0 focus:ring-0 text-emerald-600 font-mono" 
                                        value={item.price}
                                        onChange={(val) => update(idx, 'price', val)}
                                      />
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        />

                               <div className="grid grid-cols-1 gap-6">
                          <SectionBox 
                            title="الخصومات" 
                            accentColor="orange"
                            icon={<History className="w-5 h-5" />}
                            items={currentJobRecord?.deductions || []}
                            onAdd={() => saveJobRecord({ deductions: [...(currentJobRecord?.deductions || []), { type: '', amount: 0, date: new Date().toISOString().split('T')[0] }] })}
                            onUpdate={(idx, field, val) => {
                              const newDeds = [...(currentJobRecord?.deductions || [])];
                              newDeds[idx] = { ...newDeds[idx], [field]: val };
                              saveJobRecord({ deductions: newDeds });
                            }}
                            onRemove={(idx) => {
                              setConfirmDelete({
                                type: 'deduction',
                                index: idx,
                                title: 'حذف خصم',
                                message: 'هل أنت متأكد من حذف هذا الخصم؟'
                              });
                            }}
                            renderItem={(item, idx, update, remove) => (
                              <motion.div 
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                key={idx} 
                                className="flex flex-col gap-4 bg-orange-50/40 p-4 rounded-2xl border border-orange-100"
                              >
                                <div className="flex gap-3 items-start">
                                  <div className="flex-1 space-y-1">
                                    <span className="text-[10px] font-black text-orange-400 mr-2">سبب الخصم</span>
                                    <input 
                                      autoFocus={item.type === ''}
                                      placeholder="مثلاً: ورشة، غسيل، مخالفة..." 
                                      className="w-full text-sm bg-white border-none rounded-xl px-4 py-3 font-bold shadow-sm focus:ring-2 focus:ring-orange-200" 
                                      value={item.type}
                                      onChange={(e) => update(idx, 'type', e.target.value)}
                                      onFocus={(e) => e.target.select()}
                                    />
                                  </div>
                                  <button 
                                    onClick={() => remove(idx)} 
                                    className="mt-6 p-2.5 text-orange-300 hover:text-red-500 transition-colors bg-white rounded-xl shadow-sm"
                                  >
                                    <X className="w-5 h-5" />
                                  </button>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="space-y-1">
                                    <span className="text-[10px] font-black text-orange-400 mr-2">المبلغ المستقطع</span>
                                    <div className="flex items-center bg-white border-none rounded-xl px-4 py-2.5 shadow-sm focus-within:ring-2 focus-within:ring-orange-200" dir="ltr">
                                      <NumericInput 
                                         className="w-full text-lg bg-transparent border-none text-center font-black text-orange-600 focus:ring-0 p-0 font-mono" 
                                         value={item.amount}
                                         onChange={(val) => update(idx, 'amount', val)}
                                      />
                                    </div>
                                  </div>
                                  <div className="space-y-1">
                                    <span className="text-[10px] font-black text-orange-400 mr-2">تاريخ الخصم</span>
                                    <input 
                                      type="date"
                                      className="w-full text-xs bg-white border-none rounded-xl px-4 py-3 font-bold shadow-sm focus:ring-2 focus:ring-orange-200" 
                                      value={item.date || new Date().toISOString().split('T')[0]}
                                      onChange={(e) => update(idx, 'date', e.target.value)}
                                    />
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          />
                        </div>
                      </div>
                    </>
                  ) : (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-6"
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                           <StickyNote className="w-5 h-5 text-orange-400" />
                           <h3 className="font-black text-zinc-800 text-sm">ملاحظات و تنبيهات السائق</h3>
                        </div>
                        <button 
                          onClick={() => {
                            const newNote = {
                              id: crypto.randomUUID(),
                              text: '',
                              isImportant: false,
                              createdAt: Date.now()
                            };
                            const notesArray = Array.isArray(currentDriver.notes) ? currentDriver.notes : [];
                            const updatedNotes = [newNote, ...notesArray];
                            updateDoc(doc(db, 'drivers', currentDriver.id), { 
                              notes: updatedNotes,
                              updatedAt: serverTimestamp()
                            });
                          }}
                          className="flex items-center gap-1.5 bg-emerald-50 text-emerald-600 px-4 py-2 rounded-xl text-[10px] font-black hover:bg-emerald-100 transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>إضافة ملاحظة</span>
                        </button>
                      </div>

                      <div className="space-y-3">
                        {(!Array.isArray(currentDriver.notes) || currentDriver.notes.length === 0) ? (
                          <div className="bg-zinc-50 border-2 border-dashed border-zinc-100 rounded-3xl p-10 flex flex-col items-center justify-center text-zinc-300 gap-2">
                            <StickyNote className="w-8 h-8 opacity-20" />
                            <span className="text-[10px] font-bold">لا يوجد ملاحظات مسجلة</span>
                          </div>
                        ) : (
                          <AnimatePresence initial={false}>
                            {currentDriver.notes.map((note) => (
                              <motion.div 
                                key={note.id}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 10 }}
                                className={cn(
                                  "bg-white border-2 p-4 rounded-[24px] shadow-sm transition-all relative group",
                                  note.isImportant ? "border-red-100 bg-red-50/10" : "border-zinc-50"
                                )}
                              >
                                <div className="flex gap-3">
                                  <button 
                                    onClick={() => {
                                      const updatedNotes = currentDriver.notes?.map(n => 
                                        n.id === note.id ? { ...n, isImportant: !n.isImportant } : n
                                      );
                                      updateDoc(doc(db, 'drivers', currentDriver.id), { 
                                        notes: updatedNotes,
                                        updatedAt: serverTimestamp()
                                      });
                                    }}
                                    className={cn(
                                      "w-10 h-10 rounded-full flex items-center justify-center transition-colors shrink-0",
                                      note.isImportant ? "bg-red-500 text-white" : "bg-zinc-100 text-zinc-400 hover:bg-zinc-200"
                                    )}
                                    title={note.isImportant ? "إلغاء التمييز كـ مهم" : "تحديد كـ مهم"}
                                  >
                                    <AlertCircle className="w-5 h-5" />
                                  </button>
                                  
                                  <div className="flex-1">
                                    <textarea
                                      className="w-full bg-transparent border-none p-0 focus:ring-0 text-sm font-bold text-zinc-800 placeholder:text-zinc-300 resize-none"
                                      placeholder="اكتب ملاحظتك هنا..."
                                      rows={2}
                                      value={note.text}
                                      onChange={(e) => {
                                        const updatedNotes = currentDriver.notes?.map(n => 
                                          n.id === note.id ? { ...n, text: e.target.value } : n
                                        );
                                        updateDoc(doc(db, 'drivers', currentDriver.id), { 
                                          notes: updatedNotes,
                                          updatedAt: serverTimestamp()
                                        });
                                      }}
                                    />
                                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-zinc-50">
                                      <span className="text-[9px] font-bold text-zinc-400">
                                        {new Date(note.createdAt).toLocaleDateString('ar-EG')}
                                      </span>
                                      <button 
                                        onClick={() => {
                                          const updatedNotes = currentDriver.notes?.filter(n => n.id !== note.id);
                                          updateDoc(doc(db, 'drivers', currentDriver.id), { 
                                            notes: updatedNotes,
                                            updatedAt: serverTimestamp()
                                          });
                                        }}
                                        className="p-2 text-zinc-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </div>
                                </div>
                                {note.isImportant && (
                                  <div className="absolute -top-1.5 -right-1.5">
                                    <div className="bg-red-500 text-white text-[8px] font-black px-2 py-0.5 rounded-full shadow-lg border-2 border-white">مهم</div>
                                  </div>
                                )}
                              </motion.div>
                            ))}
                          </AnimatePresence>
                        )}
                        
                        <div className="pt-6">
                           <button 
                            onClick={() => {
                              setConfirmDelete({
                                type: 'driver',
                                title: 'حذف السائق نهائياً',
                                message: `هل أنت متأكد من مسح بيانات السائق (${currentDriver.name}) تماماً من النظام؟ هذا الإجراء سيقوم بحذف السائق وكل سجلاته ولن تتمكن من استعادته.`
                              });
                            }}
                            className="w-full bg-red-50 text-red-600 py-4 rounded-2xl text-xs font-bold hover:bg-red-100 transition-colors flex items-center justify-center gap-2 border border-red-100 shadow-sm"
                          >
                            <Trash2 className="w-4 h-4" />
                            <span>مسح السائق نهائياً من النظام</span>
                          </button>
                        </div>
                      </div>
                      <p className="text-[10px] text-zinc-400 text-center font-bold">يتم حفظ التغييرات تلقائياً</p>
                    </motion.div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      {/* Hidden Report for Image Generation */}
      <div className="absolute top-[-9999px]">
        <div ref={reportRef} className="w-[500px] bg-white p-8 rtl font-sans">
           <div className="border-[6px] border-emerald-600 rounded-[40px] p-8 space-y-8 relative overflow-hidden">
              {/* Decorative background element */}
              <div className="absolute -top-20 -right-20 w-64 h-64 bg-emerald-50 rounded-full opacity-50" />
              
              <div className="relative flex justify-between items-start border-b-4 border-emerald-100 pb-6">
                 <div>
                    <p className="text-emerald-600 text-[10px] font-black uppercase tracking-wider mb-2">إيصال صرف مستحقات</p>
                    <h1 className="text-3xl font-black text-zinc-800 leading-tight">{currentDriver?.name}</h1>
                    <div className="flex gap-4 mt-2">
                      <p className="text-zinc-500 font-bold text-xs">كود السائق: <span className="text-zinc-900">{currentDriver?.code}</span></p>
                      <p className="text-zinc-500 font-bold text-xs">رقم الهاتف: <span className="text-zinc-900" dir="ltr">{currentDriver?.mobile || '---'}</span></p>
                    </div>
                 </div>
                 <div className="text-left">
                    <div className="bg-emerald-600 text-white px-5 py-2 rounded-2xl text-lg font-black shadow-lg shadow-emerald-100">{selectedMonth}</div>
                    <p className="text-[9px] text-zinc-400 mt-2 uppercase tracking-widest font-black">Settlement Receipt</p>
                 </div>
              </div>

              <div className="relative grid grid-cols-2 gap-4">
                 <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-100">
                    <p className="text-[9px] font-black text-zinc-400 mb-1 uppercase">المصنع / الخط</p>
                    <p className="font-bold text-zinc-800 text-sm">{currentDriver?.factory} / {currentDriver?.route}</p>
                 </div>
                 <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-100">
                    <p className="text-[9px] font-black text-zinc-400 mb-1 uppercase">نوع السيارة</p>
                    <p className="font-bold text-zinc-800 text-sm">{currentDriver?.carType || "---"}</p>
                 </div>
              </div>

              <div className="relative">
                <div className="flex items-center gap-2 mb-4">
                  <div className="h-4 w-1 bg-emerald-600 rounded-full" />
                  <h3 className="text-xs font-black text-zinc-800 uppercase tracking-wider">تفصيل ورديات العمل</h3>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-zinc-400 border-b border-zinc-100">
                      <th className="text-right py-3 font-black uppercase text-[10px]">البيان والتاريخ</th>
                      <th className="text-center py-3 font-black uppercase text-[10px]">العدد</th>
                      <th className="text-center py-3 font-black uppercase text-[10px]">السعر</th>
                      <th className="text-left py-3 font-black uppercase text-[10px]">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                    {(currentJobRecord?.items || []).map((item, i) => (
                      <tr key={i} className="text-zinc-700">
                        <td className="py-3">
                          <p className="font-black text-zinc-800">{item.description}</p>
                          {item.date && <p className="text-[9px] text-zinc-400 font-bold">{new Date(item.date).toLocaleDateString('ar-EG')}</p>}
                        </td>
                        <td className="text-center font-bold text-zinc-600">{item.rounds}</td>
                        <td className="text-center font-bold text-zinc-600">{item.price}</td>
                        <td className="text-left font-black text-emerald-700">{item.rounds * item.price}</td>
                      </tr>
                    ))}
                    <tr className="bg-emerald-50/50 font-black text-emerald-800">
                       <td colSpan={3} className="py-3 px-4 rounded-r-2xl">إجمالي بنود الشغل</td>
                       <td className="text-left py-3 px-4 rounded-l-2xl">{(currentJobRecord?.totalWork || 0).toLocaleString()} <span className="text-[10px] font-bold">ج.م</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="relative grid grid-cols-2 gap-8 pt-4">
                <div className="space-y-4">
                   <div className="flex items-center gap-2">
                      <div className="h-4 w-1 bg-orange-500 rounded-full" />
                      <h3 className="text-xs font-black text-zinc-800 uppercase tracking-wider">الخصومات والسلف</h3>
                   </div>
                   <div className="space-y-2">
                      {(currentJobRecord?.deductions || []).map((d, i) => (
                        <div key={i} className="flex justify-between items-center bg-zinc-50 px-3 py-2 rounded-xl">
                          <div>
                            <p className="text-[10px] font-black text-zinc-800">{d.type}</p>
                            <p className="text-[8px] text-zinc-400 font-bold">{d.date}</p>
                          </div>
                          <span className="text-xs font-black text-orange-600">-{d.amount}</span>
                        </div>
                      ))}
                      {(!currentJobRecord?.deductions || currentJobRecord.deductions.length === 0) && (
                        <p className="text-[10px] text-zinc-300 italic font-bold">لا يوجد خصومات</p>
                      )}
                      <div className="border-t-2 border-orange-100 pt-2 font-black flex justify-between text-orange-600 text-xs">
                         <span>إجمالي المستقطع</span>
                         <span>-{currentJobRecord?.totalDeductions || 0} ج.م</span>
                      </div>
                   </div>
                </div>
                <div className="bg-emerald-600 rounded-[32px] p-6 flex flex-col justify-center items-center text-white shadow-2xl shadow-emerald-200">
                   <p className="text-[10px] font-black text-emerald-100 uppercase mb-2 tracking-widest">صافي القبض</p>
                   <div className="flex items-baseline gap-1">
                      <p className="text-5xl font-black tracking-tighter">{(currentJobRecord?.netPay || 0).toLocaleString()}</p>
                      <span className="text-xs font-bold opacity-80">ج.م</span>
                   </div>
                   <div className="mt-4 bg-white/20 px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest">Confirmed & Valid</div>
                </div>
              </div>

              <div className="relative pt-8 border-t border-dashed border-zinc-200 flex justify-between items-center text-zinc-400">
                <p className="text-[9px] font-bold">تاريخ التقرير: {new Date().toLocaleDateString('ar-EG')}</p>
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-600/50">DriverPay Manager</p>
              </div>
           </div>
        </div>
      </div>

      {/* Add Driver Modal */}
      <AnimatePresence>
        {showAddForm && (
          <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowAddForm(false);
                setEditingDriverId(null);
              }}
              className="fixed inset-0 bg-zinc-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl w-full max-w-xl p-6 sm:p-8 relative z-10 shadow-2xl max-h-[90vh] overflow-y-auto font-sans my-auto pb-20 sm:pb-8"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-black text-zinc-800">{editingDriverId ? 'تعديل بيانات السائق' : 'إضافة سائق جديد'}</h2>
                <button onClick={() => {
                  setShowAddForm(false);
                  setEditingDriverId(null);
                }}><X className="w-5 h-5 text-zinc-400" /></button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Manual Section */}
                <div className="space-y-4">
                  <h3 className="text-sm font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-lg inline-block">البيانات الأساسية</h3>
                  <form onSubmit={handleAddDriver} className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-zinc-400 uppercase">الكود</label>
                        <input 
                          required 
                          name="code" 
                          defaultValue={editingDriverId ? currentDriver?.code : nextSuggestedCode} 
                          placeholder={`اقتراح: ${nextSuggestedCode}`}
                          className="w-full bg-zinc-50 border-zinc-200 rounded-xl py-2 text-sm font-bold focus:ring-emerald-500" 
                          onFocus={(e) => e.target.select()}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-zinc-400 uppercase">الاسم</label>
                        <input required name="name" defaultValue={editingDriverId ? currentDriver?.name : ''} className="w-full bg-zinc-50 border-zinc-200 rounded-xl py-2 text-sm font-bold focus:ring-emerald-500" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-zinc-400 uppercase">الخط</label>
                      <input name="route" defaultValue={editingDriverId ? currentDriver?.route : ''} className="w-full bg-zinc-50 border-zinc-200 rounded-xl py-2 text-sm font-bold focus:ring-emerald-500" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-zinc-400 uppercase">المصنع</label>
                      <input 
                        name="factory" 
                        list="factory-suggestions"
                        defaultValue={editingDriverId ? currentDriver?.factory : ''} 
                        className="w-full bg-zinc-50 border-zinc-200 rounded-xl py-2 text-sm font-bold focus:ring-emerald-500" 
                      />
                      <datalist id="factory-suggestions">
                        {Array.from(new Set(drivers.map(d => d.factory))).filter(Boolean).sort().map(f => (
                          <option key={f} value={f} />
                        ))}
                      </datalist>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-zinc-400 uppercase">نوع السيارة</label>
                      <input name="carType" defaultValue={editingDriverId ? currentDriver?.carType : ''} className="w-full bg-zinc-50 border-zinc-200 rounded-xl py-2 text-sm font-bold focus:ring-emerald-500" placeholder="مثال: جامبو مكشوف" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-zinc-400 uppercase">رقم الموبايل (11 رقم)</label>
                      <input 
                        name="mobile" 
                        maxLength={11} 
                        defaultValue={editingDriverId ? currentDriver?.mobile : ''} 
                        className="w-full bg-zinc-50 border-zinc-200 rounded-xl py-2 text-sm font-bold focus:ring-emerald-500" 
                        placeholder="مثال: 01012345678" 
                        onFocus={(e) => e.target.select()}
                      />
                    </div>
                    <button type="submit" className="w-full bg-emerald-600 text-white py-3 rounded-xl font-black mt-2 shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition-all">حفظ البيانات</button>
                  </form>
                </div>

                {/* Import Section - Only show on Add */}
                {!editingDriverId && (
                  <div className="space-y-4">
                    <h3 className="text-sm font-black text-zinc-600 bg-zinc-100 px-3 py-1 rounded-lg inline-block">نسخ من إكسل</h3>
                    <p className="text-[10px] text-zinc-400 font-bold">انسخ البيانات من إكسل بالترتيب (الكود - الاسم - الخط - المصنع - نوع السيارة - الموبايل)</p>
                    <textarea 
                      className="w-full h-48 bg-zinc-50 border-zinc-200 rounded-xl p-3 text-[10px] font-mono focus:ring-emerald-500"
                      placeholder="Code	Name	Route	Factory	CarType	Mobile..."
                      onPaste={(e) => {
                        e.preventDefault();
                        handleImportExcel(e.clipboardData.getData('text'));
                      }}
                    />
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}

        {showReports && (
          <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowReports(false)}
              className="fixed inset-0 bg-zinc-900/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              className="bg-white rounded-[40px] w-full max-w-4xl p-6 sm:p-10 relative z-10 shadow-2xl my-auto flex flex-col max-h-[90vh]"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                  <div className="bg-blue-600 p-3 rounded-2xl shadow-lg shadow-blue-100">
                    <BarChart3 className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-zinc-800">تقارير الشهر</h2>
                    <p className="text-zinc-500 text-xs font-bold leading-none mt-1">مركز التحكم في الإيرادات والمصروفات</p>
                  </div>
                </div>
                <button onClick={() => setShowReports(false)} className="p-3 hover:bg-zinc-100 rounded-2xl transition-colors">
                  <X className="w-6 h-6 text-zinc-400" />
                </button>
              </div>

              <div className="flex items-center gap-4 mb-8 bg-zinc-50 p-4 rounded-3xl border border-zinc-100">
                <div className="flex-1">
                  <label className="block text-[10px] font-black text-zinc-400 mb-1 mr-2">تحديد الشهر</label>
                  <input 
                    type="month" 
                    className="w-full bg-white border-none rounded-2xl py-3 px-4 font-black text-sm shadow-sm focus:ring-2 focus:ring-blue-500"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-[10px] font-black text-zinc-400 mb-1 mr-2">تصفية حسب المصنع</label>
                  <select 
                    className="w-full bg-white border-none rounded-2xl py-3 px-4 font-black text-sm shadow-sm focus:ring-2 focus:ring-blue-500"
                    value={factoryFilter}
                    onChange={(e) => setFactoryFilter(e.target.value)}
                  >
                    <option value="">كل المصانع</option>
                    {Array.from(new Set(drivers.map(d => d.factory))).filter(Boolean).map(f => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto pr-1 no-scrollbar space-y-8">
                {/* Stats Cards */}
                <ReportsStats drivers={drivers} selectedMonth={selectedMonth} factoryFilter={factoryFilter} />

                {/* Factory Summaries */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white border border-zinc-100 rounded-[32px] p-6 shadow-sm">
                    <h3 className="text-sm font-black text-zinc-800 mb-4 flex items-center gap-2">
                       <Filter className="w-4 h-4 text-blue-500" /> اجمالي المصانع
                    </h3>
                    <FactoryBreakdown drivers={drivers} selectedMonth={selectedMonth} />
                  </div>
                  <div className="bg-white border border-zinc-100 rounded-[32px] p-6 shadow-sm">
                    <h3 className="text-sm font-black text-zinc-800 mb-4 flex items-center gap-2">
                       <Users className="w-4 h-4 text-blue-500" /> أكثر السائقين عملاً
                    </h3>
                    <TopDrivers drivers={drivers} selectedMonth={selectedMonth} />
                  </div>
                </div>

                {/* Detailed Driver Balances */}
                <div className="bg-white border border-zinc-100 rounded-[32px] overflow-hidden shadow-sm">
                  <div className="bg-zinc-50 px-6 py-4 border-b border-zinc-100">
                    <h3 className="text-sm font-black text-zinc-800">بيان تفصيلي بجميع السائقين</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <DriverReportsTable drivers={drivers} selectedMonth={selectedMonth} factoryFilter={factoryFilter} />
                  </div>
                </div>
              </div>
              
              <div className="mt-8 pt-6 border-t border-zinc-100 flex justify-end">
                <button 
                  onClick={handleExportMonthlyReport}
                  className="px-10 py-4 ml-4 bg-emerald-600 text-white rounded-2xl font-bold shadow-xl shadow-emerald-100 hover:bg-emerald-700 transition-all flex items-center gap-2"
                >
                  <Download className="w-5 h-5" />
                  تحميل إكسل
                </button>
                <button 
                  onClick={() => setShowReports(false)}
                  className="px-10 py-4 bg-zinc-900 text-white rounded-2xl font-bold shadow-xl shadow-zinc-200 hover:bg-black transition-all"
                >
                  إغلاق نافذة التقارير
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showSettings && (
          <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSettings(false)}
              className="fixed inset-0 bg-zinc-900/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white rounded-[40px] w-full max-w-md p-6 sm:p-8 relative z-10 shadow-2xl my-auto"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3 text-emerald-600 font-black text-xl">
                  <Settings className="w-6 h-6" />
                  إعدادات النظام
                </div>
                <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-zinc-100 rounded-full transition-colors"><X className="w-5 h-5 text-zinc-400" /></button>
              </div>

              <div className="space-y-4">
                <div className="bg-zinc-50 p-4 rounded-3xl border border-zinc-100">
                  <h3 className="text-xs font-black text-zinc-400 mb-4 uppercase tracking-wider">النسخ الاحتياطي</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <button 
                      onClick={handleExportData}
                      className="flex flex-col items-center gap-2 p-4 bg-white border border-zinc-200 rounded-2xl hover:border-emerald-200 hover:text-emerald-600 transition-all text-sm font-bold"
                    >
                      <HardDriveDownload className="w-6 h-6 opacity-40" />
                      تصدير البيانات
                    </button>
                    <label className="flex flex-col items-center gap-2 p-4 bg-white border border-zinc-200 rounded-2xl hover:border-emerald-200 hover:text-emerald-600 transition-all text-sm font-bold cursor-pointer">
                      <input type="file" className="hidden" accept=".json" onChange={handleImportData} />
                      <HardDriveUpload className="w-6 h-6 opacity-40" />
                      استرداد البيانات
                    </label>
                  </div>
                </div>

                <div className="bg-zinc-50 p-4 rounded-3xl border border-zinc-100">
                  <h3 className="text-xs font-black text-zinc-400 mb-4 uppercase tracking-wider">تفضيلات العرض</h3>
                  <div className="space-y-4">
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-bold text-zinc-600">الشهر الافتراضي عند الفتح</label>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => handleUpdateDefaultMonth('current')}
                          className={cn(
                            "flex-1 py-2 px-3 rounded-xl text-[10px] font-bold border transition-all",
                            defaultMonthMode === 'current' 
                              ? "bg-emerald-600 text-white border-emerald-600 shadow-lg shadow-emerald-100" 
                              : "bg-white text-zinc-500 border-zinc-100 hover:bg-zinc-50"
                          )}
                        >
                          الشهر الحالي تلقائياً
                        </button>
                        <button 
                          onClick={() => handleUpdateDefaultMonth('custom', selectedMonth)}
                          className={cn(
                            "flex-1 py-2 px-3 rounded-xl text-[10px] font-bold border transition-all",
                            defaultMonthMode === 'custom' 
                              ? "bg-emerald-600 text-white border-emerald-600 shadow-lg shadow-emerald-100" 
                              : "bg-white text-zinc-500 border-zinc-100 hover:bg-zinc-50"
                          )}
                        >
                          تحديد شهر ثابت
                        </button>
                      </div>
                    </div>
                    {defaultMonthMode === 'custom' && (
                      <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-top-2">
                        <label className="text-[10px] font-bold text-zinc-400">اختر الشهر الذي تريده افتراضياً:</label>
                        <input 
                          type="month" 
                          className="bg-white border-zinc-100 rounded-xl text-xs font-bold py-2 px-3"
                          value={localStorage.getItem('defaultMonthSetting') || selectedMonth}
                          onChange={(e) => handleUpdateDefaultMonth('custom', e.target.value)}
                        />
                        <p className="text-[9px] text-emerald-600 font-bold">سيفتح التطبيق دائماً على {localStorage.getItem('defaultMonthSetting')} حتى يتم تغييره.</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-4 bg-orange-50 rounded-3xl border border-orange-100">
                  <p className="text-[10px] text-orange-700 leading-relaxed font-bold">
                    ⚠️ تنبيه: استيراد ملف بيانات خارجي قد يؤدي إلى تكرار السائقين أو الكتابة فوق البيانات الحالية بطريقة غير قابلة للتراجع. تأكد من جودة الملف قبل الرفع.
                  </p>
                </div>
              </div>
              
              <button 
                onClick={() => setShowSettings(false)}
                className="w-full mt-6 py-4 bg-zinc-900 text-white rounded-2xl font-bold shadow-xl shadow-zinc-200 hover:bg-black transition-all"
              >
                إغلاق
              </button>
            </motion.div>
          </div>
        )}

        {showDriverSelector && (
          <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDriverSelector(false)}
              className="fixed inset-0 bg-zinc-900/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              className="bg-white rounded-[40px] w-full max-w-lg p-6 sm:p-8 relative z-10 shadow-2xl my-auto flex flex-col"
            >
              <div className="w-12 h-1.5 bg-zinc-200 rounded-full mx-auto mb-6 sm:hidden" />
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-black text-zinc-800">اختر السائق</h2>
                <button onClick={() => setShowDriverSelector(false)} className="p-2"><X className="w-5 h-5" /></button>
              </div>

              <div className="flex gap-2 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                  <input 
                    type="text" 
                    autoFocus
                    placeholder="ابحث بالاسم أو الكود..." 
                    className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-2xl py-3 pr-10 pl-4 text-sm font-bold focus:ring-emerald-500 transition-all focus:bg-white"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <div className="relative w-32">
                  <Filter className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-blue-500" />
                  <select 
                    className="w-full bg-white border-2 border-zinc-100 rounded-2xl py-3 pr-8 pl-2 text-[10px] font-black appearance-none focus:ring-blue-500"
                    value={factoryFilter}
                    onChange={(e) => setFactoryFilter(e.target.value)}
                  >
                    <option value="">كل المصانع</option>
                    {Array.from(new Set(drivers.map(d => d.factory))).filter(Boolean).map(f => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex bg-zinc-100 p-1 rounded-xl mb-4">
                 <button 
                  onClick={() => setSidebarTab('active')}
                  className={cn("flex-1 py-2 text-xs font-bold rounded-lg transition-all", sidebarTab === 'active' ? "bg-white text-emerald-600 shadow-sm" : "text-zinc-500")}
                 >النشطين</button>
                 <button 
                  onClick={() => setSidebarTab('retired')}
                  className={cn("flex-1 py-2 text-xs font-bold rounded-lg transition-all", sidebarTab === 'retired' ? "bg-white text-orange-600 shadow-sm" : "text-zinc-500")}
                 >المتوقفين</button>
              </div>

              <div className="overflow-y-auto flex-1 space-y-2 pr-1 no-scrollbar text-right">
                {currentDriverList.length === 0 ? (
                  <div className="py-10 text-center text-zinc-400 italic text-sm">لا يوجد نتائج</div>
                ) : (
                  currentDriverList.map((driver) => {
                    const globalIndex = filteredDrivers.findIndex(d => d.id === driver.id);
                    return (
                      <button
                        key={driver.id}
                        onClick={() => {
                          setSelectedDriverId(driver.id);
                          setShowDriverSelector(false);
                          setSearchQuery(''); // Reset search after selection
                        }}
                        className={cn(
                          "w-full text-right p-4 rounded-3xl transition-all border flex items-center justify-between group",
                          currentDriver?.id === driver.id 
                            ? "bg-emerald-600 border-emerald-600 text-white shadow-lg shadow-emerald-200" 
                            : "bg-white border-zinc-100 hover:border-zinc-300 text-zinc-700"
                        )}
                      >
                        <div className="flex-1">
                          <p className="font-black text-sm">{driver.name}</p>
                          <p className={cn("text-[10px] font-bold", currentDriver?.id === driver.id ? "text-emerald-100" : "text-zinc-400")}>كود: {driver.code} • {driver.factory}</p>
                        </div>
                        {driver.notes && <StickyNote className={cn("w-4 h-4", currentDriver?.id === driver.id ? "text-emerald-200" : "text-orange-400")} />}
                      </button>
                    );
                  })
                )}
              </div>
            </motion.div>
          </div>
        )}

        {confirmDelete && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmDelete(null)}
              className="fixed inset-0 bg-zinc-900/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[32px] w-full max-w-sm p-8 relative z-10 shadow-2xl text-center"
            >
              <div className="bg-red-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
                <Trash2 className="w-8 h-8 text-red-600" />
              </div>
              <h3 className="text-xl font-black text-zinc-800 mb-2">{confirmDelete.title}</h3>
              <p className="text-zinc-500 text-sm mb-8 leading-relaxed">
                {confirmDelete.message}
              </p>
              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => setConfirmDelete(null)}
                  className="py-4 bg-zinc-100 text-zinc-600 rounded-2xl font-bold hover:bg-zinc-200 transition-all"
                >
                  تراجع
                </button>
                <button 
                  onClick={handleDeleteAction}
                  className="py-4 bg-red-600 text-white rounded-2xl font-bold shadow-lg shadow-red-100 hover:bg-red-700 transition-all"
                >
                  تأكيد الحذف
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}

function SectionBox({ 
  title, 
  icon, 
  items, 
  onAdd, 
  onUpdate, 
  onRemove, 
  renderItem,
  accentColor = 'zinc'
}: { 
  title: string, 
  icon: React.ReactNode, 
  items: any[], 
  onAdd: () => void,
  onUpdate: (idx: number, field: string, val: any) => void,
  onRemove: (idx: number) => void,
  renderItem: (item: any, idx: number, update: any, remove: any) => React.ReactNode,
  accentColor?: 'zinc' | 'emerald' | 'orange'
}) {
  const accentClasses = {
    zinc: "bg-zinc-50 text-zinc-600",
    emerald: "bg-emerald-50 text-emerald-700",
    orange: "bg-orange-50 text-orange-700"
  };

  return (
    <div className="bg-white border border-zinc-100 rounded-2xl overflow-hidden shadow-sm">
      <div className={cn("px-4 py-3 flex items-center justify-between", accentClasses[accentColor])}>
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-bold">{title}</span>
        </div>
        <button onClick={onAdd} className="bg-white/50 hover:bg-white p-1 rounded-lg transition-colors">
          <Plus className="w-4 h-4" />
        </button>
      </div>
      <div className="p-4 space-y-3 min-h-[100px]">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-zinc-300 gap-2">
            <Filter className={cn("w-6 h-6 opacity-20", accentColor === 'emerald' ? 'text-emerald-500' : accentColor === 'orange' ? 'text-orange-500' : 'text-zinc-500')} />
            <span className="text-[10px] font-bold">لا يوجد بيانات مضافة</span>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {items.map((item, idx) => renderItem(item, idx, onUpdate, onRemove))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

// Reports Components
function useMonthlyData(selectedMonth: string) {
  const [records, setRecords] = useState<JobRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'jobRecords'), where('month', '==', selectedMonth));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setRecords(snapshot.docs.map(doc => doc.data() as JobRecord));
      setLoading(false);
    });
    return unsubscribe;
  }, [selectedMonth]);

  return { records, loading };
}

function ReportsStats({ drivers, selectedMonth, factoryFilter }: { drivers: Driver[], selectedMonth: string, factoryFilter: string }) {
  const { records } = useMonthlyData(selectedMonth);

  const stats = useMemo(() => {
    let filteredRecords = records;
    if (factoryFilter) {
      const factoryDriverIds = drivers.filter(d => d.factory === factoryFilter).map(d => d.id);
      filteredRecords = records.filter(r => factoryDriverIds.includes(r.driverId));
    }

    const totalGross = filteredRecords.reduce((acc, r) => acc + (r.items?.reduce((sum, item) => sum + (item.rounds * item.price), 0) || 0), 0);
    const totalDeds = filteredRecords.reduce((acc, r) => acc + (r.deductions?.reduce((sum, item) => sum + item.amount, 0) || 0), 0);

    return { totalGross, totalDeds, net: totalGross - totalDeds };
  }, [records, drivers, factoryFilter]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div className="bg-emerald-600 p-6 rounded-[32px] text-white shadow-xl shadow-emerald-100">
        <p className="text-emerald-100 text-[10px] font-black uppercase tracking-widest mb-1">إجمالي العمل</p>
        <h4 className="text-3xl font-black">{stats.totalGross.toLocaleString()} <span className="text-xs font-bold opacity-60">ج.م</span></h4>
      </div>
      <div className="bg-orange-500 p-6 rounded-[32px] text-white shadow-xl shadow-orange-100">
        <p className="text-orange-100 text-[10px] font-black uppercase tracking-widest mb-1">إجمالي الخصومات</p>
        <h4 className="text-3xl font-black">{stats.totalDeds.toLocaleString()} <span className="text-xs font-bold opacity-60">ج.م</span></h4>
      </div>
      <div className="bg-zinc-900 p-6 rounded-[32px] text-white shadow-xl shadow-zinc-200">
        <p className="text-zinc-400 text-[10px] font-black uppercase tracking-widest mb-1">صافي القبض</p>
        <h4 className="text-3xl font-black text-emerald-400">{stats.net.toLocaleString()} <span className="text-xs font-bold opacity-60">ج.م</span></h4>
      </div>
    </div>
  );
}

function FactoryBreakdown({ drivers, selectedMonth }: { drivers: Driver[], selectedMonth: string }) {
  const { records } = useMonthlyData(selectedMonth);

  const factoryData = useMemo(() => {
    const factories: Record<string, number> = {};
    records.forEach(r => {
      const driver = drivers.find(d => d.id === r.driverId);
      if (driver && driver.factory) {
        const total = (r.items?.reduce((sum, item) => sum + (item.rounds * item.price), 0) || 0);
        factories[driver.factory] = (factories[driver.factory] || 0) + total;
      }
    });
    return Object.entries(factories).sort((a, b) => b[1] - a[1]);
  }, [records, drivers]);

  return (
    <div className="space-y-3">
      {factoryData.length === 0 ? (
        <div className="text-center py-6 text-zinc-400 text-xs italic">لا توجد بيانات للمصانع هذا الشهر</div>
      ) : (
        factoryData.map(([factory, total]) => (
          <div key={factory} className="flex justify-between items-center p-3 bg-zinc-50 rounded-2xl">
            <span className="text-xs font-black text-zinc-600">{factory}</span>
            <span className="text-xs font-black text-zinc-900">{total.toLocaleString()} ج.م</span>
          </div>
        ))
      )}
    </div>
  );
}

function TopDrivers({ drivers, selectedMonth }: { drivers: Driver[], selectedMonth: string }) {
  const { records } = useMonthlyData(selectedMonth);

  const topDrivers = useMemo(() => {
    return records
      .map(r => {
        const driver = drivers.find(d => d.id === r.driverId);
        const total = (r.items?.reduce((sum, item) => sum + (item.rounds * item.price), 0) || 0);
        return { name: driver?.name || 'مجهول', factory: driver?.factory, total };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [records, drivers]);

  return (
    <div className="space-y-3">
      {topDrivers.length === 0 ? (
        <div className="text-center py-6 text-zinc-400 text-xs italic">لا توجد بيانات ضائعة</div>
      ) : (
        topDrivers.map((d, i) => (
          <div key={i} className="flex items-center gap-3 p-3 bg-zinc-50 rounded-2xl">
            <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-black">#{i+1}</div>
            <div className="flex-1">
              <p className="text-xs font-black text-zinc-800">{d.name}</p>
              <p className="text-[10px] font-bold text-zinc-400">{d.factory}</p>
            </div>
            <span className="text-xs font-black text-emerald-600">{d.total.toLocaleString()}</span>
          </div>
        ))
      )}
    </div>
  );
}

function DriverReportsTable({ drivers, selectedMonth, factoryFilter }: { drivers: Driver[], selectedMonth: string, factoryFilter: string }) {
  const { records } = useMonthlyData(selectedMonth);

  const tableData = useMemo(() => {
    return drivers
      .filter(d => !factoryFilter || d.factory === factoryFilter)
      .map(driver => {
        const record = records.find(r => r.driverId === driver.id);
        const workTotal = record?.items?.reduce((sum, item) => sum + (item.rounds * item.price), 0) || 0;
        const dedsTotal = record?.deductions?.reduce((sum, item) => sum + item.amount, 0) || 0;
        return {
          id: driver.id,
          code: driver.code,
          name: driver.name,
          factory: driver.factory,
          work: workTotal,
          deds: dedsTotal,
          net: workTotal - dedsTotal,
          items: record?.items || []
        };
      })
      .filter(d => d.work > 0 || d.deds > 0)
      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  }, [drivers, records, factoryFilter]);

  if (tableData.length === 0) {
    return <div className="p-10 text-center text-zinc-400 text-sm font-bold">لا توجد بيانات لهذا الشهر</div>;
  }

  return (
    <table className="w-full text-right border-collapse">
      <thead>
        <tr className="bg-zinc-50">
          <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase">كود</th>
          <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase text-right">السائق</th>
          <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase">المصنع</th>
          <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase text-center">إجمالي العمل</th>
          <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase text-center">الخصومات</th>
          <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase text-center bg-blue-50/50">الصافي المتبقي</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-zinc-100">
        {tableData.map((row) => (
          <tr key={row.id} className="hover:bg-zinc-50/50 transition-colors">
            <td className="px-6 py-4 text-xs font-black text-zinc-400">{row.code}</td>
            <td className="px-6 py-4 text-xs font-black text-zinc-800">
              {row.name}
              {row.items.length > 0 && (
                <div className="mt-1 space-y-0.5">
                  {row.items.map((item, i) => (
                    <p key={i} className="text-[9px] text-zinc-400 font-bold leading-tight">
                      • {item.description} <span dir="ltr">({item.rounds} × {item.price})</span>
                    </p>
                  ))}
                </div>
              )}
            </td>
            <td className="px-6 py-4 text-[10px] font-bold text-zinc-500">{row.factory}</td>
            <td className="px-6 py-4 text-xs font-black text-zinc-700 text-center">{row.work.toLocaleString()}</td>
            <td className="px-6 py-4 text-xs font-black text-orange-600 text-center">{row.deds.toLocaleString()}</td>
            <td className="px-6 py-4 text-sm font-black text-blue-600 text-center bg-blue-50/20">{row.net.toLocaleString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function NumericInput({ 
  value, 
  onChange, 
  className 
}: { 
  value: number, 
  onChange: (val: number) => void, 
  className?: string 
}) {
  const [localVal, setLocalVal] = useState<string>(value === 0 ? '' : value.toString());
  const inputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setLocalVal(value === 0 ? '' : value.toString());
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === '' || /^[0-9]*\.?[0-9]*$/.test(val)) {
      setLocalVal(val);
      if (val !== '' && !val.endsWith('.')) {
        const parsed = parseFloat(val);
        if (!isNaN(parsed)) {
          onChange(parsed);
        }
      } else if (val === '') {
        onChange(0);
      }
    }
  };

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      lang="en"
      className={cn(className, "text-center")}
      value={localVal}
      onChange={handleChange}
      onFocus={(e) => e.target.select()}
      onBlur={() => {
        setLocalVal(value === 0 ? '' : value.toString());
      }}
    />
  );
}
