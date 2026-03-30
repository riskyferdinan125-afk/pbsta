import { Timestamp } from 'firebase/firestore';

export type TicketStatus = 'open' | 'in-progress' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TicketCategory = 'PROJECT' | 'REGULER' | 'PSB' | 'SQM' | 'UNSPEKS' | 'EXBIS' | 'CORRECTIVE' | 'PREVENTIVE' | 'Other';

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: 'superadmin' | 'admin' | 'staf' | 'teknisi';
  photoURL?: string;
  telegramId?: string;
  password?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface Customer {
  id: string;
  customerId: string;
  name: string;
  phone: string;
  address: string;
  odp: string;
  email?: string;
  assets?: string[]; // IDs of assets owned by customer
}

export interface ChecklistItem {
  task: string;
  completed: boolean;
  completedAt?: Timestamp;
  completedBy?: string;
  location?: {
    lat: number;
    lng: number;
  };
}

export interface Ticket {
  id: string;
  ticketNumber: number;
  inseraTicketId?: string;
  customerId: string;
  title?: string; // Added title
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: TicketCategory;
  subCategory?: string;
  points?: number;
  technicianIds: string[];
  assetId?: string; // Added assetId
  dueDate?: Timestamp;
  slaDeadline?: Timestamp; // SLA resolution deadline
  slaStatus?: 'within-sla' | 'near-breach' | 'breached';
  dependsOn?: string[];
  checklist?: ChecklistItem[];
  beforePhoto?: string;
  afterPhoto?: string;
  totalTimeSpent?: number; // in minutes
  isTimerRunning?: boolean;
  timerStartedAt?: Timestamp;
  lastLocation?: {
    lat: number;
    lng: number;
    updatedAt: Timestamp;
  };
  email?: string;
  rating?: number; // Customer rating (1-5)
  feedback?: string; // Customer feedback
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

export interface Asset {
  id: string;
  customerId: string;
  name: string;
  type?: string; // Added type
  model: string;
  serialNumber: string;
  status: 'active' | 'maintenance' | 'retired';
  installationDate: Timestamp;
  purchaseDate?: Timestamp; // Added purchaseDate
  warrantyExpiry?: Timestamp; // Added warrantyExpiry
  specs?: Record<string, string>; // Changed from string to Record
  notes?: string;
  qrCode?: string; // Added for QR code storage (optional)
}

export interface KnowledgeBaseArticle {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  isPublic?: boolean; // Added isPublic
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  viewCount: number;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
  read: boolean;
  createdAt: Timestamp;
  link?: string;
}

export interface Material {
  id: string;
  name: string;
  unit: string;
  price: number;
  quantity: number;
  minQuantity?: number; // Added minQuantity
}

export interface Job {
  id: string;
  designator: string;
  name: string;
  unit: string;
  materialPrice: number;
  servicePrice: number;
  price: number;
}

export type AvailabilityStatus = 'Available' | 'Busy' | 'On Leave' | 'Offline';

export interface Technician {
  id: string;
  name: string;
  nik?: string;
  email: string;
  phone?: string;
  role?: string;
  photoURL?: string;
  availabilityStatus?: AvailabilityStatus;
  skills?: string[];
  workingDays?: string[];
  workingHours?: string;
  location?: {
    lat: number;
    lng: number;
    updatedAt: Timestamp;
  };
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface MaterialUsage {
  materialId: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface JobUsage {
  jobId: string;
  designator?: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface RepairRecord {
  id: string;
  ticketId: string;
  technicianId: string;
  startTime: Timestamp;
  endTime?: Timestamp;
  notes: string;
  materialsUsed: MaterialUsage[];
  jobsUsed?: JobUsage[];
  beforePhoto?: string;
  afterPhoto?: string;
  signature?: string;
  location?: {
    lat: number;
    lng: number;
  };
  createdAt: Timestamp;
}

export interface TicketHistory {
  id: string;
  ticketId: string;
  type: 'status_change' | 'assignment_change' | 'priority_change' | 'note_added' | 'created' | 'dependency_change';
  fromValue?: string | string[];
  toValue: string | string[];
  changedBy: string;
  timestamp: Timestamp;
}

export interface TicketNote {
  id: string;
  ticketId: string;
  note: string;
  createdBy: string;
  createdAt: Timestamp;
}

export interface ProjectMaterial {
  materialId: string;
  name: string;
  quantity: number;
  price: number;
  subtotal: number;
}

export interface ProjectJob {
  jobId: string;
  designator?: string;
  name: string;
  quantity: number;
  materialPrice: number;
  servicePrice: number;
  price: number;
  materialSubtotal: number;
  serviceSubtotal: number;
  subtotal: number;
}

export interface ProjectEvidence {
  stage: 'Initial' | 'Sebelum' | 'Penggalian' | 'Tanam tiang' | 'Pengecoran' | 'Penarikan kabel' | 'Pemasangan aksesoris' | 'Penyambungan core' | 'Pemasangan UC' | 'Penaikan UC' | 'Sesudah' | 'Berita acara' | 'Tiket Insera' | 'Hasil ukur' | 'As built drawing';
  photoUrl: string;
  caption?: string;
  timestamp: Timestamp;
  reportedBy: string;
}

export interface Project {
  id: string;
  pid: string;
  projectName?: string;
  contractNo?: string;
  orderNo?: string;
  witel?: string;
  ticketId?: string;
  partner?: string;
  description: string;
  location?: string;
  status: 'open' | 'in-progress' | 'completed';
  inseraTicketIds?: string[];
  activityCost?: number;
  totalMaterialCost?: number;
  totalJobCost?: number;
  totalCost?: number;
  photos?: string[]; // Deprecated, use evidence
  evidence?: ProjectEvidence[];
  materials?: ProjectMaterial[];
  jobs?: ProjectJob[];
  technicianId?: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}
