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
  Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
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
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
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

  const handleExportPDF = async () => {
    const element = document.getElementById('quote-document');
    if (!element) return;

    try {
      // Hide non-print elements temporarily if needed (though we target the specific ID)
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`報價單_${clientName || '未命名'}_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err) {
      console.error('PDF generation failed:', err);
      alert('PDF 產生失敗，請嘗試使用列印功能。');
    }
  };

  const handleExportExcel = () => {
    // Header information with better structure
    const header = [
      ['報價單 (Quotation)'],
      [''],
      ['報價單編號:', quoteNumber, '', '', '日期:', new Date().toLocaleDateString('zh-TW')],
      ['客戶名稱:', clientName || '未填寫'],
      [''],
      ['項目名稱', '類別', '單價', '數量', '單位', '小計']
    ];

    const rows = selectedItems.map(item => {
      const qty = parseFloat(quantities[item.id] || '0');
      return [
        item.name,
        item.category,
        item.unitPrice,
        isNaN(qty) ? 0 : qty,
        item.unit,
        item.unitPrice * (isNaN(qty) ? 0 : qty)
      ];
    });

    const footer = [
      [''],
      ['', '', '', '', '合計 (Subtotal)', subtotal],
      ['', '', '', '', '稅金 (VAT 5%)', tax],
      ['', '', '', '', '總計 (Total)', total],
      [''],
      ['備註: 感謝您的洽詢，本報價單有效期限為 30 天。']
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
      { wch: 35 }, { wch: 15 }, { wch: 12 }, { wch: 10 }, { wch: 8 }, { wch: 15 }
    ];
    ws['!cols'] = colWidths;

    XLSX.writeFile(wb, `報價單_${clientName || '未命名'}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans print:p-0">
      {/* Quote Header (Non-print) */}
      <div className="bg-gray-50 border-b border-gray-200 py-4 px-4 sticky top-0 z-30 print:hidden">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <button 
            onClick={onBack}
            className="flex items-center gap-2 text-gray-500 hover:text-black transition-colors font-medium"
          >
            <ArrowLeft size={20} />
            返回資料庫
          </button>
          <div className="flex items-center gap-3">
            <button 
              onClick={handleExportExcel}
              className="bg-white text-gray-700 border border-gray-200 px-5 py-2.5 rounded-xl font-medium flex items-center gap-2 hover:bg-gray-50 transition-colors shadow-sm"
            >
              <FileText size={18} />
              匯出 Excel
            </button>
            <button 
              onClick={handleExportPDF}
              className="bg-white text-gray-700 border border-gray-200 px-5 py-2.5 rounded-xl font-medium flex items-center gap-2 hover:bg-gray-50 transition-colors shadow-sm"
            >
              <Download size={18} />
              下載 PDF
            </button>
            <button 
              onClick={handlePrint}
              className="bg-black text-white px-5 py-2.5 rounded-xl font-medium flex items-center gap-2 hover:bg-gray-800 transition-colors shadow-sm"
            >
              <Printer size={18} />
              列印
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-8 py-12 print:py-0 print:px-0">
        {/* Quote Document */}
        <div id="quote-document" className="bg-white p-8 print:p-0">
          <div className="flex justify-between items-start mb-12">
            <div>
              <h1 className="text-4xl font-bold tracking-tight mb-2 uppercase">Quotation</h1>
              <p className="text-gray-400 font-mono text-sm">報價單編號: {quoteNumber}</p>
            </div>
            <div className="text-right">
              <div className="font-bold text-xl mb-1">工程報價系統</div>
              <div className="text-gray-500 text-sm">
                日期: {new Date().toLocaleDateString('zh-TW')}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-12 mb-12">
            <div>
              <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">客戶資訊</div>
              <input 
                type="text" 
                placeholder="輸入客戶名稱..."
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className="w-full text-xl font-medium border-b-2 border-gray-100 focus:border-black outline-none pb-1 transition-colors print:border-none print:p-0"
              />
            </div>
          </div>

          <table className="w-full mb-12">
            <thead>
              <tr className="border-b-2 border-black">
                <th className="py-4 text-left font-bold uppercase tracking-wider text-sm">項目名稱</th>
                <th className="py-4 text-right font-bold uppercase tracking-wider text-sm">單價</th>
                <th className="py-4 text-center font-bold uppercase tracking-wider text-sm w-32">數量</th>
                <th className="py-4 text-center font-bold uppercase tracking-wider text-sm">單位</th>
                <th className="py-4 text-right font-bold uppercase tracking-wider text-sm">小計</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {selectedItems.map((item) => {
                const qty = parseFloat(quantities[item.id] || '0');
                const itemSubtotal = item.unitPrice * (isNaN(qty) ? 0 : qty);
                return (
                  <tr key={item.id}>
                    <td className="py-6">
                      <div className="font-bold text-lg">{item.name}</div>
                      <div className="text-sm text-gray-400 mt-1">{item.category}</div>
                    </td>
                    <td className="py-6 text-right font-mono">
                      ${item.unitPrice.toLocaleString()}
                    </td>
                    <td className="py-6 text-center">
                      <input 
                        type="number" 
                        min="0"
                        step="any"
                        value={quantities[item.id] || ''}
                        onChange={(e) => setQuantities({ ...quantities, [item.id]: e.target.value })}
                        className="w-24 text-center border border-gray-200 rounded-lg py-1 focus:border-black outline-none transition-colors print:border-none"
                        placeholder="0"
                      />
                    </td>
                    <td className="py-6 text-center text-gray-500">
                      {item.unit}
                    </td>
                    <td className="py-6 text-right font-bold font-mono">
                      ${itemSubtotal.toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="flex justify-end">
            <div className="w-80">
              <div className="flex justify-between py-3 border-b border-gray-100">
                <span className="text-gray-500">合計 (Subtotal)</span>
                <span className="font-mono font-medium">${subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-3 border-b border-gray-100">
                <span className="text-gray-500">稅金 (VAT 5%)</span>
                <span className="font-mono font-medium">${tax.toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-6">
                <span className="text-xl font-bold">總計 (Total)</span>
                <span className="text-2xl font-bold font-mono text-black">
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

  const handleDelete = async (id: string) => {
    if (!window.confirm('確定要刪除此筆記錄嗎？')) return;
    try {
      await deleteDoc(doc(db, 'items', id));
      setSuccess('刪除成功！');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'items');
      setError('刪除失敗。');
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
            <span className="font-semibold text-lg hidden sm:block">工程單價參考手冊</span>
          </div>
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
        </AnimatePresence>

        {/* List */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-gray-400">載入中...</div>
          ) : filteredItems.length > 0 ? (
            <div className="overflow-x-auto">
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
