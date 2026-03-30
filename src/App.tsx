/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Component, useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  Search, 
  Filter, 
  Trash2, 
  Edit2, 
  Calculator, 
  History, 
  ChevronRight, 
  ChevronDown,
  X,
  Save,
  AlertCircle,
  CheckCircle2,
  TrendingUp,
  Building2,
  Package,
  DollarSign,
  FileText,
  Printer,
  ArrowLeft,
  CheckSquare,
  Square,
  Check,
  Download,
  Upload,
  Camera,
  Loader2,
  Settings
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Type } from "@google/genai";
import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  onSnapshot, 
  query, 
  orderBy,
  getDocFromServer
} from 'firebase/firestore';
import XLSX from 'xlsx-js-style';
import { db } from './firebase';

// --- Types ---

interface EngineeringItem {
  id: string;
  name: string;
  unit: string;
  unitPrice: number;
  category: string;
  vendor?: string;
  date: string; // System creation date
  quoteDate: string; // User-specified quote date
  remarks?: string;
  // New fields for precision
  originalUnit: string;
  originalPrice: number;
  unitPrices: Record<string, number>;
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

// --- Helpers ---

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Components ---

const CATEGORIES = [
  '天花板工程',
  '地板工程',
  '牆面工程',
  '水電工程',
  '空調工程',
  '木作工程',
  '油漆工程',
  '拆除工程',
  '清潔工程',
  '其他'
];

const UNIT_GROUPS: Record<string, string[]> = {
  '面積': ['坪', 'm²', '才', 'cm²'],
  '長度': ['公尺', '公分'],
  '重量': ['公斤', '噸'],
  '數量': ['式', '個', '組']
};

const UNIT_CONVERSIONS: Record<string, number> = {
  '坪': 1,
  'm²': 0.3025,
  '才': 1/36,
  'cm²': 1/33058,
  '公尺': 1,
  '公分': 0.01,
  '公斤': 1,
  '噸': 1000
};

const UNITS = Array.from(new Set(Object.values(UNIT_GROUPS).flat()));

export default function App() {
  return (
    <MainApp />
  );
}

// --- Quote View Component ---

function QuoteView({ selectedItems, onBack }: { selectedItems: EngineeringItem[], onBack: () => void }) {
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [clientName, setClientName] = useState('');
  const [quoteNumber, setQuoteNumber] = useState(`Q-${new Date().getFullYear()}${(new Date().getMonth() + 1).toString().padStart(2, '0')}${new Date().getDate().toString().padStart(2, '0')}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`);

  const subtotal = useMemo(() => {
    return selectedItems.reduce((acc, item) => {
      const qty = parseFloat(quantities[item.id] || '0');
      return acc + (item.unitPrice * (isNaN(qty) ? 0 : qty));
    }, 0);
  }, [selectedItems, quantities]);

  const tax = Math.round(subtotal * 0.05);
  const total = subtotal + tax;

  const handlePrint = () => {
    window.print();
  };

  const handleExportExcel = () => {
    const borderStyle = {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' }
    };

    // Header information with better structure
    const header = [
      [{ v: '報價單 (Quotation)', s: { font: { bold: true, sz: 20 }, alignment: { horizontal: 'center' } } }],
      [''],
      [
        { v: '報價單編號:', s: { font: { bold: true }, border: borderStyle } }, 
        { v: quoteNumber, s: { border: borderStyle } }, 
        { v: '', s: { border: borderStyle } }, 
        { v: '', s: { border: borderStyle } }, 
        { v: '日期:', s: { font: { bold: true }, border: borderStyle } }, 
        { v: new Date().toLocaleDateString('zh-TW'), s: { border: borderStyle } }
      ],
      [
        { v: '客戶名稱:', s: { font: { bold: true }, border: borderStyle } }, 
        { v: clientName || '未填寫', s: { border: borderStyle } },
        { v: '', s: { border: borderStyle } },
        { v: '', s: { border: borderStyle } },
        { v: '', s: { border: borderStyle } },
        { v: '', s: { border: borderStyle } }
      ],
      [''],
      ['項目名稱', '類別', '單價', '數量', '單位', '小計'].map(v => ({
        v, s: { font: { bold: true }, fill: { fgColor: { rgb: "F3F4F6" } }, border: borderStyle, alignment: { horizontal: 'center' } }
      }))
    ];

    const rows = selectedItems.map(item => {
      const qty = parseFloat(quantities[item.id] || '0');
      const row = [
        { v: item.name, s: { border: borderStyle } },
        { v: item.category, s: { border: borderStyle, alignment: { horizontal: 'center' } } },
        { v: item.unitPrice, s: { border: borderStyle, numFmt: '#,##0' } },
        { v: isNaN(qty) ? 0 : qty, s: { border: borderStyle, alignment: { horizontal: 'center' } } },
        { v: item.unit, s: { border: borderStyle, alignment: { horizontal: 'center' } } },
        { v: item.unitPrice * (isNaN(qty) ? 0 : qty), s: { border: borderStyle, numFmt: '#,##0', font: { bold: true } } }
      ];
      return row;
    });

    const footer = [
      [''],
      ['', '', '', '', { v: '合計 (Subtotal)', s: { font: { bold: true } } }, { v: subtotal, s: { font: { bold: true }, numFmt: '#,##0' } }],
      ['', '', '', '', { v: '稅金 (VAT 5%)', s: { font: { bold: true } } }, { v: tax, s: { font: { bold: true }, numFmt: '#,##0' } }],
      ['', '', '', '', { v: '總計 (Total)', s: { font: { bold: true, sz: 14 } } }, { v: total, s: { font: { bold: true, sz: 14 }, numFmt: '#,##0' } }],
      [''],
      [{ v: '備註: 感謝您的洽詢，本報價單有效期限為 30 天。', s: { font: { italic: true, color: { rgb: "888888" } } } }]
    ];

    const ws = XLSX.utils.aoa_to_sheet([...header, ...rows, ...footer]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "報價單");
    
    // Merge cells for title
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } } // Title
    ];

    // Styling/Sizing
    const colWidths = [
      { wch: 40 }, { wch: 15 }, { wch: 12 }, { wch: 10 }, { wch: 8 }, { wch: 15 }
    ];
    ws['!cols'] = colWidths;

    // A4 Print Setup
    ws['!pageSetup'] = { paperSize: 9, orientation: 'portrait', fitToWidth: 1, fitToHeight: 0 };
    ws['!printOptions'] = { gridLines: false };

    XLSX.writeFile(wb, `報價單_${clientName || '未命名'}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans print:p-0">
      <style>
        {`
          @media print {
            @page {
              size: A4;
              margin: 15mm;
            }
            body {
              background: white !important;
              -webkit-print-color-adjust: exact;
            }
            #quote-document {
              width: 100% !important;
              max-width: none !important;
              padding: 0 !important;
              margin: 0 !important;
              box-shadow: none !important;
            }
            .print\\:hidden {
              display: none !important;
            }
          }
        `}
      </style>
      {/* Quote Header (Non-print) */}
      <div className="bg-gray-50 border-b border-gray-200 py-4 px-4 sticky top-0 z-30 print:hidden">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <button 
            onClick={onBack}
            className="flex items-center gap-2 text-gray-500 hover:text-black transition-colors font-medium self-start sm:self-auto"
          >
            <ArrowLeft size={20} />
            返回資料庫
          </button>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button 
              onClick={handleExportExcel}
              className="flex-1 sm:flex-none bg-white text-gray-700 border border-gray-200 px-4 py-2.5 rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors shadow-sm text-sm"
            >
              <FileText size={18} />
              匯出 Excel
            </button>
            <button 
              onClick={handlePrint}
              className="flex-1 sm:flex-none bg-black text-white px-4 py-2.5 rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-gray-800 transition-colors shadow-sm text-sm"
            >
              <Printer size={18} />
              列印
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-8 py-6 sm:py-12 print:py-0 print:px-0 print:max-w-none">
        {/* Quote Document */}
        <div id="quote-document" className="bg-white p-4 sm:p-8 print:p-0">
          <div className="flex flex-col sm:flex-row justify-between items-start gap-6 mb-8 sm:mb-12">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2 uppercase print:text-5xl">Quotation</h1>
              <p className="text-gray-400 font-mono text-xs sm:text-sm">報價單編號: {quoteNumber}</p>
            </div>
            <div className="text-left sm:text-right">
              <div className="font-bold text-lg sm:text-xl mb-1">工程報價系統</div>
              <div className="text-gray-500 text-xs sm:text-sm">
                日期: {new Date().toLocaleDateString('zh-TW')}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 sm:gap-12 mb-8 sm:mb-12">
            <div>
              <div className="text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">客戶資訊</div>
              <input 
                type="text" 
                placeholder="輸入客戶名稱..."
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className="w-full text-lg sm:text-xl font-medium border-b-2 border-gray-100 focus:border-black outline-none pb-1 transition-colors print:border-none print:p-0"
              />
            </div>
          </div>

          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 mb-8 sm:mb-12">
            <table className="w-full min-w-[600px] sm:min-w-0">
              <thead>
                <tr className="border-b-2 border-black">
                  <th className="py-4 text-left font-bold uppercase tracking-wider text-xs sm:text-sm">項目名稱</th>
                  <th className="py-4 text-right font-bold uppercase tracking-wider text-xs sm:text-sm">單價</th>
                  <th className="py-4 text-center font-bold uppercase tracking-wider text-xs sm:text-sm w-24 sm:w-32">數量</th>
                  <th className="py-4 text-center font-bold uppercase tracking-wider text-xs sm:text-sm">單位</th>
                  <th className="py-4 text-right font-bold uppercase tracking-wider text-xs sm:text-sm">小計</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {selectedItems.map((item) => {
                  const qty = parseFloat(quantities[item.id] || '0');
                  const itemSubtotal = item.unitPrice * (isNaN(qty) ? 0 : qty);
                  return (
                    <tr key={item.id}>
                      <td className="py-4 sm:py-6">
                        <div className="font-bold text-base sm:text-lg">{item.name}</div>
                        <div className="text-[10px] sm:text-sm text-gray-400 mt-1">{item.category}</div>
                      </td>
                      <td className="py-4 sm:py-6 text-right font-mono text-sm sm:text-base">
                        ${item.unitPrice.toLocaleString()}
                      </td>
                      <td className="py-4 sm:py-6 text-center">
                        <input 
                          type="number" 
                          min="0"
                          step="any"
                          value={quantities[item.id] || ''}
                          onChange={(e) => setQuantities({ ...quantities, [item.id]: e.target.value })}
                          className="w-16 sm:w-24 text-center border border-gray-200 rounded-lg py-1 focus:border-black outline-none transition-colors print:border-none text-sm"
                          placeholder="0"
                        />
                      </td>
                      <td className="py-4 sm:py-6 text-center text-gray-500 text-sm">
                        {item.unit}
                      </td>
                      <td className="py-4 sm:py-6 text-right font-bold font-mono text-sm sm:text-base">
                        ${itemSubtotal.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <div className="w-full sm:w-80">
              <div className="flex justify-between py-3 border-b border-gray-100 text-sm sm:text-base">
                <span className="text-gray-500">合計 (Subtotal)</span>
                <span className="font-mono font-medium">${subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-3 border-b border-gray-100 text-sm sm:text-base">
                <span className="text-gray-500">稅金 (VAT 5%)</span>
                <span className="font-mono font-medium">${tax.toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-6">
                <span className="text-lg sm:text-xl font-bold">總計 (Total)</span>
                <span className="text-xl sm:text-2xl font-bold font-mono text-black">
                  ${total.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-24 pt-12 border-t border-gray-100 text-center text-gray-400 text-sm">
            <p>感謝您的洽詢，本報價單有效期限為 30 天。</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function MainApp() {
  const [items, setItems] = useState<EngineeringItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('全部');
  const [isAdding, setIsAdding] = useState(false);
  const [editingItem, setEditingItem] = useState<EngineeringItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<string | null>(null);
  const [scannedItems, setScannedItems] = useState<any[]>([]);
  const [isReviewingScan, setIsReviewingScan] = useState(false);
  const [selectedScanIndices, setSelectedScanIndices] = useState<Set<number>>(new Set());
  const [editingScanIndex, setEditingScanIndex] = useState<number | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | string[] | null>(null);
  const [customApiKey, setCustomApiKey] = useState<string>(localStorage.getItem('gemini_api_key') || '');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Selection & View State
  const [view, setView] = useState<'database' | 'quote'>('database');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    unit: '坪',
    unitPrice: '',
    category: '天花板工程',
    vendor: '',
    quoteDate: new Date().toISOString().split('T')[0],
    remarks: ''
  });

  // Unit Conversion State
  const [isConverterOpen, setIsConverterOpen] = useState(false);
  const [converterMode, setConverterMode] = useState<'simple' | 'price'>('simple');
  const [conversionData, setConversionData] = useState({
    value: '',
    from: '坪',
    to: 'm²'
  });
  const [priceCalcData, setPriceCalcData] = useState({
    totalPrice: '',
    totalArea: '',
    unit: 'm²'
  });

  // --- Data ---

  useEffect(() => {
    setLoading(true);
    const q = query(
      collection(db, 'items'),
      orderBy('date', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newItems = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as EngineeringItem[];
      setItems(newItems);
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'items');
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();
  }, []);

  // --- Actions ---

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setError(null);
    const price = parseFloat(formData.unitPrice);
    if (isNaN(price) || price < 0) {
      setError('請輸入有效的單價。');
      return;
    }

    // Pre-calculate all prices in the same group to avoid rounding drift
    const currentUnit = formData.unit;
    const unitPrices: Record<string, number> = {};
    const group = Object.values(UNIT_GROUPS).find(g => g.includes(currentUnit)) || [currentUnit];
    
    group.forEach(u => {
      if (UNIT_CONVERSIONS[currentUnit] && UNIT_CONVERSIONS[u]) {
        // Price_U = Price_Current * (Ratio_U / Ratio_Current)
        const calculatedPrice = price * (UNIT_CONVERSIONS[u] / UNIT_CONVERSIONS[currentUnit]);
        unitPrices[u] = Math.round(calculatedPrice);
      } else {
        unitPrices[u] = price;
      }
    });

    try {
      const data = {
        ...formData,
        unitPrice: price,
        originalUnit: currentUnit,
        originalPrice: price,
        unitPrices,
        date: new Date().toISOString()
      };

      if (editingItem) {
        await updateDoc(doc(db, 'items', editingItem.id), data);
        setSuccess('更新成功！');
      } else {
        await addDoc(collection(db, 'items'), data);
        setSuccess('新增成功！');
      }

      setIsAdding(false);
      setEditingItem(null);
      setFormData({
        name: '',
        unit: '坪',
        unitPrice: '',
        category: '天花板工程',
        vendor: '',
        quoteDate: new Date().toISOString().split('T')[0],
        remarks: ''
      });

      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      handleFirestoreError(err, editingItem ? OperationType.UPDATE : OperationType.CREATE, 'items');
      setError('儲存失敗，請檢查網路。');
    }
  };

  const handleDelete = async (id: string | string[]) => {
    setDeleteConfirmId(id);
  };

  const confirmDelete = async () => {
    if (!deleteConfirmId) return;
    
    setLoading(true);
    try {
      if (Array.isArray(deleteConfirmId)) {
        for (const id of deleteConfirmId) {
          await deleteDoc(doc(db, 'items', id));
        }
        setSelectedIds(new Set());
        setSuccess(`成功刪除 ${deleteConfirmId.length} 筆資料！`);
      } else {
        await deleteDoc(doc(db, 'items', deleteConfirmId));
        setSuccess('刪除成功！');
      }
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'items');
      setError('刪除失敗。');
    } finally {
      setLoading(false);
      setDeleteConfirmId(null);
    }
  };

  const handleInlineUnitChange = async (item: EngineeringItem, newUnit: string) => {
    const oldUnit = item.unit;
    if (oldUnit === newUnit) return;

    // Use pre-calculated price if available to avoid rounding drift
    let finalPrice = item.unitPrice;
    if (item.unitPrices && item.unitPrices[newUnit] !== undefined) {
      finalPrice = item.unitPrices[newUnit];
    } else if (UNIT_CONVERSIONS[oldUnit] && UNIT_CONVERSIONS[newUnit]) {
      // Fallback to calculation if map is missing (for older records)
      finalPrice = Math.round(item.unitPrice * (UNIT_CONVERSIONS[newUnit] / UNIT_CONVERSIONS[oldUnit]));
    }

    try {
      await updateDoc(doc(db, 'items', item.id), {
        unit: newUnit,
        unitPrice: finalPrice
      });
      // Removed success toast as requested
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'items');
      setError('換算失敗。');
    }
  };

  const toggleSelection = (id: string) => {
    const newSelection = new Set(selectedIds);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedIds(newSelection);
  };

  const toggleAllSelection = () => {
    if (selectedIds.size === filteredItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map(i => i.id)));
    }
  };

  const handleQuickConvert = () => {
    const price = parseFloat(formData.unitPrice);
    if (isNaN(price) || price <= 0) return;

    let newPrice = price;
    let targetUnit = '坪';

    if (formData.unit === 'm²') {
      newPrice = price * 3.3058;
    } else if (formData.unit === '才') {
      newPrice = price * 36;
    } else {
      return;
    }

    setFormData({
      ...formData,
      unitPrice: Math.round(newPrice).toString(),
      unit: targetUnit
    });
    setSuccess(`已將單價換算為每${targetUnit}價格`);
    setTimeout(() => setSuccess(null), 2000);
  };

  const downloadTemplate = () => {
    const templateData = [
      {
        '項目名稱': '範例項目 (例如: 矽酸鈣板天花板)',
        '單位': '坪',
        '單價': 3500,
        '類別': '天花板工程',
        '廠商': '範例廠商',
        '報價日期': new Date().toISOString().split('T')[0],
        '備註': '範例備註'
      }
    ];
    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "匯入範本");
    XLSX.writeFile(wb, "工程項目匯入範本.xlsx");
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as any[];

        if (data.length === 0) {
          setError('Excel 檔案中沒有資料。');
          return;
        }

        setLoading(true);
        let importedCount = 0;
        let skipCount = 0;

        for (const row of data) {
          const name = row['項目名稱'] || row['Name'];
          const unit = row['單位'] || row['Unit'] || '坪';
          const unitPriceRaw = row['單價'] || row['Price'];
          const unitPrice = typeof unitPriceRaw === 'number' ? unitPriceRaw : parseFloat(unitPriceRaw);
          const category = row['類別'] || row['Category'] || '其他';
          const vendor = row['廠商'] || row['Vendor'] || '';
          const quoteDate = row['報價日期'] || row['Date'] || new Date().toISOString().split('T')[0];
          const remarks = row['備註'] || row['Remarks'] || '';

          if (!name || isNaN(unitPrice)) {
            skipCount++;
            continue;
          }

          // Calculate unitPrices
          const unitPrices: Record<string, number> = {};
          const group = Object.values(UNIT_GROUPS).find(g => g.includes(unit)) || [unit];
          
          group.forEach(u => {
            if (UNIT_CONVERSIONS[unit] && UNIT_CONVERSIONS[u]) {
              const calculatedPrice = unitPrice * (UNIT_CONVERSIONS[u] / UNIT_CONVERSIONS[unit]);
              unitPrices[u] = Math.round(calculatedPrice);
            } else {
              unitPrices[u] = unitPrice;
            }
          });

          const itemData = {
            name,
            unit,
            unitPrice,
            category: CATEGORIES.includes(category) ? category : '其他',
            vendor,
            quoteDate,
            remarks,
            originalUnit: unit,
            originalPrice: unitPrice,
            unitPrices,
            date: new Date().toISOString()
          };

          await addDoc(collection(db, 'items'), itemData);
          importedCount++;
        }

        setSuccess(`成功匯入 ${importedCount} 筆資料！${skipCount > 0 ? `(跳過 ${skipCount} 筆無效資料)` : ''}`);
        setTimeout(() => setSuccess(null), 5000);
      } catch (err) {
        console.error('Import error:', err);
        setError('匯入失敗，請檢查檔案格式。');
      } finally {
        setLoading(false);
        e.target.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleScanQuote = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size (limit to 4MB for safety)
    if (file.size > 4 * 1024 * 1024) {
      setError('檔案太大了，請上傳小於 4MB 的檔案。');
      return;
    }

    setIsScanning(true);
    setScanProgress('正在讀取檔案...');
    
    try {
      // Get API Key from various sources, prioritizing custom key from settings
      const envKey = import.meta.env.VITE_GEMINI_API_KEY;
      const apiKey = customApiKey || (typeof envKey === 'string' ? envKey : '');
      
      if (!apiKey || apiKey === 'undefined' || apiKey === 'null') {
        setIsSettingsOpen(true);
        setError('請先設定 Gemini API Key 才能使用 AI 掃描功能。');
        setIsScanning(false);
        return;
      }

      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
      });
      reader.readAsDataURL(file);
      const base64Data = await base64Promise;

      setScanProgress('AI 正在分析報價單內容...');
      
      const ai = new GoogleGenAI({ apiKey: apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType: file.type,
                  data: base64Data
                }
              },
              {
                text: `請分析這份報價單檔案（圖片或 PDF），並提取其中的工程項目。
                請以 JSON 格式回傳一個陣列，每個物件包含以下欄位：
                - name: 項目名稱 (例如: 矽酸鈣板天花板)
                - unit: 單位 (例如: 坪, m², 才, 式)
                - unitPrice: 單價 (數字)
                - category: 類別 (必須是以下之一: ${CATEGORIES.join(', ')})
                - vendor: 廠商名稱 (如果有的話)
                - remarks: 備註 (如果有的話)
                
                請只回傳 JSON 陣列，不要有其他文字。`
              }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                unit: { type: Type.STRING },
                unitPrice: { type: Type.NUMBER },
                category: { type: Type.STRING },
                vendor: { type: Type.STRING },
                remarks: { type: Type.STRING }
              },
              required: ["name", "unit", "unitPrice", "category"]
            }
          }
        }
      });

      const extractedItems = JSON.parse(response.text || '[]');
      
      if (extractedItems.length === 0) {
        setError('無法從檔案中提取到有效的工程項目。');
        return;
      }

      setScannedItems(extractedItems);
      setSelectedScanIndices(new Set(extractedItems.map((_: any, i: number) => i)));
      setIsReviewingScan(true);
      setSuccess(`AI 掃描完成！請確認要匯入的項目。`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('AI Scan error:', err);
      setError('AI 掃描失敗，請確保檔案清晰或嘗試手動輸入。');
    } finally {
      setIsScanning(false);
      setScanProgress(null);
      e.target.value = '';
    }
  };

  const handleUpdateScannedItem = (index: number, updatedItem: any) => {
    const newItems = [...scannedItems];
    newItems[index] = updatedItem;
    setScannedItems(newItems);
    setEditingScanIndex(null);
  };
  const handleImportScannedItems = async () => {
    if (selectedScanIndices.size === 0) return;
    
    setLoading(true);
    setIsReviewingScan(false);
    
    try {
      let importedCount = 0;
      const itemsToImport = scannedItems.filter((_, i) => selectedScanIndices.has(i));

      for (const item of itemsToImport) {
        const unit = item.unit || '坪';
        const unitPrice = item.unitPrice;
        
        // Calculate unitPrices
        const unitPrices: Record<string, number> = {};
        const group = Object.values(UNIT_GROUPS).find(g => g.includes(unit)) || [unit];
        
        group.forEach(u => {
          if (UNIT_CONVERSIONS[unit] && UNIT_CONVERSIONS[u]) {
            const calculatedPrice = unitPrice * (UNIT_CONVERSIONS[u] / UNIT_CONVERSIONS[unit]);
            unitPrices[u] = Math.round(calculatedPrice);
          } else {
            unitPrices[u] = unitPrice;
          }
        });

        const itemData = {
          name: item.name,
          unit,
          unitPrice,
          category: CATEGORIES.includes(item.category) ? item.category : '其他',
          vendor: item.vendor || '',
          quoteDate: new Date().toISOString().split('T')[0],
          remarks: item.remarks || 'AI 掃描匯入',
          originalUnit: unit,
          originalPrice: unitPrice,
          unitPrices,
          date: new Date().toISOString()
        };

        await addDoc(collection(db, 'items'), itemData);
        importedCount++;
      }

      setSuccess(`成功匯入 ${importedCount} 筆資料！`);
      setTimeout(() => setSuccess(null), 5000);
      setScannedItems([]);
      setSelectedScanIndices(new Set());
    } catch (err) {
      console.error('Import error:', err);
      setError('匯入失敗，請稍後再試。');
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (item: EngineeringItem) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      unit: item.unit,
      unitPrice: item.unitPrice.toString(),
      category: item.category,
      vendor: item.vendor || '',
      quoteDate: item.quoteDate || (item.date ? new Date(item.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]),
      remarks: item.remarks || ''
    });
    setIsAdding(true);
  };

  const handleUnitChange = (newUnit: string) => {
    const oldUnit = formData.unit;
    const price = parseFloat(formData.unitPrice);
    
    if (isNaN(price) || price <= 0 || oldUnit === newUnit) {
      setFormData({ ...formData, unit: newUnit });
      return;
    }

    let finalPrice = price;
    if (UNIT_CONVERSIONS[oldUnit] && UNIT_CONVERSIONS[newUnit]) {
      finalPrice = price * (UNIT_CONVERSIONS[newUnit] / UNIT_CONVERSIONS[oldUnit]);
      finalPrice = Math.round(finalPrice);
      
      setFormData({
        ...formData,
        unit: newUnit,
        unitPrice: finalPrice.toString()
      });
      // Removed success toast as requested
    } else {
      setFormData({ ...formData, unit: newUnit });
    }
  };

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (item.vendor?.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesCategory = selectedCategory === '全部' || item.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [items, searchTerm, selectedCategory]);

  const uniqueVendors = useMemo(() => {
    const vendors = items.map(i => i.vendor).filter(Boolean) as string[];
    return Array.from(new Set(vendors)).sort();
  }, [items]);

  const convertedResult = useMemo(() => {
    const val = parseFloat(conversionData.value);
    if (isNaN(val)) return null;
    
    // 1 坪 = 3.3058 m²
    // 1 m² = 0.3025 坪
    if (conversionData.from === '坪' && conversionData.to === 'm²') return (val * 3.3058).toFixed(2);
    if (conversionData.from === 'm²' && conversionData.to === '坪') return (val * 0.3025).toFixed(2);
    if (conversionData.from === '才' && conversionData.to === '坪') return (val / 36).toFixed(2);
    if (conversionData.from === '坪' && conversionData.to === '才') return (val * 36).toFixed(2);
    return null;
  }, [conversionData]);

  const calculatedUnitPrice = useMemo(() => {
    const price = parseFloat(priceCalcData.totalPrice);
    const area = parseFloat(priceCalcData.totalArea);
    if (isNaN(price) || isNaN(area) || area === 0) return null;
    
    const unitPrice = price / area;
    let pingPrice = unitPrice;
    
    if (priceCalcData.unit === 'm²') {
      pingPrice = unitPrice * 3.3058;
    } else if (priceCalcData.unit === '才') {
      pingPrice = unitPrice * 36;
    }
    
    return {
      unitPrice: Math.round(unitPrice),
      pingPrice: Math.round(pingPrice)
    };
  }, [priceCalcData]);

  // --- Render ---

  if (loading && items.length === 0) {
    return (
      <div className="min-h-screen bg-[#f5f5f5] flex items-center justify-center">
        <div className="animate-pulse text-gray-400">載入中...</div>
      </div>
    );
  }

  if (view === 'quote') {
    const selectedItems = items.filter(i => selectedIds.has(i.id));
    return (
      <QuoteView 
        selectedItems={selectedItems} 
        onBack={() => setView('database')} 
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f5] text-gray-900 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-black text-white rounded-lg flex items-center justify-center">
              <Calculator size={18} />
            </div>
            <span className="font-semibold text-lg hidden sm:block">工程單價分析系統</span>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 text-gray-400 hover:text-black transition-colors"
              title="設定"
            >
              <Settings size={20} />
            </button>
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-500">已選擇 {selectedIds.size} 項</span>
                <button 
                  onClick={() => setView('quote')}
                  className="bg-black text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-gray-800 transition-colors shadow-sm"
                >
                  <FileText size={16} />
                  產生報價單
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Stats / Hero */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                <Package size={20} />
              </div>
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">總項目數</span>
            </div>
            <div className="text-3xl font-light">{items.length}</div>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-green-50 text-green-600 rounded-lg">
                <TrendingUp size={20} />
              </div>
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">本月新增</span>
            </div>
            <div className="text-3xl font-light">
              {items.filter(i => new Date(i.date).getMonth() === new Date().getMonth()).length}
            </div>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                <Building2 size={20} />
              </div>
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">涵蓋類別</span>
            </div>
            <div className="text-3xl font-light">{new Set(items.map(i => i.category)).size}</div>
          </div>
        </div>

        {/* Category Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-4 mb-4 scrollbar-hide">
          <button
            onClick={() => setSelectedCategory('全部')}
            className={`px-6 py-2.5 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
              selectedCategory === '全部'
                ? 'bg-black text-white shadow-md'
                : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-300'
            }`}
          >
            全部項目
          </button>
          {CATEGORIES.map(category => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-6 py-2.5 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
                selectedCategory === category
                  ? 'bg-black text-white shadow-md'
                  : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-300'
              }`}
            >
              {category}
            </button>
          ))}
        </div>

        {/* Controls */}
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text" 
              placeholder="搜尋工程項目或廠商..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black/5 transition-all"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-hide">
            <button 
              onClick={downloadTemplate}
              className="bg-white text-gray-600 border border-gray-200 px-4 py-3 rounded-xl font-medium flex items-center gap-2 hover:bg-gray-50 transition-colors whitespace-nowrap"
              title="下載匯入範本"
            >
              <Download size={20} />
              範本
            </button>
            <div className="relative">
              <input 
                type="file" 
                accept=".xlsx, .xls"
                onChange={handleImportExcel}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                id="excel-upload"
              />
              <button 
                className="bg-white text-gray-600 border border-gray-200 px-4 py-3 rounded-xl font-medium flex items-center gap-2 hover:bg-gray-50 transition-colors whitespace-nowrap"
              >
                <Upload size={20} />
                匯入 Excel
              </button>
            </div>
            <div className="relative">
              <input 
                type="file" 
                accept="image/*,application/pdf"
                onChange={handleScanQuote}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                id="ai-scan"
                disabled={isScanning}
              />
              <button 
                className={`bg-white text-gray-600 border border-gray-200 px-4 py-3 rounded-xl font-medium flex items-center gap-2 hover:bg-gray-50 transition-colors whitespace-nowrap ${isScanning ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {isScanning ? <Loader2 size={20} className="animate-spin" /> : <Camera size={20} />}
                AI 掃描報價單
              </button>
            </div>
            <button 
              onClick={() => setIsConverterOpen(true)}
              className="bg-white text-gray-600 border border-gray-200 px-4 py-3 rounded-xl font-medium flex items-center gap-2 hover:bg-gray-50 transition-colors"
            >
              <Calculator size={20} />
              單位換算
            </button>
            <button 
              onClick={() => {
                setEditingItem(null);
                setFormData({
                  name: '',
                  unit: '坪',
                  unitPrice: '',
                  category: '天花板工程',
                  vendor: '',
                  quoteDate: new Date().toISOString().split('T')[0],
                  remarks: ''
                });
                setIsAdding(true);
              }}
              className="bg-black text-white px-6 py-3 rounded-xl font-medium flex items-center gap-2 whitespace-nowrap hover:bg-gray-800 transition-colors"
            >
              <Plus size={20} />
              新增記錄
            </button>
            {selectedIds.size > 0 && (
              <button 
                onClick={() => handleDelete(Array.from(selectedIds))}
                className="bg-red-50 text-red-600 border border-red-100 px-6 py-3 rounded-xl font-medium flex items-center gap-2 hover:bg-red-100 transition-all whitespace-nowrap"
              >
                <Trash2 size={20} />
                批次刪除 ({selectedIds.size})
              </button>
            )}
          </div>
        </div>

        {/* Messages */}
        <AnimatePresence>
          {error && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-red-50 text-red-600 p-4 rounded-xl mb-6 flex items-center gap-2 overflow-hidden"
            >
              <AlertCircle size={18} />
              {error}
            </motion.div>
          )}
          {success && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-green-50 text-green-600 p-4 rounded-xl mb-6 flex items-center gap-2 overflow-hidden"
            >
              <CheckCircle2 size={18} />
              {success}
            </motion.div>
          )}
          {isScanning && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-blue-50 text-blue-600 p-4 rounded-xl mb-6 flex items-center gap-3 overflow-hidden"
            >
              <Loader2 size={18} className="animate-spin" />
              <div className="flex-1">
                <div className="font-medium">AI 正在處理中...</div>
                <div className="text-xs opacity-80">{scanProgress}</div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* List */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-gray-400">載入中...</div>
          ) : filteredItems.length > 0 ? (
            <>
              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50/50 border-bottom border-gray-100">
                      <th className="px-6 py-4 w-12">
                        <button 
                          onClick={toggleAllSelection}
                          className="text-gray-400 hover:text-black transition-colors"
                        >
                          {selectedIds.size === filteredItems.length && filteredItems.length > 0 ? (
                            <CheckSquare size={20} className="text-black" />
                          ) : (
                            <Square size={20} />
                          )}
                        </button>
                      </th>
                      <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">工程項目</th>
                      <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">類別</th>
                      <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">單位</th>
                      <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">單價 (TWD)</th>
                      <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">廠商</th>
                      <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">報價日期</th>
                      <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredItems.map((item) => (
                      <motion.tr 
                        layout
                        key={item.id}
                        className={`hover:bg-gray-50/50 transition-colors group ${selectedIds.has(item.id) ? 'bg-black/[0.02]' : ''}`}
                      >
                        <td className="px-6 py-4">
                          <button 
                            onClick={() => toggleSelection(item.id)}
                            className="text-gray-400 hover:text-black transition-colors"
                          >
                            {selectedIds.has(item.id) ? (
                              <CheckSquare size={20} className="text-black" />
                            ) : (
                              <Square size={20} />
                            )}
                          </button>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-gray-900">{item.name}</div>
                          {item.remarks && <div className="text-xs text-gray-400 mt-1 line-clamp-1">{item.remarks}</div>}
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                            {item.category}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <select 
                            value={item.unit}
                            onChange={(e) => handleInlineUnitChange(item, e.target.value)}
                            className="bg-transparent border-none focus:ring-0 cursor-pointer text-gray-500 hover:text-black transition-colors p-0"
                          >
                            {(() => {
                              const group = Object.values(UNIT_GROUPS).find(g => g.includes(item.unit)) || [item.unit];
                              return group.map(u => <option key={u} value={u}>{u}</option>);
                            })()}
                          </select>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1 font-mono font-medium text-gray-900">
                            <span className="text-gray-400 text-xs">$</span>
                            {item.unitPrice.toLocaleString()}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-gray-500">{item.vendor || '-'}</td>
                        <td className="px-6 py-4 text-gray-400 text-sm">
                          {item.quoteDate || new Date(item.date).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => startEdit(item)}
                              className="p-2 text-gray-400 hover:text-black transition-colors"
                              title="編輯"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button 
                              onClick={() => handleDelete(item.id)}
                              className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                              title="刪除"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="md:hidden divide-y divide-gray-100">
                {filteredItems.map((item) => (
                  <div 
                    key={item.id}
                    className={`p-4 transition-colors ${selectedIds.has(item.id) ? 'bg-black/[0.02]' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      <button 
                        onClick={() => toggleSelection(item.id)}
                        className="mt-1 text-gray-400 hover:text-black transition-colors"
                      >
                        {selectedIds.has(item.id) ? (
                          <CheckSquare size={20} className="text-black" />
                        ) : (
                          <Square size={20} />
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="font-medium text-gray-900 break-words">{item.name}</div>
                          <div className="flex items-center gap-1">
                            <button 
                              onClick={() => startEdit(item)}
                              className="p-1.5 text-gray-400 hover:text-black transition-colors"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button 
                              onClick={() => handleDelete(item.id)}
                              className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600">
                            {item.category}
                          </span>
                          <span className="text-xs text-gray-400">{item.vendor || '無廠商'}</span>
                        </div>
                        <div className="flex items-center justify-between mt-4">
                          <div className="flex items-center gap-2">
                            <select 
                              value={item.unit}
                              onChange={(e) => handleInlineUnitChange(item, e.target.value)}
                              className="text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1 focus:ring-0 cursor-pointer text-gray-500"
                            >
                              {(() => {
                                const group = Object.values(UNIT_GROUPS).find(g => g.includes(item.unit)) || [item.unit];
                                return group.map(u => <option key={u} value={u}>{u}</option>);
                              })()}
                            </select>
                            <div className="font-mono font-bold text-gray-900">
                              <span className="text-gray-400 text-[10px] mr-0.5">$</span>
                              {item.unitPrice.toLocaleString()}
                            </div>
                          </div>
                          <div className="text-[10px] text-gray-400">
                            {item.quoteDate || new Date(item.date).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="p-20 text-center">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300">
                <Search size={32} />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-1">找不到相關記錄</h3>
              <p className="text-gray-500">嘗試更換搜尋關鍵字或新增一筆資料</p>
            </div>
          )}
        </div>
      </main>

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAdding(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-lg relative z-10 overflow-hidden"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-xl font-semibold">
                  {editingItem ? '編輯記錄' : '新增工程單價'}
                </h2>
                <button 
                  onClick={() => setIsAdding(false)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">工程項目名稱 *</label>
                    <input 
                      required
                      type="text" 
                      placeholder="例如：礦纖明架天花板"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black/5 transition-all"
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">類別 *</label>
                      <select 
                        required
                        value={formData.category}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none appearance-none cursor-pointer"
                      >
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">單位 *</label>
                      <select 
                        required
                        value={formData.unit}
                        onChange={(e) => handleUnitChange(e.target.value)}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none appearance-none cursor-pointer"
                      >
                        {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">單價 (TWD) *</label>
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                        <input 
                          required
                          type="number" 
                          placeholder="0"
                          value={formData.unitPrice}
                          onChange={(e) => setFormData({ ...formData, unitPrice: e.target.value })}
                          className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black/5 transition-all"
                        />
                      </div>
                      {(formData.unit === 'm²' || formData.unit === '才') && formData.unitPrice && (
                        <button
                          type="button"
                          onClick={handleQuickConvert}
                          className="mt-2 text-[10px] font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1 transition-colors"
                        >
                          <Calculator size={12} />
                          快速換算為每坪單價 (x{formData.unit === 'm²' ? '3.3058' : '36'})
                        </button>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">廠商名稱</label>
                      <input 
                        type="text" 
                        list="vendor-list"
                        placeholder="例如：某某建材"
                        value={formData.vendor}
                        onChange={(e) => setFormData({ ...formData, vendor: e.target.value })}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black/5 transition-all"
                      />
                      <datalist id="vendor-list">
                        {uniqueVendors.map(v => <option key={v} value={v} />)}
                      </datalist>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">報價日期 *</label>
                      <input 
                        required
                        type="date" 
                        value={formData.quoteDate}
                        onChange={(e) => setFormData({ ...formData, quoteDate: e.target.value })}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black/5 transition-all"
                      />
                    </div>
                    <div className="flex items-end">
                      <button 
                        type="button"
                        onClick={() => setIsConverterOpen(true)}
                        className="w-full px-4 py-3 bg-gray-100 text-gray-600 rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-gray-200 transition-colors"
                      >
                        <Calculator size={18} />
                        開啟單位換算
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">備註</label>
                    <textarea 
                      rows={3}
                      placeholder="輸入其他詳細資訊..."
                      value={formData.remarks}
                      onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black/5 transition-all resize-none"
                    />
                  </div>
                </div>

                <div className="pt-4 flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setIsAdding(false)}
                    className="flex-1 px-6 py-4 border border-gray-200 rounded-xl font-medium hover:bg-gray-50 transition-colors"
                  >
                    取消
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 px-6 py-4 bg-black text-white rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-gray-800 transition-colors"
                  >
                    <Save size={20} />
                    {editingItem ? '儲存修改' : '確認新增'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Scan Review Modal */}
      <AnimatePresence>
        {isReviewingScan && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsReviewingScan(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl relative z-10 overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-20">
                <div>
                  <h2 className="text-xl font-semibold flex items-center gap-2">
                    <Camera size={20} />
                    確認掃描結果
                  </h2>
                  <p className="text-sm text-gray-400 mt-1">請勾選您想要匯入的工程項目</p>
                </div>
                <button 
                  onClick={() => setIsReviewingScan(false)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                <div className="space-y-3">
                  <div className="flex items-center justify-between mb-4 px-2">
                    <button 
                      onClick={() => {
                        if (selectedScanIndices.size === scannedItems.length) {
                          setSelectedScanIndices(new Set());
                        } else {
                          setSelectedScanIndices(new Set(scannedItems.map((_, i) => i)));
                        }
                      }}
                      className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
                    >
                      {selectedScanIndices.size === scannedItems.length ? '取消全選' : '全選所有項目'}
                    </button>
                    <span className="text-xs text-gray-400">已選擇 {selectedScanIndices.size} / {scannedItems.length} 個項目</span>
                  </div>

                  {scannedItems.map((item, index) => (
                    <div 
                      key={index}
                      className={`p-4 rounded-2xl border transition-all flex items-start gap-4 ${selectedScanIndices.has(index) ? 'border-black bg-black/[0.02] shadow-sm' : 'border-gray-100 hover:border-gray-200'}`}
                    >
                      <div 
                        onClick={() => {
                          const newSelection = new Set(selectedScanIndices);
                          if (newSelection.has(index)) {
                            newSelection.delete(index);
                          } else {
                            newSelection.add(index);
                          }
                          setSelectedScanIndices(newSelection);
                        }}
                        className={`mt-1 flex-shrink-0 w-5 h-5 rounded border flex items-center justify-center transition-colors cursor-pointer ${selectedScanIndices.has(index) ? 'bg-black border-black text-white' : 'border-gray-300'}`}
                      >
                        {selectedScanIndices.has(index) && <Check size={14} strokeWidth={3} />}
                      </div>
                      
                      {editingScanIndex === index ? (
                        <div className="flex-1 space-y-3">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <input 
                              type="text"
                              value={item.name}
                              onChange={(e) => {
                                const newItems = [...scannedItems];
                                newItems[index].name = e.target.value;
                                setScannedItems(newItems);
                              }}
                              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
                              placeholder="項目名稱"
                            />
                            <div className="flex gap-2">
                              <input 
                                type="number"
                                value={item.unitPrice}
                                onChange={(e) => {
                                  const newItems = [...scannedItems];
                                  newItems[index].unitPrice = parseFloat(e.target.value);
                                  setScannedItems(newItems);
                                }}
                                className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
                                placeholder="單價"
                              />
                              <input 
                                type="text"
                                value={item.unit}
                                onChange={(e) => {
                                  const newItems = [...scannedItems];
                                  newItems[index].unit = e.target.value;
                                  setScannedItems(newItems);
                                }}
                                className="w-20 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
                                placeholder="單位"
                              />
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <select 
                              value={item.category}
                              onChange={(e) => {
                                const newItems = [...scannedItems];
                                newItems[index].category = e.target.value;
                                setScannedItems(newItems);
                              }}
                              className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
                            >
                              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                            <button 
                              onClick={() => setEditingScanIndex(null)}
                              className="px-4 py-2 bg-black text-white rounded-lg text-sm font-medium"
                            >
                              完成
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-medium text-gray-900 truncate">{item.name}</h3>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-mono font-semibold text-gray-900 whitespace-nowrap">
                                ${item.unitPrice?.toLocaleString()}
                              </span>
                              <button 
                                onClick={() => setEditingScanIndex(index)}
                                className="p-1 text-gray-400 hover:text-black transition-colors"
                              >
                                <Edit2 size={14} />
                              </button>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{item.category}</span>
                            <span className="text-xs text-gray-400">單位: {item.unit}</span>
                            {item.vendor && <span className="text-xs text-gray-400">廠商: {item.vendor}</span>}
                          </div>
                          {item.remarks && (
                            <p className="text-xs text-gray-400 mt-2 italic line-clamp-1">"{item.remarks}"</p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-6 border-t border-gray-100 bg-gray-50 flex gap-3">
                <button 
                  onClick={() => setIsReviewingScan(false)}
                  className="flex-1 px-6 py-4 bg-white border border-gray-200 rounded-2xl font-medium hover:bg-gray-50 transition-colors"
                >
                  取消
                </button>
                <button 
                  onClick={handleImportScannedItems}
                  disabled={selectedScanIndices.size === 0 || loading}
                  className="flex-[2] px-6 py-4 bg-black text-white rounded-2xl font-medium flex items-center justify-center gap-2 hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
                  匯入所選項目 ({selectedScanIndices.size})
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSettingsOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-md relative z-10 overflow-hidden"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Settings size={20} />
                  系統設定
                </h2>
                <button 
                  onClick={() => setIsSettingsOpen(false)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Gemini API Key</label>
                  <p className="text-xs text-gray-400 mb-3">
                    若您在 GitHub Pages 等外部環境使用，請在此輸入您的 API Key。
                    您可以到 <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">Google AI Studio</a> 免費申請。
                  </p>
                  <input 
                    type="password" 
                    placeholder="輸入您的 API Key..."
                    value={customApiKey}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCustomApiKey(val);
                      localStorage.setItem('gemini_api_key', val);
                    }}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black/5 transition-all"
                  />
                  {customApiKey && (
                    <p className="text-[10px] text-green-500 mt-2 flex items-center gap-1">
                      <CheckCircle2 size={10} /> 已儲存至瀏覽器本地快取
                    </p>
                  )}
                </div>

                <div className="p-4 bg-blue-50 rounded-2xl">
                  <div className="flex gap-3">
                    <AlertCircle size={18} className="text-blue-500 flex-shrink-0 mt-0.5" />
                    <div className="text-xs text-blue-700 leading-relaxed">
                      <strong>隱私說明：</strong>您的 API Key 僅會儲存在您的瀏覽器中，不會上傳到我們的伺服器。
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-gray-100 bg-gray-50">
                <button 
                  onClick={() => setIsSettingsOpen(false)}
                  className="w-full px-6 py-3 bg-black text-white rounded-xl font-medium hover:bg-gray-800 transition-colors"
                >
                  完成設定
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirmId && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeleteConfirmId(null)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-sm relative z-10 overflow-hidden"
            >
              <div className="p-6 text-center">
                <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Trash2 size={32} />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">確定要刪除嗎？</h3>
                <p className="text-gray-500 text-sm mb-6">
                  {Array.isArray(deleteConfirmId) 
                    ? `您即將刪除 ${deleteConfirmId.length} 筆選中的工程項目記錄。`
                    : '此操作將永久刪除此筆工程項目記錄，刪除後將無法復原。'}
                </p>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setDeleteConfirmId(null)}
                    className="flex-1 px-4 py-3 border border-gray-200 rounded-xl font-medium hover:bg-gray-50 transition-colors"
                  >
                    取消
                  </button>
                  <button 
                    onClick={confirmDelete}
                    disabled={loading}
                    className="flex-1 px-4 py-3 bg-red-500 text-white rounded-xl font-medium hover:bg-red-600 transition-colors flex items-center justify-center gap-2"
                  >
                    {loading ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                    確定刪除
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Unit Converter Modal */}
      <AnimatePresence>
        {isConverterOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsConverterOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-sm relative z-10 overflow-hidden"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Calculator size={20} />
                  單位換算器
                </h2>
                <button 
                  onClick={() => setIsConverterOpen(false)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div className="flex p-1 bg-gray-100 rounded-xl mb-2">
                  <button 
                    onClick={() => setConverterMode('simple')}
                    className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${converterMode === 'simple' ? 'bg-white shadow-sm text-black' : 'text-gray-500'}`}
                  >
                    數值換算
                  </button>
                  <button 
                    onClick={() => setConverterMode('price')}
                    className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${converterMode === 'price' ? 'bg-white shadow-sm text-black' : 'text-gray-500'}`}
                  >
                    單價計算
                  </button>
                </div>

                {converterMode === 'simple' ? (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">從</label>
                        <select 
                          value={conversionData.from}
                          onChange={(e) => setConversionData({ ...conversionData, from: e.target.value })}
                          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none"
                        >
                          <option value="坪">坪</option>
                          <option value="m²">m²</option>
                          <option value="才">才</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">至</label>
                        <select 
                          value={conversionData.to}
                          onChange={(e) => setConversionData({ ...conversionData, to: e.target.value })}
                          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none"
                        >
                          <option value="m²">m²</option>
                          <option value="坪">坪</option>
                          <option value="才">才</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">輸入數值</label>
                      <input 
                        type="number" 
                        placeholder="輸入數量..."
                        value={conversionData.value}
                        onChange={(e) => setConversionData({ ...conversionData, value: e.target.value })}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none"
                      />
                    </div>

                    {convertedResult && (
                      <div className="p-4 bg-black text-white rounded-2xl text-center">
                        <div className="text-xs opacity-60 uppercase tracking-widest mb-1">換算結果</div>
                        <div className="text-2xl font-light">
                          {conversionData.value} {conversionData.from} = {convertedResult} {conversionData.to}
                        </div>
                        {isAdding && (
                          <button 
                            onClick={() => {
                              setFormData({ ...formData, unitPrice: convertedResult, unit: conversionData.to });
                              setIsConverterOpen(false);
                            }}
                            className="mt-3 w-full py-2 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-medium transition-colors"
                          >
                            套用至表單
                          </button>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">總價 (TWD)</label>
                        <input 
                          type="number" 
                          placeholder="例如：50000"
                          value={priceCalcData.totalPrice}
                          onChange={(e) => setPriceCalcData({ ...priceCalcData, totalPrice: e.target.value })}
                          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">總面積</label>
                          <input 
                            type="number" 
                            placeholder="例如：15"
                            value={priceCalcData.totalArea}
                            onChange={(e) => setPriceCalcData({ ...priceCalcData, totalArea: e.target.value })}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">面積單位</label>
                          <select 
                            value={priceCalcData.unit}
                            onChange={(e) => setPriceCalcData({ ...priceCalcData, unit: e.target.value })}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none"
                          >
                            <option value="m²">m²</option>
                            <option value="坪">坪</option>
                            <option value="才">才</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {calculatedUnitPrice && (
                      <div className="space-y-2">
                        <div className="p-4 bg-black text-white rounded-2xl text-center">
                          <div className="text-xs opacity-60 uppercase tracking-widest mb-1">計算結果</div>
                          <div className="space-y-1">
                            <div className="text-lg font-light">
                              每 {priceCalcData.unit} 單價：${calculatedUnitPrice.unitPrice.toLocaleString()}
                            </div>
                            {priceCalcData.unit !== '坪' && (
                              <div className="text-xl font-medium text-blue-400">
                                每 坪 單價：${calculatedUnitPrice.pingPrice.toLocaleString()}
                              </div>
                            )}
                          </div>
                          {isAdding && (
                            <div className="flex gap-2 mt-4">
                              <button 
                                onClick={() => {
                                  setFormData({ ...formData, unitPrice: calculatedUnitPrice.unitPrice.toString(), unit: priceCalcData.unit });
                                  setIsConverterOpen(false);
                                }}
                                className="flex-1 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-[10px] font-medium transition-colors"
                              >
                                套用每{priceCalcData.unit}單價
                              </button>
                              {priceCalcData.unit !== '坪' && (
                                <button 
                                  onClick={() => {
                                    setFormData({ ...formData, unitPrice: calculatedUnitPrice.pingPrice.toString(), unit: '坪' });
                                    setIsConverterOpen(false);
                                  }}
                                  className="flex-1 py-2 bg-blue-500/40 hover:bg-blue-500/60 rounded-lg text-[10px] font-medium transition-colors"
                                >
                                  套用每坪單價
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}

                <div className="text-[10px] text-gray-400 text-center">
                  註：1 坪 ≈ 3.3058 m² | 1 坪 = 36 才
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-4 py-12 text-center text-gray-400 text-sm">
        <p>© 2026 工程單價參考手冊 · 您的專業估價助手</p>
      </footer>
    </div>
  );
}
