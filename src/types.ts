export interface NoteItem {
  id: string;
  text: string;
  isImportant: boolean;
  createdAt: number;
}

export interface Driver {
  id: string;
  code: string;
  name: string;
  route: string;
  factory: string;
  carType?: string;
  mobile: string;
  status: 'active' | 'retired';
  notes?: NoteItem[];
  createdAt: any;
}

export interface JobItem {
  description: string;
  rounds: number;
  price: number;
  date?: string;
}

export interface Deduction {
  type: string;
  amount: number;
  date: string;
}

export interface JobRecord {
  id: string;
  driverId: string;
  month: string; // YYYY-MM
  items: JobItem[];
  deductions: Deduction[];
  totalWork: number;
  totalDeductions: number;
  netPay: number;
  updatedAt: any;
}
