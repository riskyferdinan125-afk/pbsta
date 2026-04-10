import { Timestamp } from 'firebase/firestore';

export type TicketStatus = 'open' | 'in-progress' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TicketCategory = 'PROJECT' | 'REGULER' | 'PSB' | 'SQM' | 'UNSPEKS' | 'EXBIS' | 'CORRECTIVE' | 'PREVENTIVE' | 'Other';

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  title?: string;
  nik?: string;
  phone?: string;
  address?: string;
  role: 'superadmin' | 'admin' | 'staf' | 'teknisi';
  photoURL?: string;
  telegramId?: string;
  password?: string;
  bio?: string;
  availabilityStatus?: AvailabilityStatus;
  skills?: string[];
  specialization?: string;
  workingDays?: string[];
  workingHours?: string;
  location?: {
    lat: number;
    lng: number;
    updatedAt: Timestamp;
  };
  notificationPreferences?: {
    newTicket: boolean;
    ticketUpdate: boolean;
    newComment: boolean;
  };
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
  location?: {
    lat: number;
    lng: number;
  };
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
  timerStartedAt?: string; // ISO 8601 date-time string
  lastLocation?: {
    lat: number;
    lng: number;
    updatedAt: Timestamp;
  };
  email?: string;
  rating?: number; // Customer rating (1-5)
  feedback?: string; // Customer feedback
  resolvedAt?: Timestamp;
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
  category?: string;
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
  title?: string;
  phone?: string;
  address?: string;
  role?: string;
  photoURL?: string;
  telegramId?: string;
  bio?: string;
  availabilityStatus?: AvailabilityStatus;
  skills?: string[];
  specialization?: string;
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
  technicianName?: string;
  startTime: Timestamp;
  endTime?: Timestamp;
  type: 'Logic' | 'Physical';
  rootCause: string;
  repairAction: string;
  evidencePhoto?: string;
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
  type: 'status_change' | 'assignment_change' | 'priority_change' | 'note_added' | 'created' | 'dependency_change' | 'category_change' | 'subcategory_change' | 'due_date_change' | 'timer_event' | 'checklist_change' | 'photo_upload' | 'material_change' | 'repair_record_added' | 'title_change' | 'description_change';
  fromValue?: string | string[] | number | boolean;
  toValue: string | string[] | number | boolean;
  changedBy: string;
  timestamp: Timestamp;
  description?: string;
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
  stage: 'Initial' | 'Sebelum' | 'Penggalian' | 'Tanam tiang' | 'Pengecoran' | 'Penarikan kabel' | 'Pemasangan aksesoris' | 'Penyambungan core' | 'Pemasangan UC' | 'Penaikan UC' | 'Sesudah' | 'Berita acara' | 'Tiket Insera' | 'Hasil ukur' | 'As built drawing' | 'EVIDEN PRA' | 'PROSES' | 'EVIDEN PASCA' | 'MATERIAL TIBA' | 'ABD' | 'BA PENDUKUNG';
  photoUrl: string;
  caption?: string;
  timestamp: Timestamp;
  reportedBy: string;
}

export interface Report {
  id: string;
  type: 'weekly' | 'monthly';
  startDate: Timestamp;
  endDate: Timestamp;
  completedTickets: number;
  avgResolutionTime: number; // in minutes
  totalMaterialCost: number;
  materialUsage: {
    materialId: string;
    name: string;
    totalQuantity: number;
    totalCost: number;
  }[];
  createdAt: Timestamp;
}

export interface ProjectComment {
  id: string;
  text: string;
  createdBy: string;
  createdAt: Timestamp;
}

export interface ProjectHistory {
  id: string;
  type: 'status_change' | 'boq_update' | 'technician_change' | 'milestone_update' | 'document_added' | 'created';
  fromValue?: string | number | boolean;
  toValue: string | number | boolean;
  changedBy: string;
  timestamp: Timestamp;
  description?: string;
}

export interface ProjectMilestone {
  id: string;
  title: string;
  status: 'pending' | 'completed';
  dueDate?: Timestamp;
  completedAt?: Timestamp;
}

export interface ProjectDocument {
  id: string;
  name: string;
  url: string;
  type: string;
  uploadedBy: string;
  uploadedAt: Timestamp;
}

export interface ProjectBOQVersion {
  version: number;
  totalCost: number;
  jobs: ProjectJob[];
  materials: ProjectMaterial[];
  timestamp: Timestamp;
  changedBy: string;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  defaultJobs: ProjectJob[];
  defaultMaterials: ProjectMaterial[];
  defaultMilestones: string[];
  createdAt: Timestamp;
}

export interface ProjectCheckIn {
  id: string;
  userId: string;
  userName: string;
  timestamp: Timestamp;
  location: {
    lat: number;
    lng: number;
  };
  distanceFromProject: number; // in meters
  type: 'check-in' | 'check-out';
  photoUrl?: string;
}

export interface ProjectSignature {
  id: string;
  role: 'technician' | 'partner' | 'supervisor';
  name: string;
  signatureUrl: string;
  timestamp: Timestamp;
}

export interface ProjectHealth {
  score: number; // 0-100
  status: 'healthy' | 'warning' | 'critical';
  analysis: string;
  recommendations: string[];
  lastChecked: Timestamp;
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
  latitude?: number;
  longitude?: number;
  status: 'open' | 'in-progress' | 'completed' | 'closed';
  boqRekon?: string;
  tiketGamas?: string;
  baPendukungUrl?: string;
  evidenPraOptions?: string[];
  prosesOptions?: string[];
  evidenPascaOptions?: string[];
  inseraTicketIds?: string[];
  activityCost?: number;
  totalMaterialCost?: number;
  totalJobCost?: number;
  totalCost?: number;
  estimatedDuration?: number;
  photos?: string[]; // Deprecated, use evidence
  evidence?: ProjectEvidence[];
  materials?: ProjectMaterial[];
  jobs?: ProjectJob[];
  technicianId?: string; // Primary technician
  assignedTechnicianIds?: string[]; // Multiple technicians
  milestones?: ProjectMilestone[];
  comments?: ProjectComment[];
  history?: ProjectHistory[];
  documents?: ProjectDocument[];
  boqVersions?: ProjectBOQVersion[];
  checkIns?: ProjectCheckIn[];
  signatures?: ProjectSignature[];
  health?: ProjectHealth;
  templateId?: string;
  actualCost?: number;
  budget?: number;
  startDate?: Timestamp;
  endDate?: Timestamp;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}
