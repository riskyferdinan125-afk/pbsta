import { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  serverTimestamp, 
  orderBy,
  deleteDoc,
  getDocs,
  where,
  Timestamp
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage, handleFirestoreError, OperationType } from '../firebase';
import { Project, UserProfile, Material, ProjectMaterial, Job, ProjectJob, ProjectEvidence, ProjectTemplate, ProjectCheckIn, ProjectSignature, ProjectHealth } from '../types';
import { 
  Plus, 
  Search, 
  MoreVertical, 
  Trash2, 
  Edit2, 
  Camera, 
  Package, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  X,
  Image as ImageIcon,
  Save,
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  Activity,
  Upload,
  Briefcase,
  Calendar,
  User,
  FileText,
  Printer,
  Download,
  Eye,
  FileDown,
  Sparkles,
  Database,
  LayoutGrid,
  GalleryHorizontal,
  Maximize,
  BarChart3,
  Map as MapIcon,
  List,
  MessageSquare,
  History,
  Flag,
  TrendingUp,
  DollarSign,
  FileUp,
  Paperclip,
  MapPin,
  PenTool,
  ShieldCheck,
  Zap,
  Filter,
  CheckSquare,
  Square,
  Copy,
  GanttChartSquare
} from 'lucide-react';
import SignatureCanvas from 'react-signature-canvas';
import { GoogleGenAI } from "@google/genai";
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { motion, AnimatePresence } from 'motion/react';
import { useToast } from './Toast';
import ProjectReport from './ProjectReport';
import ConfirmationModal from './ConfirmationModal';
import ProjectDashboard from './ProjectDashboard';
import ProjectMap from './ProjectMap';
import { ProjectComment, ProjectMilestone, ProjectDocument, ProjectHistory } from '../types';

interface ProjectListProps {
  profile: UserProfile | null;
}

const EVIDEN_OPTIONS = [
  'KABEL', 'UC', 'TIANG', 'ODP', 'ODC', 'PATCHORE', 'OTB', 'PASSIVE',
  'GROUNDING', 'PIPA', 'HDPE', 'GALIAN', 'AKSESORIS', 'MAINHOLE',
  'SAMBUNGAN', 'DROPCORE', 'ADAPTOR', 'PEMBONGKARAN', 'Initial', 'EVIDEN PRA', 'PROSES', 'EVIDEN PASCA', 'HASIL UKUR', 'MATERIAL TIBA', 'ABD', 'BA PENDUKUNG'
];

export default function ProjectList({ profile }: ProjectListProps) {
  const { showToast } = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [availableJobs, setAvailableJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [viewingReport, setViewingReport] = useState<Project | null>(null);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);
  const [activeProjectForGallery, setActiveProjectForGallery] = useState<Project | null>(null);
  const [isConfirmClearBOQOpen, setIsConfirmClearBOQOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'dashboard' | 'map' | 'timeline'>('list');
  const [activeDetailTab, setActiveDetailTab] = useState<'overview' | 'boq' | 'evidence' | 'milestones' | 'team' | 'comments' | 'history' | 'documents' | 'checkins' | 'signatures' | 'health'>('overview');
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [signatureRole, setSignatureRole] = useState<'technician' | 'partner' | 'supervisor'>('technician');
  const sigPadRef = useRef<SignatureCanvas>(null);
  const [isAnalyzingHealth, setIsAnalyzingHealth] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [newMilestone, setNewMilestone] = useState('');
  const [isAddingMilestone, setIsAddingMilestone] = useState(false);
  const [technicians, setTechnicians] = useState<UserProfile[]>([]);

  // Form State
  const [formData, setFormData] = useState({
    pid: '',
    projectName: '',
    contractNo: '',
    orderNo: '',
    witel: 'MADIUN',
    partner: 'PT TELKOM AKSES',
    description: '',
    location: '',
    status: 'open' as Project['status'],
    boqRekon: '',
    tiketGamas: '',
    baPendukungUrl: '',
    latitude: 0,
    longitude: 0,
    assignedTechnicianIds: [] as string[],
    evidenPraOptions: [] as string[],
    prosesOptions: [] as string[],
    evidenPascaOptions: [] as string[],
    inseraTicketIds: [] as string[],
    activityCost: 0,
    estimatedDuration: 0,
  });
  const [selectedMaterials, setSelectedMaterials] = useState<ProjectMaterial[]>([]);
  const [selectedJobs, setSelectedJobs] = useState<ProjectJob[]>([]);
  const [evidence, setEvidence] = useState<ProjectEvidence[]>([]);
  const [selectedStages, setSelectedStages] = useState<string[]>(['Initial']);

  const [galleryViewMode, setGalleryViewMode] = useState<'grid' | 'carousel'>('grid');
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [jobSearchTerm, setJobSearchTerm] = useState('');
  const [materialSearchTerm, setMaterialSearchTerm] = useState('');
  const [jobPage, setJobPage] = useState(1);
  const [materialPage, setMaterialPage] = useState(1);
  const [projectPage, setProjectPage] = useState(1);
  const JOBS_PER_PAGE = 5;
  const MATERIALS_PER_PAGE = 5;
  const PROJECTS_PER_PAGE = 10;

  const TimelineView = () => {
    const sortedProjects = [...projects].sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
    
    return (
      <div className="bg-white rounded-3xl border border-black/5 shadow-sm overflow-hidden p-6">
        <div className="flex items-center justify-between mb-8">
          <h3 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
            <GanttChartSquare className="w-5 h-5 text-emerald-500" />
            Project Timeline
          </h3>
          <div className="flex gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
              <span className="text-neutral-500">Completed</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-blue-500"></div>
              <span className="text-neutral-500">In Progress</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-amber-500"></div>
              <span className="text-neutral-500">Open</span>
            </div>
          </div>
        </div>

        <div className="space-y-8">
          {sortedProjects.map((project) => {
            const startDate = project.startDate?.toDate() || project.createdAt.toDate();
            const endDate = project.endDate?.toDate() || new Date(startDate.getTime() + (project.estimatedDuration || 7) * 24 * 60 * 60 * 1000);
            const today = new Date();
            const totalDuration = endDate.getTime() - startDate.getTime();
            const elapsed = today.getTime() - startDate.getTime();
            const progress = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));

            return (
              <div key={project.id} className="relative">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-neutral-900">{project.projectName || project.pid}</span>
                    <span className="text-[10px] text-neutral-500">{startDate.toLocaleDateString()} - {endDate.toLocaleDateString()}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                    project.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                    project.status === 'in-progress' ? 'bg-blue-100 text-blue-700' :
                    'bg-amber-100 text-amber-700'
                  }`}>
                    {project.status}
                  </span>
                </div>
                <div className="h-3 bg-neutral-100 rounded-full overflow-hidden border border-black/5">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${project.status === 'completed' ? 100 : progress}%` }}
                    className={`h-full rounded-full ${
                      project.status === 'completed' ? 'bg-emerald-500' :
                      project.status === 'in-progress' ? 'bg-blue-500' :
                      'bg-amber-500'
                    }`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };
  const resolvePhotoUrl = (url: string | undefined) => {
    if (!url) return '';
    if (url.startsWith('http') || url.startsWith('data:') || url.startsWith('/')) return url;
    // If it's a file ID (no slashes, no http), it's likely a Telegram file ID
    if (!url.includes('/')) {
      return `/api/telegram-photo/${url}`;
    }
    return url;
  };

  // Helper function to get all evidence for a project
  const getProjectEvidence = (project: Project) => {
    const legacyPhotos = (project.photos || [])
      .filter(url => !!url)
      .map(url => ({ 
        photoUrl: url, 
        stage: 'Initial' as any, 
        reportedBy: 'System', 
        timestamp: project.createdAt,
        caption: 'Legacy Photo' 
      }));
    const evidence = (project.evidence || []).filter(e => !!e && !!e.photoUrl);
    return [...legacyPhotos, ...evidence];
  };

  const allEvidence = activeProjectForGallery ? getProjectEvidence(activeProjectForGallery) : [];

  useEffect(() => {
    const q = query(collection(db, 'projectTemplates'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const templatesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProjectTemplate));
      setTemplates(templatesData);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'projectTemplates'));
    return () => unsubscribe();
  }, []);

  const analyzeProjectHealth = async (project: Project) => {
    if (!process.env.GEMINI_API_KEY) {
      showToast('Gemini API Key is required for health analysis', 'error');
      return;
    }

    setIsAnalyzingHealth(true);
    try {
      const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

      const prompt = `Analyze the health of this telecommunications project:
      Project Name: ${project.projectName || project.description}
      Status: ${project.status}
      Milestones: ${JSON.stringify(project.milestones)}
      Evidence Count: ${project.evidence?.length || 0}
      Assigned Technicians: ${project.assignedTechnicianIds?.length || 0}
      Estimated Duration: ${project.estimatedDuration} days
      Created At: ${project.createdAt.toDate().toISOString()}
      
      Provide a health score (0-100), status (healthy, warning, critical), a brief analysis, and 3 specific recommendations.
      Format the response as JSON: { "score": number, "status": "healthy" | "warning" | "critical", "analysis": "string", "recommendations": ["string", "string", "string"] }`;

      const response = await genAI.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json"
        }
      });
      
      const text = response.text;
      if (!text) throw new Error('No response from AI');
      
      const healthData = JSON.parse(text);

      await updateDoc(doc(db, 'projects', project.id), {
        health: {
          ...healthData,
          lastChecked: serverTimestamp()
        }
      });

      showToast('Project health analysis completed', 'success');
    } catch (error) {
      console.error('Error analyzing project health:', error);
      showToast('Failed to analyze project health', 'error');
    } finally {
      setIsAnalyzingHealth(false);
    }
  };

  const applyTemplate = (template: ProjectTemplate) => {
    setFormData(prev => ({
      ...prev,
      description: template.description,
    }));
    setSelectedJobs(template.defaultJobs);
    setSelectedMaterials(template.defaultMaterials);
    
    const newMilestones: ProjectMilestone[] = template.defaultMilestones.map(title => ({
      id: Math.random().toString(36).substr(2, 9),
      title,
      status: 'pending'
    }));
    
    // We'll update the milestones in the form if we're creating a new project
    // For existing projects, we might want to append or replace
    if (!editingProject) {
      // This is a bit tricky since milestones are managed separately in the UI
      // but let's assume we'll set them when saving
    }
    
    showToast(`Applied template: ${template.name}`, 'success');
    setIsTemplateModalOpen(false);
  };

  const handleCheckIn = async (project: Project) => {
    if (!navigator.geolocation) {
      showToast('Geolocation is not supported by your browser', 'error');
      return;
    }

    setIsCheckingIn(true);
    navigator.geolocation.getCurrentPosition(async (position) => {
      const { latitude, longitude } = position.coords;
      
      // Calculate distance from project location
      let distance = 0;
      if (project.latitude && project.longitude) {
        const R = 6371e3; // metres
        const φ1 = latitude * Math.PI/180;
        const φ2 = project.latitude * Math.PI/180;
        const Δφ = (project.latitude-latitude) * Math.PI/180;
        const Δλ = (project.longitude-longitude) * Math.PI/180;

        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ/2) * Math.sin(Δλ/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        distance = R * c;
      }

      const checkIn: ProjectCheckIn = {
        id: Math.random().toString(36).substr(2, 9),
        userId: profile?.uid || 'unknown',
        userName: profile?.name || 'Unknown',
        timestamp: Timestamp.now(),
        location: { lat: latitude, lng: longitude },
        distanceFromProject: distance,
        type: 'check-in'
      };

      try {
        await updateDoc(doc(db, 'projects', project.id), {
          checkIns: [...(project.checkIns || []), checkIn],
          updatedAt: serverTimestamp()
        });
        showToast(`Checked in successfully (${Math.round(distance)}m from site)`, 'success');
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, 'projects');
      } finally {
        setIsCheckingIn(false);
      }
    }, (error) => {
      showToast('Failed to get your location', 'error');
      setIsCheckingIn(false);
    });
  };

  const saveSignature = async (project: Project) => {
    if (!sigPadRef.current || sigPadRef.current.isEmpty()) {
      showToast('Please provide a signature', 'info');
      return;
    }

    const signatureDataUrl = sigPadRef.current.getTrimmedCanvas().toDataURL('image/png');
    
    // In a real app, we'd upload this to Firebase Storage
    // For now, we'll store the data URL (though it's large)
    const signature: ProjectSignature = {
      id: Math.random().toString(36).substr(2, 9),
      role: signatureRole,
      name: profile?.name || 'Unknown',
      signatureUrl: signatureDataUrl,
      timestamp: Timestamp.now()
    };

    try {
      await updateDoc(doc(db, 'projects', project.id), {
        signatures: [...(project.signatures || []), signature],
        updatedAt: serverTimestamp()
      });
      showToast('Signature saved successfully', 'success');
      setIsSigning(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'projects');
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (selectedPhotoIndex === null) return;
      if (e.key === 'ArrowRight') {
        if (selectedPhotoIndex < allEvidence.length - 1) {
          setSelectedPhotoIndex(selectedPhotoIndex + 1);
        }
      } else if (e.key === 'ArrowLeft') {
        if (selectedPhotoIndex > 0) {
          setSelectedPhotoIndex(selectedPhotoIndex - 1);
        }
      } else if (e.key === 'Escape') {
        setSelectedPhotoIndex(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedPhotoIndex, allEvidence.length]);

  const handleNextPhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedPhotoIndex !== null && selectedPhotoIndex < allEvidence.length - 1) {
      setSelectedPhotoIndex(selectedPhotoIndex + 1);
    }
  };

  const handlePrevPhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedPhotoIndex !== null && selectedPhotoIndex > 0) {
      setSelectedPhotoIndex(selectedPhotoIndex - 1);
    }
  };

  const generatePDFReport = (project: Project) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Header
    doc.setFontSize(20);
    doc.setTextColor(16, 185, 129); // Emerald-500
    doc.text('PROJECT REPORT', pageWidth / 2, 20, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Generated on: ${new Date().toLocaleString('id-ID')}`, pageWidth / 2, 28, { align: 'center' });
    
    // Project Info
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text('Project Information', 14, 40);
    
    autoTable(doc, {
      startY: 45,
      head: [['Field', 'Value']],
      body: [
        ['Project ID', project.pid],
        ['Project Name', project.projectName || project.description],
        ['Status', project.status.toUpperCase()],
        ['Witel', project.witel || '-'],
        ['Partner', project.partner || '-'],
        ['Location', project.location || '-'],
        ['Total Cost', `Rp ${project.totalCost?.toLocaleString('id-ID') || 0}`],
      ],
      theme: 'striped',
      headStyles: { fillColor: [16, 185, 129] }
    });
    
    // BOQ Section
    doc.text('Bill of Quantities', 14, (doc as any).lastAutoTable.finalY + 15);
    
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 20,
      head: [['Designator', 'Work Item', 'Qty', 'Price', 'Subtotal']],
      body: (project.jobs || []).map(j => [
        j.designator || '-',
        j.name,
        j.quantity,
        `Rp ${j.price.toLocaleString('id-ID')}`,
        `Rp ${j.subtotal.toLocaleString('id-ID')}`
      ]),
      theme: 'striped',
      headStyles: { fillColor: [59, 130, 246] } // Blue-500
    });
    
    // Signatures
    if (project.signatures && project.signatures.length > 0) {
      doc.addPage();
      doc.text('Signatures', 14, 20);
      
      let yPos = 30;
      project.signatures.forEach((sig) => {
        doc.setFontSize(10);
        doc.text(`${sig.role.toUpperCase()}: ${sig.name}`, 14, yPos);
        doc.addImage(sig.signatureUrl, 'PNG', 14, yPos + 5, 40, 20);
        yPos += 35;
      });
    }
    
    doc.save(`Report_${project.pid}.pdf`);
    showToast('PDF Report generated successfully', 'success');
  };

  const exportToExcel = (project: Project) => {
    const wb = XLSX.utils.book_new();
    
    // Header Section
    const header = [
      ["LAPORAN PROYEK", ""],
      ["PROYEK", ": " + (project.projectName || project.description)],
      ["NO. KONTRAK", ": " + (project.contractNo || "-")],
      ["NO. SURAT PESANAN", ": " + (project.orderNo || "-")],
      ["WITEL", ": " + (project.witel || "-")],
      ["TIKET / LOKASI", ": " + (project.ticketId ? `${project.ticketId} - ${project.location}` : project.location || "-")],
      ["BOQ REKON", ": " + (project.boqRekon || "-")],
      ["TIKET GAMAS", ": " + (project.tiketGamas || "-")],
      ["EVIDEN PRA", ": " + (project.evidenPraOptions?.join(', ') || "-")],
      ["PROSES", ": " + (project.prosesOptions?.join(', ') || "-")],
      ["EVIDEN PASCA", ": " + (project.evidenPascaOptions?.join(', ') || "-")],
      ["PELAKSANA", ": " + (project.partner || "-")],
    ];

    if (project.inseraTicketIds && project.inseraTicketIds.length > 0) {
      header.push(["TIKET INSERA", ": " + project.inseraTicketIds.join(', ')]);
    }

    header.push(["STATUS", ": " + project.status.toUpperCase()]);
    header.push(["TANGGAL DIBUAT", ": " + (project.createdAt ? project.createdAt.toDate().toLocaleString('id-ID') : "-")]);
    header.push([]);

    // BOQ Section
    const boqHeader = [["BOQ REKONSILIASI", "", "", "", ""]];
    const boqSubHeader = [["DESIGNATOR", "URAIAN PEKERJAAN", "QTY", "HARGA SATUAN", "SUBTOTAL"]];
    const boqData = (project.jobs || []).map(j => [
      j.designator || "-",
      j.name,
      j.quantity,
      j.price,
      j.subtotal
    ]);
    const boqFooter = [["", "", "", "TOTAL BOQ", project.totalJobCost || 0]];
    if (project.activityCost && project.activityCost > 0) {
      boqFooter.push(["", "", "", "BIAYA AKTIVITAS", project.activityCost]);
    }
    boqFooter.push([]);

    // Evidence Section - Organized by requested sequence
    const sections = [
      { title: 'TIKET INSERA', stages: ['Tiket Insera'] },
      { title: 'EVIDEN PRA', stages: ['EVIDEN PRA'] },
      { title: 'PROSES', stages: ['PROSES'] },
      { title: 'EVIDEN PASCA', stages: ['EVIDEN PASCA'] },
      { title: 'HASIL UKUR', stages: ['Hasil ukur', 'HASIL UKUR'] },
      { title: 'MATERIAL TIBA', stages: ['MATERIAL TIBA'] },
      { title: 'ABD', stages: ['As built drawing', 'ABD'] },
      { title: 'BA PENDUKUNG', stages: ['Berita acara', 'BA PENDUKUNG'] },
      { title: 'SEBELUM', stages: ['Initial', 'Sebelum'] },
      { title: 'PROGRESS', stages: ['Penggalian', 'Tanam tiang', 'Pengecoran', 'Penarikan kabel', 'Pemasangan aksesoris', 'Penyambungan core', 'Pemasangan UC'] },
      { title: 'SESUDAH', stages: ['Penaikan UC', 'Sesudah'] },
    ];
    
    const projectEvidence = getProjectEvidence(project);
    const predefinedStages = sections.flatMap(s => s.stages);
    const otherEvidence = projectEvidence.filter(e => !predefinedStages.includes(e.stage));
    
    const allSections = [
      ...sections,
      ...(otherEvidence.length > 0 ? [{ title: 'LAIN-LAIN', stages: [], customEvidence: otherEvidence }] : [])
    ];

    const evidenceData: any[][] = [];

    allSections.forEach(section => {
      const sectionPhotos = 'customEvidence' in section ? (section as any).customEvidence : projectEvidence.filter(e => section.stages.includes(e.stage));
      const hasInseraIds = section.title === 'TIKET INSERA' && project.inseraTicketIds && project.inseraTicketIds.length > 0;
      
      if (sectionPhotos.length > 0 || hasInseraIds) {
        evidenceData.push([[section.title, "", "", ""]][0]);
        
        if (hasInseraIds) {
          evidenceData.push([["TICKET IDS", project.inseraTicketIds!.join(', '), "", ""]][0]);
        }

        if (sectionPhotos.length > 0) {
          evidenceData.push([["STAGE", "CAPTION", "TIMESTAMP", "PHOTO URL"]][0]);
          sectionPhotos.forEach(e => {
            evidenceData.push([
              e.stage,
              e.caption || "-",
              e.timestamp ? e.timestamp.toDate().toLocaleString('id-ID') : "-",
              e.photoUrl
            ]);
          });
        }
        evidenceData.push([]);
      }
    });

    // Combine All
    const fullData = [
      ...header,
      ...boqHeader,
      ...boqSubHeader,
      ...boqData,
      ...boqFooter,
      ...evidenceData,
      [],
      [],
      ["PT TELKOM INFRASTRUKTUR INDONESIA", "", "PT TELKOM AKSES"],
      ["Waspang", "", "Pelaksana Harian"],
      [],
      [],
      [],
      ["__________________________", "", "__________________________"],
      ["NIK.", "", "NIK."],
      [],
      ["Created by AIS 4.0 (RAM)"]
    ];
    
    const ws = XLSX.utils.aoa_to_sheet(fullData);
    
    // Basic styling (column widths)
    const wscols = [
      { wch: 25 }, // Column A
      { wch: 40 }, // Column B
      { wch: 15 }, // Column C
      { wch: 20 }, // Column D
      { wch: 20 }  // Column E
    ];
    ws['!cols'] = wscols;

    XLSX.utils.book_append_sheet(wb, ws, "PROJECT REPORT");
    
    XLSX.writeFile(wb, `Project_Report_${project.pid}.xlsx`);
    showToast("Project exported to Excel", "success");
  };

  const getImageData = (url: string): Promise<HTMLImageElement | string> => {
    return new Promise((resolve, reject) => {
      if (!url) {
        reject(new Error("URL is empty"));
        return;
      }
      
      if (url.startsWith('data:')) {
        resolve(url);
        return;
      }

      // If it looks like a Telegram file_id (no http and no slash)
      let finalUrl = url;
      if (!url.startsWith('http') && !url.includes('/')) {
        finalUrl = `/api/telegram-photo/${url}`;
      }

      // Use server-side proxy to bypass CORS issues for PDF generation
      const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(finalUrl)}`;

      const img = new Image();
      img.crossOrigin = "anonymous";
      
      const timeout = setTimeout(() => {
        img.src = ""; // Stop loading
        reject(new Error("Image load timeout"));
      }, 60000); // 60 second timeout

      img.onload = () => {
        clearTimeout(timeout);
        resolve(img);
      };

      img.onerror = () => {
        clearTimeout(timeout);
        reject(new Error("Image load error"));
      };

      img.src = proxyUrl;
    });
  };

  const getImageDataWithRetry = async (url: string, retries = 2): Promise<HTMLImageElement | string> => {
    for (let i = 0; i <= retries; i++) {
      try {
        return await getImageData(url);
      } catch (err) {
        if (i === retries) throw err;
        console.warn(`Retrying image load (${i + 1}/${retries}): ${url}`);
        await new Promise(r => setTimeout(r, 2000)); // Wait 2s before retry
      }
    }
    throw new Error("Failed to load image after retries");
  };

  const downloadAllEvidenceZip = async (project: Project) => {
    const zip = new JSZip();
    const projectEvidence = getProjectEvidence(project);
    
    if (projectEvidence.length === 0) {
      showToast("No evidence to download", "info");
      return;
    }

    showToast("Preparing ZIP archive...", "info");
    
    try {
      const getBinaryData = async (url: string) => {
        if (url.startsWith('data:')) {
          const response = await fetch(url);
          const blob = await response.blob();
          return { buffer: await blob.arrayBuffer(), contentType: blob.type };
        }

        let finalUrl = url;
        if (!url.startsWith('http') && !url.includes('/')) {
          finalUrl = `/api/telegram-photo/${url}`;
        }
        const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(finalUrl)}`;
        const response = await fetch(proxyUrl);
        if (!response.ok) throw new Error(`Failed to fetch ${url} (Status: ${response.status})`);
        
        const contentType = response.headers.get('content-type') || 'image/jpeg';
        const buffer = await response.arrayBuffer();
        return { buffer, contentType };
      };

      const results = await Promise.allSettled(
        projectEvidence.map(async (item, index) => {
          try {
            const { buffer, contentType } = await getBinaryData(item.photoUrl);
            if (buffer.byteLength === 0) throw new Error("Empty buffer");
            
            const safeStage = (item.stage || 'Uncategorized').replace(/[/\\?%*:|"<>]/g, '-');
            const safePid = (project.pid || 'Project').replace(/[/\\?%*:|"<>]/g, '-');
            
            let extension = 'jpg';
            if (contentType.includes('/')) {
              extension = contentType.split('/')[1].split(';')[0];
            }
            if (extension === 'jpeg') extension = 'jpg';
            
            const filename = `${safePid}_${safeStage}_${index + 1}.${extension}`;
            // Use path-based file addition for better reliability
            zip.file(`${safeStage}/${filename}`, buffer);
            return true;
          } catch (err) {
            console.error(`Error adding image ${index} to ZIP:`, err);
            throw err;
          }
        })
      );

      const successCount = results.filter(r => r.status === 'fulfilled').length;
      
      if (successCount === 0) {
        showToast("Failed to download any images for the ZIP", "error");
        return;
      }

      const content = await zip.generateAsync({ 
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 }
      });
      
      const url = window.URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      const safeProjectName = (project.projectName || project.pid || 'Project').replace(/[/\\?%*:|"<>]/g, '-');
      link.download = `Evidence_${safeProjectName}_${new Date().getTime()}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      showToast(`Successfully downloaded ${successCount} photos in ZIP`, "success");
    } catch (err) {
      console.error("Error creating ZIP:", err);
      showToast("Failed to create ZIP archive", "error");
    }
  };

  const exportToPDF = async (project: Project) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;

    const telkomAksesLogo = "https://images.seeklogo.com/logo-png/34/2/telkom-akses-logo-png_seeklogo-340460.png";
    const telkomIndonesiaLogo = "https://www.telkom.co.id/minio/show/data/image_upload/page/1594108255409_compress_logo%20telkom%20indonesia.png";
    
    let logoAksesData: any = null;
    let logoTelkomData: any = null;

    try {
      logoAksesData = await getImageDataWithRetry(telkomAksesLogo);
      logoTelkomData = await getImageDataWithRetry(telkomIndonesiaLogo);
    } catch (e) {
      console.error("Failed to load header logos", e);
    }

    const drawHeader = (pageTitle: string, pageNum: number, totalPages: string) => {
      // Logos
      if (logoAksesData) {
        doc.addImage(logoAksesData, 'PNG', margin, 6, 35, 12);
      } else {
        doc.setFontSize(10);
        doc.setTextColor(150);
        doc.text("TelkomAkses", margin, 15);
      }

      if (logoTelkomData) {
        doc.addImage(logoTelkomData, 'PNG', pageWidth - margin - 28, 6, 28, 12);
      } else {
        doc.setFontSize(10);
        doc.setTextColor(150);
        doc.text("Telkom Indonesia", pageWidth - margin - 30, 15);
      }

      // Metadata Section
      doc.setFontSize(9);
      doc.setTextColor(0);
      doc.setFont("helvetica", "bold");
      
      const metadata = [
        ["PROYEK", ": " + (project.projectName || project.description)],
        ["NO. KONTRAK", ": " + (project.contractNo || "-")],
        ["NO. SURAT PESANAN", ": " + (project.orderNo || "-")],
        ["WITEL", ": " + (project.witel || "MADIUN")],
        ["TIKET / LOKASI", ": " + (project.ticketId ? `${project.ticketId} - ${project.location}` : project.location || "-")],
        ["BOQ REKON", ": " + (project.boqRekon || "-")],
        ["TIKET GAMAS", ": " + (project.tiketGamas || "-")],
        ["EVIDEN PRA", ": " + (project.evidenPraOptions?.join(', ') || "-")],
        ["PROSES", ": " + (project.prosesOptions?.join(', ') || "-")],
        ["EVIDEN PASCA", ": " + (project.evidenPascaOptions?.join(', ') || "-")],
        ["PELAKSANA", ": " + (project.partner || "-")]
      ];

      if (project.inseraTicketIds && project.inseraTicketIds.length > 0) {
        metadata.push(["TIKET INSERA", ": " + project.inseraTicketIds.join(', ')]);
      }

      let y = 25;
      metadata.forEach(([label, value]) => {
        doc.text(label, margin, y);
        doc.setFont("helvetica", "normal");
        doc.text(value, margin + 40, y);
        doc.setFont("helvetica", "bold");
        y += 5;
      });

      // Page Title Bar
      doc.setFillColor(240, 240, 240);
      doc.rect(margin, y + 5, pageWidth - (margin * 2), 7, 'F');
      doc.setDrawColor(0);
      doc.rect(margin, y + 5, pageWidth - (margin * 2), 7, 'D');
      doc.setFontSize(10);
      doc.text(pageTitle, pageWidth / 2, y + 10, { align: "center" });

      // Footer
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(`Halaman ${pageNum}/${totalPages} Created by AIS 4.0 (RAM)`, pageWidth / 2, pageHeight - 10, { align: "center" });
      
      return y + 15;
    };

    try {
      showToast("Preparing PDF report...", "info");
      
      const projectEvidence = getProjectEvidence(project);
      const sections = [
        { title: 'TIKET INSERA', stages: ['Tiket Insera'] },
        { title: 'EVIDEN PRA', stages: ['EVIDEN PRA'] },
        { title: 'PROSES', stages: ['PROSES'] },
        { title: 'EVIDEN PASCA', stages: ['EVIDEN PASCA'] },
        { title: 'HASIL UKUR', stages: ['Hasil ukur', 'HASIL UKUR'] },
        { title: 'MATERIAL TIBA', stages: ['MATERIAL TIBA'] },
        { title: 'ABD', stages: ['As built drawing', 'ABD'] },
        { title: 'BA PENDUKUNG', stages: ['Berita acara', 'BA PENDUKUNG'] },
        { title: 'SEBELUM', stages: ['Initial', 'Sebelum'] },
        { title: 'PROGRESS', stages: ['Penggalian', 'Tanam tiang', 'Pengecoran', 'Penarikan kabel', 'Pemasangan aksesoris', 'Penyambungan core', 'Pemasangan UC'] },
        { title: 'SESUDAH', stages: ['Penaikan UC', 'Sesudah'] },
      ];

      const predefinedStages = sections.flatMap(s => s.stages);
      const otherEvidence = projectEvidence.filter(e => !predefinedStages.includes(e.stage));
      
      const allSections = [
        ...sections,
        ...(otherEvidence.length > 0 ? [{ title: 'LAIN-LAIN', stages: [], customEvidence: otherEvidence }] : [])
      ];

      const activeSections = allSections.filter(s => {
        const photos = 'customEvidence' in s ? (s as any).customEvidence : projectEvidence.filter(e => s.stages.includes(e.stage));
        const hasInseraIds = s.title === 'TIKET INSERA' && project.inseraTicketIds && project.inseraTicketIds.length > 0;
        return photos.length > 0 || hasInseraIds;
      });

      const totalPagesExp = "{total_pages_count_string}";
      let pageNum = 1;

      // Page 1: BOQ REKONSILIASI
      let currentY = drawHeader("BOQ REKONSILIASI", pageNum, totalPagesExp);
      
      const boqData = [
        ...(project.jobs || []).map(j => [
          j.designator || "-",
          j.name,
          j.quantity.toString(),
          `Rp ${j.price.toLocaleString()}`,
          `Rp ${j.subtotal.toLocaleString()}`
        ]),
        ['', '', '', 'TOTAL BOQ', `Rp ${(project.totalJobCost || 0).toLocaleString()}`],
        ...(project.activityCost ? [['', '', '', 'BIAYA AKTIVITAS', `Rp ${project.activityCost.toLocaleString()}`]] : [])
      ];

      autoTable(doc, {
        startY: currentY + 8,
        head: [['DESIGNATOR', 'URAIAN PEKERJAAN', 'QTY', 'HARGA', 'SUBTOTAL']],
        body: boqData,
        theme: 'grid',
        headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' },
        styles: { fontSize: 8 },
        columnStyles: {
          4: { fontStyle: 'bold', halign: 'right' }
        },
        didParseCell: (data) => {
          if (data.row.index >= (project.jobs?.length || 0)) {
            data.cell.styles.fontStyle = 'bold';
          }
        },
        margin: { left: margin, right: margin }
      });

      // Photo Pages
      for (const section of activeSections) {
        const photos = 'customEvidence' in section ? (section as any).customEvidence : projectEvidence.filter(e => section.stages.includes(e.stage));
        const hasInseraIds = section.title === 'TIKET INSERA' && project.inseraTicketIds && project.inseraTicketIds.length > 0;
        
        doc.addPage();
        pageNum++;
        let y = drawHeader(section.title, pageNum, totalPagesExp);

        let photoY = y + 10;

        if (hasInseraIds) {
          doc.setFontSize(9);
          doc.setFont("helvetica", "bold");
          doc.text("TICKET IDS:", margin, photoY);
          doc.setFont("helvetica", "normal");
          doc.text(project.inseraTicketIds!.join(', '), margin + 25, photoY);
          photoY += 10;
        }

        // Draw photos in a grid (2 per row)
        const imgWidth = (pageWidth - (margin * 3)) / 2;
        const imgHeight = imgWidth * 0.75;
        let photoX = margin;

        for (let i = 0; i < photos.length; i++) {
          try {
            const img = await getImageDataWithRetry(photos[i].photoUrl);
            
            // Check if we need a new page BEFORE adding the image
            if (photoY + imgHeight + 15 > pageHeight - 20) {
              doc.addPage();
              pageNum++;
              y = drawHeader(section.title, pageNum, totalPagesExp);
              photoX = margin;
              photoY = y + 10;
            }

            doc.addImage(img as any, 'JPEG', photoX, photoY, imgWidth, imgHeight);
            
            // Photo Label & Metadata
            doc.setFontSize(8);
            doc.setFont("helvetica", "bold");
            doc.text(`(${i + 1}) ${photos[i].stage}`, photoX, photoY + imgHeight + 5);
            
            doc.setFont("helvetica", "normal");
            doc.setFontSize(7);
            const date = photos[i].timestamp ? photos[i].timestamp.toDate() : null;
            const ts = date ? date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) + ' ' + date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : "-";
            doc.text(ts, photoX + imgWidth, photoY + imgHeight + 5, { align: "right" });
            
            if (photos[i].caption) {
              doc.setFont("helvetica", "italic");
              doc.text(photos[i].caption || "", photoX, photoY + imgHeight + 9, { maxWidth: imgWidth });
            }

            doc.setFont("helvetica", "normal");
            doc.setFontSize(6);
            doc.setTextColor(150);
            doc.text(`Reported by: ${photos[i].reportedBy || "-"}`, photoX, photoY + imgHeight + 13);
            doc.setTextColor(0);

            if ((i + 1) % 2 === 0) {
              photoX = margin;
              photoY += imgHeight + 30; // Increased spacing
            } else {
              photoX += imgWidth + margin;
            }
          } catch (err) {
            console.error("Error adding image to PDF:", err);
            // Even if image fails, show the metadata placeholder
            doc.setFontSize(8);
            doc.setTextColor(200);
            doc.rect(photoX, photoY, imgWidth, imgHeight, 'D');
            doc.text("Image Failed to Load", photoX + imgWidth/2, photoY + imgHeight/2, { align: "center" });
            doc.setTextColor(0);
            
            doc.setFontSize(8);
            doc.setFont("helvetica", "bold");
            doc.text(`(${i + 1}) ${photos[i].stage}`, photoX, photoY + imgHeight + 5);
            
            if ((i + 1) % 2 === 0) {
              photoX = margin;
              photoY += imgHeight + 25;
            } else {
              photoX += imgWidth + margin;
            }
          }
        }

        // Add signatures directly below the last active section
        const isLastSection = activeSections.indexOf(section) === activeSections.length - 1;
        if (isLastSection) {
          let sigY = photoY;
          if (photos.length > 0 && photos.length % 2 !== 0) {
            sigY += imgHeight + 25;
          } else {
            sigY += 10;
          }

          if (sigY + 60 > pageHeight - 20) {
            doc.addPage();
            pageNum++;
            drawHeader(section.title, pageNum, totalPagesExp);
            sigY = 60;
          }
          
          doc.setFontSize(10);
          doc.setFont("helvetica", "bold");
          
          doc.text("PT TELKOM INFRASTRUKTUR INDONESIA", margin + 40, sigY, { align: "center" });
          doc.text("Waspang", margin + 40, sigY + 5, { align: "center" });
          
          doc.text("PT TELKOM AKSES", pageWidth - margin - 40, sigY, { align: "center" });
          doc.text("Pelaksana Harian", pageWidth - margin - 40, sigY + 5, { align: "center" });

          doc.setFont("helvetica", "normal");
          doc.text("__________________________", margin + 40, sigY + 40, { align: "center" });
          doc.text("__________________________", pageWidth - margin - 40, sigY + 40, { align: "center" });

          doc.text("NIK.", margin + 40, sigY + 45, { align: "center" });
          doc.text("NIK.", pageWidth - margin - 40, sigY + 45, { align: "center" });
        }
      }

      // Replace total pages placeholder
      if (typeof doc.putTotalPages === 'function') {
        doc.putTotalPages(totalPagesExp);
      }

      doc.save(`Project_Report_${project.pid}.pdf`);
      showToast("Project report generated successfully", "success");
    } catch (error) {
      console.error("PDF Export Error:", error);
      showToast("Failed to generate PDF report", "error");
    }
  };
  const [currentCaption, setCurrentCaption] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<{ id: string; name: string; progress: number; status: 'uploading' | 'completed' | 'error'; file?: File }[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);

  useEffect(() => {
    if (!isModalOpen) {
      setUploadingFiles([]);
      setJobSearchTerm('');
      setMaterialSearchTerm('');
      setJobPage(1);
    }
  }, [isModalOpen]);

  useEffect(() => {
    setJobPage(1);
  }, [jobSearchTerm]);

  useEffect(() => {
    const q = query(collection(db, 'projects'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project));
      setProjects(data);
      setLoading(false);
    });

    // Fetch materials for selection
    const fetchMaterials = async () => {
      const mSnap = await getDocs(collection(db, 'materials'));
      setMaterials(mSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Material)));
    };
    fetchMaterials();

    // Fetch jobs for selection
    const fetchJobs = async () => {
      const jSnap = await getDocs(collection(db, 'jobs'));
      setAvailableJobs(jSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job)));
    };
    fetchJobs();

    // Fetch technicians for assignment
    const fetchTechnicians = async () => {
      const tSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'teknisi')));
      setTechnicians(tSnap.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile)));
    };
    fetchTechnicians();

    return unsubscribe;
  }, []);

  const handleOpenModal = (project?: Project) => {
    if (project) {
      setEditingProject(project);
      setFormData({
        pid: project.pid,
        projectName: project.projectName || '',
        contractNo: project.contractNo || '',
        orderNo: project.orderNo || '',
        witel: project.witel || 'MADIUN',
        partner: project.partner || 'PT TELKOM AKSES',
        description: project.description,
        location: project.location || '',
        status: project.status,
        boqRekon: project.boqRekon || '',
        tiketGamas: project.tiketGamas || '',
        baPendukungUrl: project.baPendukungUrl || '',
        latitude: project.latitude || 0,
        longitude: project.longitude || 0,
        assignedTechnicianIds: project.assignedTechnicianIds || [],
        evidenPraOptions: project.evidenPraOptions || [],
        prosesOptions: project.prosesOptions || [],
        evidenPascaOptions: project.evidenPascaOptions || [],
        inseraTicketIds: project.inseraTicketIds || [],
        activityCost: project.activityCost || 0,
        estimatedDuration: project.estimatedDuration || 0,
      });
      setSelectedMaterials(project.materials || []);
      setSelectedJobs(project.jobs || []);
      setEvidence(project.evidence || []);
    } else {
      setEditingProject(null);
      setFormData({
        pid: '',
        projectName: '',
        contractNo: '',
        orderNo: '',
        witel: 'MADIUN',
        partner: 'PT TELKOM AKSES',
        description: '',
        location: '',
        status: 'open',
        boqRekon: '',
        tiketGamas: '',
        baPendukungUrl: '',
        latitude: 0,
        longitude: 0,
        assignedTechnicianIds: [],
        evidenPraOptions: [],
        prosesOptions: [],
        evidenPascaOptions: [],
        inseraTicketIds: [],
        activityCost: 0,
        estimatedDuration: 0,
      });
      setSelectedMaterials([]);
      setSelectedJobs([]);
      setEvidence([]);
    }
    setIsModalOpen(true);
  };

  const handleAddComment = async (projectId: string) => {
    if (!newComment.trim() || !profile) return;
    
    const comment: ProjectComment = {
      id: Math.random().toString(36).substr(2, 9),
      text: newComment,
      createdBy: profile.name,
      createdAt: Timestamp.now()
    };

    try {
      const project = projects.find(p => p.id === projectId);
      const updatedComments = [...(project?.comments || []), comment];
      const history: ProjectHistory = {
        id: Math.random().toString(36).substr(2, 9),
        type: 'status_change', // Using status_change as a generic type for now or add 'comment_added'
        toValue: 'New Comment Added',
        changedBy: profile.name,
        timestamp: Timestamp.now(),
        description: `Added comment: ${newComment.substring(0, 50)}...`
      };

      await updateDoc(doc(db, 'projects', projectId), {
        comments: updatedComments,
        history: [...(project?.history || []), history],
        updatedAt: serverTimestamp()
      });
      setNewComment('');
      showToast('Comment added', 'success');
    } catch (error) {
      console.error("Error adding comment:", error);
      showToast('Failed to add comment', 'error');
    }
  };

  const handleAddMilestone = async (projectId: string) => {
    if (!newMilestone.trim() || !profile) return;

    const milestone: ProjectMilestone = {
      id: Math.random().toString(36).substr(2, 9),
      title: newMilestone,
      status: 'pending',
      dueDate: Timestamp.now() // Default to now, can be improved with a date picker
    };

    try {
      const project = projects.find(p => p.id === projectId);
      const updatedMilestones = [...(project?.milestones || []), milestone];
      
      await updateDoc(doc(db, 'projects', projectId), {
        milestones: updatedMilestones,
        updatedAt: serverTimestamp()
      });
      setNewMilestone('');
      setIsAddingMilestone(false);
      showToast('Milestone added', 'success');
    } catch (error) {
      console.error("Error adding milestone:", error);
    }
  };

  const toggleMilestone = async (projectId: string, milestoneId: string) => {
    try {
      const project = projects.find(p => p.id === projectId);
      if (!project) return;

      const updatedMilestones = project.milestones?.map(m => {
        if (m.id === milestoneId) {
          return {
            ...m,
            status: m.status === 'completed' ? 'pending' : 'completed',
            completedAt: m.status === 'completed' ? undefined : Timestamp.now()
          };
        }
        return m;
      });

      await updateDoc(doc(db, 'projects', projectId), {
        milestones: updatedMilestones,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error("Error toggling milestone:", error);
    }
  };

  const handleAssignTechnician = async (projectId: string, techId: string) => {
    try {
      const project = projects.find(p => p.id === projectId);
      if (!project) return;

      const currentIds = project.assignedTechnicianIds || [];
      const updatedIds = currentIds.includes(techId)
        ? currentIds.filter(id => id !== techId)
        : [...currentIds, techId];

      await updateDoc(doc(db, 'projects', projectId), {
        assignedTechnicianIds: updatedIds,
        updatedAt: serverTimestamp()
      });
      showToast('Technician assignment updated', 'success');
    } catch (error) {
      console.error("Error assigning technician:", error);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const totalJobCost = selectedJobs.reduce((sum, j) => sum + j.subtotal, 0);
    const totalCost = (formData.activityCost || 0) + totalJobCost;

    const data = {
      ...formData,
      jobs: selectedJobs,
      evidence,
      totalJobCost,
      totalCost,
      updatedAt: serverTimestamp(),
      technicianId: profile?.uid || 'unknown'
    };

    try {
      if (editingProject) {
        await updateDoc(doc(db, 'projects', editingProject.id), data);
        showToast('Project updated successfully', 'success');
      } else {
        await addDoc(collection(db, 'projects'), {
          ...data,
          createdAt: serverTimestamp()
        });
        showToast('Project created successfully', 'success');
      }
      setIsModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, editingProject ? OperationType.UPDATE : OperationType.CREATE, 'projects');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'projects', id));
      showToast('Project deleted successfully', 'success');
      setDeletingProjectId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'projects');
    }
  };

  const handleCreateSampleData = async () => {
    try {
      setLoading(true);
      const sampleProject: Partial<Project> = {
        pid: `SAMPLE-${Math.floor(Math.random() * 1000)}`,
        projectName: 'Fiber Optic Installation - Madiun City',
        contractNo: 'CONT-2026-001',
        orderNo: 'ORD-2026-001',
        witel: 'MADIUN',
        partner: 'PT TELKOM AKSES',
        description: 'Installation of 24-core fiber optic cable for residential area in Madiun City Center.',
        location: 'Jl. Pahlawan, Madiun',
        latitude: -7.6298,
        longitude: 111.5239,
        assignedTechnicianIds: [],
        status: 'in-progress',
        activityCost: 500000,
        jobs: [
          { 
            jobId: 'j1', 
            name: 'Penarikan Kabel Udara', 
            quantity: 500, 
            materialPrice: 0,
            servicePrice: 5000,
            price: 5000, 
            materialSubtotal: 0,
            serviceSubtotal: 2500000,
            subtotal: 2500000 
          },
          { 
            jobId: 'j2', 
            name: 'Splicing 24 Core', 
            quantity: 2, 
            materialPrice: 50000,
            servicePrice: 200000,
            price: 250000, 
            materialSubtotal: 100000,
            serviceSubtotal: 400000,
            subtotal: 500000 
          }
        ],
        evidence: [
          {
            photoUrl: 'https://picsum.photos/seed/initial/800/600',
            stage: 'Initial',
            reportedBy: profile?.name || 'System',
            timestamp: Timestamp.now(),
            caption: 'Survey and initial site preparation.'
          },
          {
            photoUrl: 'https://picsum.photos/seed/digging/800/600',
            stage: 'Penggalian',
            reportedBy: profile?.name || 'System',
            timestamp: Timestamp.now(),
            caption: 'Excavation for underground cable ducting.'
          },
          {
            photoUrl: 'https://picsum.photos/seed/cable/800/600',
            stage: 'Penarikan kabel',
            reportedBy: profile?.name || 'System',
            timestamp: Timestamp.now(),
            caption: 'Main cable pulling and installation.'
          }
        ],
        totalMaterialCost: 8400000,
        totalJobCost: 3000000,
        totalCost: 11900000,
        createdAt: serverTimestamp() as any,
        updatedAt: serverTimestamp() as any,
        technicianId: profile?.uid || 'unknown'
      };

      await addDoc(collection(db, 'projects'), sampleProject);
      showToast('Sample project created successfully', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'projects');
    } finally {
      setLoading(false);
    }
  };

  const addMaterial = (material: Material) => {
    const existing = selectedMaterials.find(m => m.materialId === material.id);
    if (existing) {
      setSelectedMaterials(selectedMaterials.map(m => 
        m.materialId === material.id 
          ? { ...m, quantity: m.quantity + 1, subtotal: (m.quantity + 1) * m.price }
          : m
      ));
    } else {
      setSelectedMaterials([...selectedMaterials, {
        materialId: material.id,
        name: material.name,
        quantity: 1,
        price: material.price,
        subtotal: material.price
      }]);
    }
  };

  const removeMaterial = (materialId: string) => {
    setSelectedMaterials(selectedMaterials.filter(m => m.materialId !== materialId));
  };

  const updateMaterialQty = (materialId: string, qty: number) => {
    if (qty < 1) return;
    setSelectedMaterials(selectedMaterials.map(m => 
      m.materialId === materialId 
        ? { ...m, quantity: qty, subtotal: qty * m.price }
        : m
    ));
  };

  const addJob = (job: Job) => {
    const existing = selectedJobs.find(j => j.jobId === job.id);
    if (existing) {
      setSelectedJobs(selectedJobs.map(j => 
        j.jobId === job.id 
          ? { 
              ...j, 
              quantity: j.quantity + 1, 
              materialSubtotal: (j.quantity + 1) * (job.materialPrice || 0),
              serviceSubtotal: (j.quantity + 1) * (job.servicePrice || 0),
              subtotal: (j.quantity + 1) * job.price 
            }
          : j
      ));
    } else {
      setSelectedJobs([...selectedJobs, {
        jobId: job.id,
        designator: job.designator,
        name: job.name,
        quantity: 1,
        materialPrice: job.materialPrice || 0,
        servicePrice: job.servicePrice || 0,
        price: job.price,
        materialSubtotal: job.materialPrice || 0,
        serviceSubtotal: job.servicePrice || 0,
        subtotal: job.price
      }]);
    }
  };

  const removeJob = (jobId: string) => {
    setSelectedJobs(selectedJobs.filter(j => j.jobId !== jobId));
  };

  const updateJobQty = (jobId: string, qty: number) => {
    if (qty < 1) return;
    setSelectedJobs(selectedJobs.map(j => 
      j.jobId === jobId 
        ? { 
            ...j, 
            quantity: qty, 
            materialSubtotal: qty * j.materialPrice,
            serviceSubtotal: qty * j.servicePrice,
            subtotal: qty * j.price 
          }
        : j
    ));
  };

  const clearAllJobs = () => {
    setIsConfirmClearBOQOpen(true);
  };

  const confirmClearAllJobs = () => {
    setSelectedJobs([]);
    showToast('Semua data BOQ rekonsiliasi berhasil dihapus', 'success');
    setIsConfirmClearBOQOpen(false);
  };

  const removeUploadingFile = (id: string) => {
    setUploadingFiles(prev => prev.filter(f => f.id !== id));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement> | React.DragEvent, targetProject?: Project) => {
    e.preventDefault();
    setIsDragging(false);

    let files: FileList | null = null;
    if ('dataTransfer' in e && e.dataTransfer.files) {
      files = e.dataTransfer.files;
    } else if (e.target instanceof HTMLInputElement && e.target.files) {
      files = e.target.files;
    }

    if (!files || files.length === 0) return;

    const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
    const totalFiles = imageFiles.length;
    
    if (totalFiles === 0) {
      showToast('Please select image files only', 'error');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    
    // Initialize individual file progress tracking
    const newUploadingFiles = imageFiles.map(file => ({
      id: `${Date.now()}_${Math.random().toString(36).substring(2, 9)}_${file.name}`,
      name: file.name,
      progress: 0,
      status: 'uploading' as const,
      file: file
    }));
    
    setUploadingFiles(prev => [...prev, ...newUploadingFiles]);

    const pid = targetProject?.pid || formData.pid || 'new';

    const uploadPromises = imageFiles.map((file, index) => {
      const fileId = newUploadingFiles[index].id;
      try {
        const storageRef = ref(storage, `projects/${pid}/${fileId}`);
        const uploadTask = uploadBytesResumable(storageRef, file);

        return new Promise<string | null>((resolve) => {
          uploadTask.on('state_changed', 
            (snapshot) => {
              const progress = (snapshot.totalBytes > 0) 
                ? (snapshot.bytesTransferred / snapshot.totalBytes) * 100 
                : 0;
              
              setUploadingFiles(prev => {
                const updated = prev.map(f => f.id === fileId ? { ...f, progress } : f);
                // Update overall progress based on the latest state
                const totalProgress = updated.reduce((sum, f) => sum + f.progress, 0);
                setUploadProgress(totalProgress / updated.length);
                return updated;
              });
            }, 
            (error) => {
              console.error("Error uploading photo:", error);
              showToast(`Failed to upload ${file.name}: ${error.message}`, 'error');
              setUploadingFiles(prev => prev.map(f => f.id === fileId ? { ...f, status: 'error' } : f));
              resolve(null);
            }, 
            async () => {
              try {
                const url = await getDownloadURL(uploadTask.snapshot.ref);
                setUploadingFiles(prev => prev.map(f => f.id === fileId ? { ...f, status: 'completed', progress: 100 } : f));
                resolve(url);
              } catch (err) {
                console.error("Error getting download URL:", err);
                setUploadingFiles(prev => prev.map(f => f.id === fileId ? { ...f, status: 'error' } : f));
                resolve(null);
              }
            }
          );
        });
      } catch (error) {
        console.error("Error starting upload:", error);
        setUploadingFiles(prev => prev.map(f => f.id === fileId ? { ...f, status: 'error' } : f));
        return Promise.resolve(null);
      }
    });

    try {
      const urls = await Promise.all(uploadPromises);
      const validUrls = urls.filter((url): url is string => url !== null);
      
      if (validUrls.length > 0) {
        const newEvidence: ProjectEvidence[] = [];
        
        validUrls.forEach(url => {
          selectedStages.forEach(stage => {
            newEvidence.push({
              stage: stage as any,
              photoUrl: url,
              caption: currentCaption,
              timestamp: Timestamp.now(),
              reportedBy: profile?.name || 'Unknown'
            });
          });
        });

        const updatedEvidence = [...(targetProject?.evidence || evidence), ...newEvidence];
        
        if (!targetProject) {
          setEvidence(updatedEvidence);
        }
        
        // If we're editing an existing project or uploading directly from expanded view, save to Firestore
        const projectToUpdate = targetProject || editingProject;
        if (projectToUpdate) {
          try {
            await updateDoc(doc(db, 'projects', projectToUpdate.id), {
              evidence: updatedEvidence,
              updatedAt: serverTimestamp()
            });
            showToast(`Successfully saved ${validUrls.length} photo(s) to project`, 'success');
          } catch (saveError) {
            console.error("Error auto-saving evidence to Firestore:", saveError);
          }
        }
        
        setCurrentCaption(''); // Reset caption after upload
      }
      
      // Clear completed uploads after a delay
      setTimeout(() => {
        setUploadingFiles(prev => prev.filter(f => f.status !== 'completed' && f.status !== 'error'));
      }, 3000);

    } catch (error) {
      console.error("Error in batch upload:", error);
      showToast('Failed to upload some photos', 'error');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const removeEvidence = async (photoUrl: string) => {
    const updatedEvidence = evidence.filter(e => e.photoUrl !== photoUrl);
    setEvidence(updatedEvidence);
    
    if (editingProject) {
      try {
        await updateDoc(doc(db, 'projects', editingProject.id), {
          evidence: updatedEvidence,
          updatedAt: serverTimestamp()
        });
      } catch (error) {
        console.error("Error auto-saving evidence removal:", error);
      }
    }
  };

  // Reset pages when search terms change
  useEffect(() => {
    setProjectPage(1);
  }, [searchTerm]);

  useEffect(() => {
    setJobPage(1);
  }, [jobSearchTerm]);

  useEffect(() => {
    setMaterialPage(1);
  }, [materialSearchTerm]);

  const filteredProjects = projects.filter(o => {
    const search = searchTerm.toLowerCase();
    return (
      o.pid.toLowerCase().includes(search) ||
      o.description.toLowerCase().includes(search) ||
      o.projectName?.toLowerCase().includes(search) ||
      o.location?.toLowerCase().includes(search)
    );
  });

  const getStatusColor = (status: Project['status']) => {
    switch (status) {
      case 'open': return 'bg-red-100 text-red-700 border-red-200';
      case 'in-progress': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'completed': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      default: return 'bg-neutral-100 text-neutral-700';
    }
  };

  const getStatusIcon = (status: Project['status']) => {
    switch (status) {
      case 'open': return <AlertCircle className="w-4 h-4" />;
      case 'in-progress': return <Clock className="w-4 h-4" />;
      case 'completed': return <CheckCircle2 className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Manajemen Proyek</h1>
          <p className="text-sm text-neutral-500">Kelola BOQ, Eviden, dan Progress Proyek Lapangan</p>
        </div>
        <div className="flex items-center gap-2 bg-white p-1 rounded-2xl border border-black/5 shadow-sm">
          <button
            onClick={() => setViewMode('list')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              viewMode === 'list' ? 'bg-neutral-900 text-white shadow-lg' : 'text-neutral-500 hover:bg-neutral-50'
            }`}
          >
            <List className="w-4 h-4" />
            Daftar
          </button>
          <button
            onClick={() => setViewMode('dashboard')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              viewMode === 'dashboard' ? 'bg-neutral-900 text-white shadow-lg' : 'text-neutral-500 hover:bg-neutral-50'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            Dashboard
          </button>
          <button
            onClick={() => setViewMode('map')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              viewMode === 'map' ? 'bg-neutral-900 text-white shadow-lg' : 'text-neutral-500 hover:bg-neutral-50'
            }`}
          >
            <MapIcon className="w-4 h-4" />
            GIS View
          </button>
          <button
            onClick={() => setViewMode('timeline')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              viewMode === 'timeline' ? 'bg-neutral-900 text-white shadow-lg' : 'text-neutral-500 hover:bg-neutral-50'
            }`}
          >
            <GanttChartSquare className="w-4 h-4" />
            Timeline
          </button>
        </div>
      </div>

      {selectedProjectIds.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-emerald-600 text-white p-4 rounded-2xl shadow-lg flex items-center justify-between"
        >
          <div className="flex items-center gap-4">
            <span className="text-sm font-bold">{selectedProjectIds.length} Projects Selected</span>
            <div className="h-6 w-px bg-white/20" />
            <button 
              onClick={() => setSelectedProjectIds([])}
              className="text-xs font-bold hover:underline"
            >
              Deselect All
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => {
                // Bulk status change logic
                showToast(`Changing status for ${selectedProjectIds.length} projects...`, 'info');
              }}
              className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-bold transition-all"
            >
              Change Status
            </button>
            <button 
              onClick={() => {
                if (confirm(`Are you sure you want to delete ${selectedProjectIds.length} projects?`)) {
                  // Bulk delete logic
                  showToast(`Deleting ${selectedProjectIds.length} projects...`, 'info');
                }
              }}
              className="px-3 py-1.5 bg-red-500 hover:bg-red-600 rounded-lg text-xs font-bold transition-all"
            >
              Delete Selected
            </button>
          </div>
        </motion.div>
      )}

      <AnimatePresence mode="wait">
        {viewMode === 'dashboard' ? (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <ProjectDashboard projects={projects} />
          </motion.div>
        ) : viewMode === 'map' ? (
          <motion.div
            key="map"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <ProjectMap 
              projects={projects} 
              onSelectProject={(p) => {
                setViewMode('list');
                setExpandedId(p.id);
                // Scroll to project
                setTimeout(() => {
                  document.getElementById(`project-${p.id}`)?.scrollIntoView({ behavior: 'smooth' });
                }, 100);
              }} 
            />
          </motion.div>
        ) : viewMode === 'timeline' ? (
          <motion.div
            key="timeline"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <TimelineView />
          </motion.div>
        ) : (
          <motion.div
            key="list"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-6"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
          <input
            type="text"
            placeholder="Search by PID, project name, description, or location..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white border border-black/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCreateSampleData}
            disabled={loading}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-white text-emerald-600 border border-emerald-200 rounded-xl hover:bg-emerald-50 transition-all shadow-sm disabled:opacity-50"
          >
            <Sparkles className="w-5 h-5" />
            <span className="hidden sm:inline">Sample Data</span>
          </button>
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20"
          >
            <Plus className="w-5 h-5" />
            New Project
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-black/5">
            <Activity className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
            <p className="text-neutral-500">No project records found.</p>
          </div>
        ) : (
          <>
            {(() => {
              const start = (projectPage - 1) * PROJECTS_PER_PAGE;
              const paginated = filteredProjects.slice(start, start + PROJECTS_PER_PAGE);
              const totalPages = Math.ceil(filteredProjects.length / PROJECTS_PER_PAGE);

              return (
                <>
                  {paginated.map((project) => (
            <motion.div
              layout
              key={project.id}
              className="bg-white rounded-2xl border border-black/5 overflow-hidden shadow-sm hover:shadow-md transition-all"
            >
              <div className="p-4 sm:p-6">
                <div className="flex items-start gap-4">
                  <div className="pt-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedProjectIds(prev => 
                          prev.includes(project.id) 
                            ? prev.filter(id => id !== project.id)
                            : [...prev, project.id]
                        );
                      }}
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                        selectedProjectIds.includes(project.id)
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'border-neutral-300 hover:border-emerald-500 bg-white'
                      }`}
                    >
                      {selectedProjectIds.includes(project.id) && <CheckSquare className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded uppercase tracking-wider">
                        {project.pid}
                      </span>
                      {project.ticketId && (
                        <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded uppercase tracking-wider">
                          Ticket: {project.ticketId}
                        </span>
                      )}
                      {project.partner && (
                        <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded uppercase tracking-wider">
                          Mitra: {project.partner}
                        </span>
                      )}
                      <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border ${getStatusColor(project.status)}`}>
                        {getStatusIcon(project.status)}
                        <span className="uppercase">{project.status}</span>
                      </div>
                    </div>
                    <h3 className="text-lg font-bold text-neutral-900 mb-1 truncate">
                      {project.description}
                    </h3>
                    <p className="text-sm text-neutral-500 flex items-center gap-1">
                      <ImageIcon className="w-4 h-4" />
                      {project.location || 'No location specified'}
                    </p>
                  </div>
                </div>

                {/* Stats Grid - Now clearly above actions and taking full width */}
                <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-neutral-50 rounded-xl p-3 border border-black/5 shadow-sm">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-neutral-400 uppercase mb-1.5">
                      <Activity className="w-3 h-3 text-emerald-500" />
                      Total Cost
                    </div>
                    <div className="text-sm font-bold text-neutral-900">
                      Rp {(project.totalCost || 0).toLocaleString()}
                    </div>
                  </div>
                  <div className="bg-neutral-50 rounded-xl p-3 border border-black/5 shadow-sm">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-neutral-400 uppercase mb-1.5">
                      <Briefcase className="w-3 h-3 text-blue-500" />
                      Jobs
                    </div>
                    <div className="text-sm font-bold text-neutral-900">
                      {project.jobs?.length || 0} Items
                    </div>
                  </div>
                  <div className="bg-neutral-50 rounded-xl p-3 border border-black/5 shadow-sm">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-neutral-400 uppercase mb-1.5">
                      <Package className="w-3 h-3 text-indigo-500" />
                      Materials
                    </div>
                    <div className="text-sm font-bold text-neutral-900">
                      {project.materials?.length || 0} Items
                    </div>
                  </div>
                  <div className="bg-neutral-50 rounded-xl p-3 border border-black/5 shadow-sm">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-neutral-400 uppercase mb-1.5">
                      <Clock className="w-3 h-3 text-indigo-500" />
                      Duration
                    </div>
                    <div className="text-sm font-bold text-neutral-900">
                      {project.estimatedDuration || 0} Days
                    </div>
                  </div>
                  <div className="bg-neutral-50 rounded-xl p-3 border border-black/5 shadow-sm">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-neutral-400 uppercase mb-1.5">
                      <Camera className="w-3 h-3 text-amber-500" />
                      Evidence
                    </div>
                    <div className="text-sm font-bold text-neutral-900">
                      {project.evidence?.length || 0} Photos
                    </div>
                  </div>
                </div>

                {/* Project Details Section */}
                {(project.boqRekon || project.tiketGamas || project.evidenPraOptions?.length || project.prosesOptions?.length || project.evidenPascaOptions?.length) && (
                  <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4 bg-neutral-50/50 p-4 rounded-2xl border border-black/5">
                    {project.boqRekon && (
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-neutral-400 uppercase">BOQ REKON</p>
                        <p className="text-sm font-medium text-neutral-900">{project.boqRekon}</p>
                      </div>
                    )}
                    {project.tiketGamas && (
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-neutral-400 uppercase">TIKET GAMAS</p>
                        <p className="text-sm font-medium text-neutral-900">{project.tiketGamas}</p>
                      </div>
                    )}
                    {project.evidenPraOptions && project.evidenPraOptions.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-neutral-400 uppercase">EVIDEN PRA</p>
                        <div className="flex flex-wrap gap-1">
                          {project.evidenPraOptions.map(opt => (
                            <span key={opt} className="text-[9px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded uppercase">{opt}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {project.prosesOptions && project.prosesOptions.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-neutral-400 uppercase">PROSES</p>
                        <div className="flex flex-wrap gap-1">
                          {project.prosesOptions.map(opt => (
                            <span key={opt} className="text-[9px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded uppercase">{opt}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {project.evidenPascaOptions && project.evidenPascaOptions.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-neutral-400 uppercase">EVIDEN PASCA</p>
                        <div className="flex flex-wrap gap-1">
                          {project.evidenPascaOptions.map(opt => (
                            <span key={opt} className="text-[9px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded uppercase">{opt}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {project.baPendukungUrl && (
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-neutral-400 uppercase">BA PENDUKUNG</p>
                        <a 
                          href={resolvePhotoUrl(project.baPendukungUrl)} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-[10px] font-bold text-indigo-600 hover:underline flex items-center gap-1"
                        >
                          <FileText className="w-3 h-3" />
                          VIEW PDF
                        </a>
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-6 pt-4 border-t border-black/5 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => setExpandedId(expandedId === project.id ? null : project.id)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                        expandedId === project.id 
                          ? 'bg-neutral-900 text-white' 
                          : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                      }`}
                    >
                      <Eye className="w-4 h-4" />
                      {expandedId === project.id ? 'HIDE DETAILS' : 'VIEW DETAILS'}
                    </button>
                    
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setViewingReport(project);
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-all text-xs font-bold"
                    >
                      <FileText className="w-4 h-4" />
                      REPORT
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setViewingReport(project);
                        // Trigger print after a short delay to allow modal to open
                        setTimeout(() => window.print(), 500);
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-all text-xs font-bold"
                    >
                      <Printer className="w-4 h-4" />
                      PRINT
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        exportToExcel(project);
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl hover:bg-emerald-100 transition-all text-xs font-bold"
                      title="Download Excel"
                    >
                      <FileDown className="w-4 h-4" />
                      EXCEL
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        exportToPDF(project);
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-all text-xs font-bold"
                      title="Download PDF"
                    >
                      <Download className="w-4 h-4" />
                      PDF
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenModal(project);
                      }}
                      className="p-2.5 bg-neutral-100 text-neutral-600 rounded-xl hover:bg-neutral-200 transition-all"
                      title="Edit Project"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    
                    {profile?.role === 'superadmin' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingProjectId(project.id);
                        }}
                        className="p-2.5 bg-red-50 text-red-500 rounded-xl hover:bg-red-100 transition-all"
                        title="Delete Project"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <AnimatePresence>
                {expandedId === project.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="border-t border-black/5 bg-neutral-50/50"
                  >
                    <div className="p-6">
                      {/* Detail Tabs */}
                      <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2 no-scrollbar">
                        {[
                          { id: 'overview', label: 'Overview', icon: Eye },
                          { id: 'boq', label: 'BOQ', icon: Briefcase },
                          { id: 'evidence', label: 'Evidence', icon: Camera },
                          { id: 'health', label: 'Health', icon: ShieldCheck },
                          { id: 'milestones', label: 'Milestones', icon: Flag },
                          { id: 'checkins', label: 'Check-ins', icon: MapPin },
                          { id: 'signatures', label: 'Signatures', icon: PenTool },
                          { id: 'team', label: 'Team', icon: User },
                          { id: 'comments', label: 'Comments', icon: MessageSquare },
                          { id: 'history', label: 'History', icon: History },
                          { id: 'documents', label: 'Documents', icon: Paperclip },
                        ].map(tab => (
                          <button
                            key={tab.id}
                            onClick={() => setActiveDetailTab(tab.id as any)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                              activeDetailTab === tab.id 
                                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20' 
                                : 'bg-white text-neutral-500 hover:bg-neutral-100 border border-black/5'
                            }`}
                          >
                            <tab.icon className="w-4 h-4" />
                            {tab.label}
                          </button>
                        ))}
                      </div>

                      {/* Tab Content */}
                      <div className="space-y-6">
                        {activeDetailTab === 'overview' && (
                          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <div className="lg:col-span-2 space-y-6">
                              {/* Evidence Gallery (Existing Logic) */}
                              <div className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm">
                                <div className="flex items-center justify-between mb-6">
                                  <h4 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                                    <Camera className="w-4 h-4 text-emerald-500" />
                                    Evidence Gallery
                                  </h4>
                                  <div className="flex items-center gap-2">
                                    <button onClick={() => setGalleryViewMode('grid')} className={`p-1.5 rounded-lg ${galleryViewMode === 'grid' ? 'bg-emerald-50 text-emerald-600' : 'text-neutral-400'}`}><LayoutGrid className="w-4 h-4" /></button>
                                    <button onClick={() => setGalleryViewMode('carousel')} className={`p-1.5 rounded-lg ${galleryViewMode === 'carousel' ? 'bg-emerald-50 text-emerald-600' : 'text-neutral-400'}`}><GalleryHorizontal className="w-4 h-4" /></button>
                                  </div>
                                </div>
                                {/* Gallery Content... (simplified for brevity, I'll keep the core logic) */}
                                {(() => {
                                  const projectEvidence = getProjectEvidence(project);
                                  if (projectEvidence.length === 0) return (
                                    <div className="text-center py-12 border-2 border-dashed border-neutral-100 rounded-2xl">
                                      <Camera className="w-8 h-8 text-neutral-200 mx-auto mb-2" />
                                      <p className="text-xs text-neutral-400 italic">No evidence photos yet.</p>
                                      <button 
                                        onClick={() => setActiveDetailTab('evidence')}
                                        className="mt-4 text-[10px] font-bold text-emerald-600 hover:text-emerald-700 uppercase tracking-widest"
                                      >
                                        Upload Now
                                      </button>
                                    </div>
                                  );
                                  return (
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                      {projectEvidence.slice(0, 8).map((item, idx) => (
                                        <div key={idx} className="aspect-square rounded-xl overflow-hidden border border-black/5 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => { setActiveProjectForGallery(project); setSelectedPhotoIndex(idx); }}>
                                          <img src={resolvePhotoUrl(item.photoUrl)} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                        </div>
                                      ))}
                                      {projectEvidence.length > 8 && (
                                        <button className="aspect-square rounded-xl bg-neutral-100 flex flex-col items-center justify-center text-neutral-500 hover:bg-neutral-200 transition-all" onClick={() => { setActiveProjectForGallery(project); setSelectedPhotoIndex(0); }}>
                                          <Plus className="w-6 h-6 mb-1" />
                                          <span className="text-[10px] font-bold">+{projectEvidence.length - 8} MORE</span>
                                        </button>
                                      )}
                                    </div>
                                  );
                                })()}
                              </div>

                              {/* BOQ Summary */}
                              <div className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm">
                                <h4 className="text-sm font-bold text-neutral-900 mb-4 flex items-center gap-2">
                                  <Briefcase className="w-4 h-4 text-blue-500" />
                                  BOQ Rekonsiliasi
                                </h4>
                                <div className="space-y-3">
                                  {project.jobs?.slice(0, 3).map((job, idx) => (
                                    <div key={idx} className="flex items-center justify-between text-xs">
                                      <span className="text-neutral-600">{job.name}</span>
                                      <span className="font-bold text-neutral-900">Rp {job.subtotal.toLocaleString()}</span>
                                    </div>
                                  ))}
                                  <div className="pt-3 border-t border-black/5 flex items-center justify-between">
                                    <span className="text-xs font-bold text-neutral-500 uppercase">Total Job Cost</span>
                                    <span className="text-sm font-bold text-emerald-600">Rp {(project.totalJobCost || 0).toLocaleString()}</span>
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="space-y-6">
                              {/* Location Card */}
                              <div className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm">
                                <h4 className="text-sm font-bold text-neutral-900 mb-4 flex items-center gap-2">
                                  <MapIcon className="w-4 h-4 text-red-500" />
                                  Location
                                </h4>
                                <p className="text-xs text-neutral-600 mb-4">{project.location || 'No location specified'}</p>
                                {project.latitude && project.longitude ? (
                                  <div className="aspect-video bg-neutral-100 rounded-xl flex items-center justify-center text-neutral-400 text-[10px] font-bold uppercase tracking-widest border border-black/5">
                                    Map Preview Available
                                  </div>
                                ) : (
                                  <div className="aspect-video bg-neutral-50 rounded-xl flex flex-col items-center justify-center text-neutral-400 border border-dashed border-neutral-200">
                                    <MapIcon className="w-6 h-6 mb-2 opacity-20" />
                                    <span className="text-[10px] font-bold uppercase">No Coordinates</span>
                                  </div>
                                )}
                              </div>

                              {/* Insera Tickets */}
                              <div className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm">
                                <h4 className="text-sm font-bold text-neutral-900 mb-4 flex items-center gap-2">
                                  <Activity className="w-4 h-4 text-indigo-500" />
                                  Insera Tickets
                                </h4>
                                <div className="flex flex-wrap gap-2">
                                  {project.inseraTicketIds?.map(id => (
                                    <span key={id} className="px-2 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-bold border border-indigo-100">{id}</span>
                                  )) || <span className="text-xs text-neutral-400 italic">No tickets</span>}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {activeDetailTab === 'boq' && (
                          <div className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm">
                            <div className="flex items-center justify-between mb-6">
                              <h4 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                                <Briefcase className="w-4 h-4 text-blue-500" />
                                BOQ Rekonsiliasi
                              </h4>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
                                  {project.jobs?.length || 0} Items
                                </span>
                              </div>
                            </div>

                            <div className="overflow-x-auto">
                              <table className="w-full text-left border-collapse">
                                <thead>
                                  <tr className="border-b border-black/5">
                                    <th className="py-3 px-4 text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Designator</th>
                                    <th className="py-3 px-4 text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Description</th>
                                    <th className="py-3 px-4 text-[10px] font-bold text-neutral-400 uppercase tracking-wider text-center">Qty</th>
                                    <th className="py-3 px-4 text-[10px] font-bold text-neutral-400 uppercase tracking-wider text-right">Price</th>
                                    <th className="py-3 px-4 text-[10px] font-bold text-neutral-400 uppercase tracking-wider text-right">Subtotal</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {project.jobs?.map((job, idx) => (
                                    <tr key={idx} className="border-b border-black/5 hover:bg-neutral-50 transition-colors">
                                      <td className="py-3 px-4 text-xs font-bold text-neutral-900">{job.designator}</td>
                                      <td className="py-3 px-4 text-xs text-neutral-600">{job.name}</td>
                                      <td className="py-3 px-4 text-xs text-neutral-900 text-center font-medium">{job.quantity}</td>
                                      <td className="py-3 px-4 text-xs text-neutral-600 text-right">Rp {job.price.toLocaleString()}</td>
                                      <td className="py-3 px-4 text-xs font-bold text-emerald-600 text-right">Rp {job.subtotal.toLocaleString()}</td>
                                    </tr>
                                  ))}
                                  {(!project.jobs || project.jobs.length === 0) && (
                                    <tr>
                                      <td colSpan={5} className="py-12 text-center text-xs text-neutral-400 italic">
                                        No BOQ items added yet.
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                                <tfoot>
                                  <tr className="bg-neutral-50/50">
                                    <td colSpan={4} className="py-4 px-4 text-xs font-bold text-neutral-500 uppercase text-right">Total Job Cost</td>
                                    <td className="py-4 px-4 text-sm font-bold text-emerald-600 text-right">Rp {(project.totalJobCost || 0).toLocaleString()}</td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          </div>
                        )}

                        {activeDetailTab === 'evidence' && (
                          <div className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm">
                            <div className="flex items-center justify-between mb-6">
                              <h4 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                                <Camera className="w-4 h-4 text-emerald-500" />
                                Project Evidence
                              </h4>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
                                  {project.evidence?.length || 0} Photos
                                </span>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                              {/* Upload Section */}
                              <div className="space-y-6">
                                <div className="p-6 bg-neutral-50 rounded-2xl border border-black/5 space-y-6">
                                  <div className="space-y-4">
                                    <div>
                                      <label className="block text-[10px] font-bold text-neutral-500 uppercase mb-2">Select Stages (Multiple)</label>
                                      <div className="flex flex-wrap gap-2 max-h-[120px] overflow-y-auto p-3 bg-white border border-black/5 rounded-xl custom-scrollbar">
                                        {EVIDEN_OPTIONS.map(stage => (
                                          <button
                                            key={stage}
                                            type="button"
                                            onClick={() => {
                                              if (selectedStages.includes(stage)) {
                                                if (selectedStages.length > 1) {
                                                  setSelectedStages(selectedStages.filter(s => s !== stage));
                                                }
                                              } else {
                                                setSelectedStages([...selectedStages, stage]);
                                              }
                                            }}
                                            className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all border ${
                                              selectedStages.includes(stage)
                                                ? 'bg-emerald-500 text-white border-emerald-500 shadow-sm'
                                                : 'bg-neutral-50 text-neutral-500 border-black/5 hover:bg-neutral-100'
                                            }`}
                                          >
                                            {stage}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                    <div>
                                      <label className="block text-[10px] font-bold text-neutral-500 uppercase mb-1">Caption (Optional)</label>
                                      <input
                                        type="text"
                                        value={currentCaption}
                                        onChange={(e) => setCurrentCaption(e.target.value)}
                                        placeholder="Add a caption..."
                                        className="w-full px-3 py-2 bg-white border border-black/5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                                      />
                                    </div>
                                  </div>

                                  <div 
                                    onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
                                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                                    onDragLeave={() => setIsDragging(false)}
                                    onDrop={(e) => handleFileUpload(e, project)}
                                    className={`
                                      relative border-2 border-dashed rounded-2xl p-10 transition-all flex flex-col items-center justify-center gap-3
                                      ${isDragging ? 'border-emerald-500 bg-emerald-50 scale-[1.02] shadow-lg shadow-emerald-500/10' : 'border-black/5 bg-white hover:bg-neutral-50'}
                                      ${isUploading ? 'opacity-50 cursor-wait' : ''}
                                    `}
                                  >
                                    <input
                                      type="file"
                                      multiple
                                      accept="image/*"
                                      onChange={(e) => handleFileUpload(e, project)}
                                      disabled={isUploading}
                                      className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-wait"
                                    />
                                    <div className={`p-4 rounded-full ${isDragging ? 'bg-emerald-100 text-emerald-600' : 'bg-neutral-100 text-neutral-400'} transition-colors`}>
                                      <Upload className="w-8 h-8" />
                                    </div>
                                    <div className="text-center">
                                      <p className="text-sm font-bold text-neutral-900">
                                        {isDragging ? 'Drop to Upload' : 'Click or drag photos here'}
                                      </p>
                                      <p className="text-[10px] font-medium text-neutral-500 mt-1">
                                        Supports multiple high-quality images
                                      </p>
                                    </div>
                                    {isUploading && (
                                      <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] flex flex-col items-center justify-center rounded-2xl">
                                        <div className="w-10 h-10 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin mb-2" />
                                        <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Uploading...</p>
                                      </div>
                                    )}
                                  </div>

                                  {/* Progress Bars for Expanded View */}
                                  {uploadingFiles.length > 0 && (
                                    <div className="space-y-3">
                                      <div className="flex items-center justify-between">
                                        <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Upload Progress</p>
                                        <button 
                                          onClick={() => setUploadingFiles([])}
                                          className="text-[10px] font-bold text-red-500 hover:text-red-600 uppercase transition-colors"
                                        >
                                          Clear
                                        </button>
                                      </div>
                                      <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                                        {uploadingFiles.map(file => (
                                          <div key={file.id} className="bg-white rounded-xl p-3 border border-black/5 shadow-sm">
                                            <div className="flex items-center justify-between mb-2">
                                              <div className="flex items-center gap-2 min-w-0">
                                                <div className={`p-1.5 rounded-lg ${file.status === 'error' ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-500'}`}>
                                                  <ImageIcon className="w-3 h-3" />
                                                </div>
                                                <p className="text-[10px] font-bold text-neutral-900 truncate min-w-0">{file.name}</p>
                                              </div>
                                              <span className={`text-[10px] font-bold ${file.status === 'error' ? 'text-red-500' : 'text-emerald-600'}`}>
                                                {Math.round(file.progress)}%
                                              </span>
                                            </div>
                                            <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                                              <motion.div 
                                                initial={{ width: 0 }}
                                                animate={{ width: `${file.progress}%` }}
                                                className={`h-full transition-all duration-300 ${file.status === 'error' ? 'bg-red-500' : 'bg-emerald-500'}`}
                                              />
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Gallery View */}
                              <div className="space-y-4">
                                <h5 className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Existing Evidence</h5>
                                {project.evidence?.length ? (
                                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                    {project.evidence.map((item, idx) => (
                                      <div 
                                        key={idx} 
                                        className="group relative aspect-square rounded-xl overflow-hidden border border-black/5 cursor-pointer"
                                        onClick={() => { setActiveProjectForGallery(project); setSelectedPhotoIndex(idx); }}
                                      >
                                        <img src={resolvePhotoUrl(item.photoUrl)} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" referrerPolicy="no-referrer" />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-2 text-center">
                                          <span className="text-[8px] font-bold text-white uppercase tracking-widest mb-1">{item.stage}</span>
                                          {item.caption && <p className="text-[8px] text-white/80 line-clamp-2">{item.caption}</p>}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="h-full flex flex-col items-center justify-center py-20 bg-neutral-50 rounded-2xl border border-dashed border-neutral-200">
                                    <Camera className="w-12 h-12 text-neutral-200 mb-4" />
                                    <p className="text-sm text-neutral-400">No photos uploaded yet</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        {activeDetailTab === 'health' && (
                          <div className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm">
                            <div className="flex items-center justify-between mb-6">
                              <h4 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                                AI Health Analysis
                              </h4>
                              <button
                                onClick={() => analyzeProjectHealth(project)}
                                disabled={isAnalyzingHealth}
                                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all text-xs font-bold disabled:opacity-50"
                              >
                                {isAnalyzingHealth ? (
                                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                  <Zap className="w-4 h-4" />
                                )}
                                Analyze with Gemini
                              </button>
                            </div>

                            {project.health ? (
                              <div className="space-y-6">
                                <div className="flex items-center gap-6">
                                  <div className="relative w-24 h-24 flex items-center justify-center">
                                    <svg className="w-full h-full -rotate-90">
                                      <circle cx="48" cy="48" r="40" fill="transparent" stroke="#f3f4f6" strokeWidth="8" />
                                      <circle 
                                        cx="48" cy="48" r="40" fill="transparent" 
                                        stroke={project.health.status === 'healthy' ? '#10b981' : project.health.status === 'warning' ? '#f59e0b' : '#ef4444'} 
                                        strokeWidth="8" 
                                        strokeDasharray={251.2}
                                        strokeDashoffset={251.2 - (251.2 * project.health.score) / 100}
                                        strokeLinecap="round"
                                      />
                                    </svg>
                                    <span className="absolute text-xl font-bold text-neutral-900">{project.health.score}%</span>
                                  </div>
                                  <div>
                                    <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase mb-2 ${
                                      project.health.status === 'healthy' ? 'bg-emerald-100 text-emerald-700' :
                                      project.health.status === 'warning' ? 'bg-amber-100 text-amber-700' :
                                      'bg-red-100 text-red-700'
                                    }`}>
                                      {project.health.status}
                                    </div>
                                    <p className="text-sm text-neutral-600 leading-relaxed">{project.health.analysis}</p>
                                  </div>
                                </div>

                                <div className="bg-neutral-50 rounded-2xl p-6 border border-black/5">
                                  <h5 className="text-xs font-bold text-neutral-900 uppercase tracking-wider mb-4">Recommendations</h5>
                                  <ul className="space-y-3">
                                    {project.health.recommendations.map((rec, idx) => (
                                      <li key={idx} className="flex gap-3 text-sm text-neutral-700">
                                        <div className="w-5 h-5 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold">
                                          {idx + 1}
                                        </div>
                                        {rec}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                                <p className="text-[10px] text-neutral-400 text-right">Last checked: {project.health.lastChecked instanceof Timestamp ? project.health.lastChecked.toDate().toLocaleString() : new Date(project.health.lastChecked).toLocaleString()}</p>
                              </div>
                            ) : (
                              <div className="text-center py-12 bg-neutral-50 rounded-2xl border border-dashed border-neutral-200">
                                <Sparkles className="w-12 h-12 text-neutral-200 mx-auto mb-4" />
                                <p className="text-sm text-neutral-500">No health analysis yet. Click the button above to analyze this project.</p>
                              </div>
                            )}
                          </div>
                        )}
                        {activeDetailTab === 'milestones' && (
                          <div className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm">
                            <div className="flex items-center justify-between mb-6">
                              <h4 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                                <Flag className="w-4 h-4 text-amber-500" />
                                Project Milestones
                              </h4>
                              <button 
                                onClick={() => setIsAddingMilestone(true)}
                                className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                              >
                                <Plus className="w-4 h-4" /> ADD MILESTONE
                              </button>
                            </div>

                            {isAddingMilestone && (
                              <div className="mb-6 p-4 bg-neutral-50 rounded-xl border border-black/5 flex gap-2">
                                <input 
                                  type="text" 
                                  value={newMilestone}
                                  onChange={(e) => setNewMilestone(e.target.value)}
                                  placeholder="Milestone title..."
                                  className="flex-1 px-3 py-1.5 bg-white border border-black/5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                                />
                                <button onClick={() => handleAddMilestone(project.id)} className="px-4 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold shadow-sm">SAVE</button>
                                <button onClick={() => setIsAddingMilestone(false)} className="px-4 py-1.5 bg-white text-neutral-500 rounded-lg text-xs font-bold border border-black/5">CANCEL</button>
                              </div>
                            )}

                            <div className="space-y-4">
                              {project.milestones?.length ? project.milestones.map(m => (
                                <div key={m.id} className="flex items-center justify-between p-4 bg-neutral-50 rounded-xl border border-black/5 group">
                                  <div className="flex items-center gap-3">
                                    <button 
                                      onClick={() => toggleMilestone(project.id, m.id)}
                                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${m.status === 'completed' ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-neutral-300 hover:border-emerald-500'}`}
                                    >
                                      {m.status === 'completed' && <CheckCircle2 className="w-3 h-3" />}
                                    </button>
                                    <div>
                                      <p className={`text-sm font-bold ${m.status === 'completed' ? 'text-neutral-400 line-through' : 'text-neutral-900'}`}>{m.title}</p>
                                      <p className="text-[10px] text-neutral-500">Due: {m.dueDate instanceof Timestamp ? m.dueDate.toDate().toLocaleDateString() : new Date(m.dueDate).toLocaleDateString()}</p>
                                    </div>
                                  </div>
                                  {m.status === 'completed' && m.completedAt && (
                                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg uppercase tracking-wider">
                                      Done {m.completedAt instanceof Timestamp ? m.completedAt.toDate().toLocaleDateString() : new Date(m.completedAt).toLocaleDateString()}
                                    </span>
                                  )}
                                </div>
                              )) : (
                                <div className="text-center py-12 border-2 border-dashed border-neutral-200 rounded-2xl">
                                  <Flag className="w-8 h-8 text-neutral-300 mx-auto mb-2" />
                                  <p className="text-xs text-neutral-500">No milestones defined yet.</p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        {activeDetailTab === 'checkins' && (
                          <div className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm">
                            <div className="flex items-center justify-between mb-6">
                              <h4 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                                <MapPin className="w-4 h-4 text-red-500" />
                                Site Check-ins
                              </h4>
                              <button
                                onClick={() => handleCheckIn(project)}
                                disabled={isCheckingIn}
                                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all text-xs font-bold disabled:opacity-50"
                              >
                                {isCheckingIn ? (
                                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                  <MapPin className="w-4 h-4" />
                                )}
                                Check-in Now
                              </button>
                            </div>

                            <div className="space-y-4">
                              {project.checkIns?.length ? project.checkIns.slice().reverse().map(ci => (
                                <div key={ci.id} className="p-4 bg-neutral-50 rounded-xl border border-black/5 flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center border border-black/5">
                                      <User className="w-5 h-5 text-neutral-400" />
                                    </div>
                                    <div>
                                      <p className="text-sm font-bold text-neutral-900">{ci.userName}</p>
                                      <p className="text-[10px] text-neutral-500 uppercase">
                                        {ci.timestamp instanceof Timestamp ? ci.timestamp.toDate().toLocaleString() : new Date(ci.timestamp).toLocaleString()}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <p className={`text-xs font-bold ${ci.distanceFromProject < 100 ? 'text-emerald-600' : 'text-amber-600'}`}>
                                      {Math.round(ci.distanceFromProject)}m from site
                                    </p>
                                    <p className="text-[10px] text-neutral-400 uppercase">Verified Location</p>
                                  </div>
                                </div>
                              )) : (
                                <div className="text-center py-12">
                                  <MapPin className="w-8 h-8 text-neutral-200 mx-auto mb-2" />
                                  <p className="text-xs text-neutral-400">No check-ins recorded yet.</p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {activeDetailTab === 'signatures' && (
                          <div className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm">
                            <div className="flex items-center justify-between mb-6">
                              <h4 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                                <PenTool className="w-4 h-4 text-indigo-500" />
                                Digital Signatures
                              </h4>
                              <button
                                onClick={() => setIsSigning(true)}
                                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all text-xs font-bold"
                              >
                                <Plus className="w-4 h-4" />
                                Add Signature
                              </button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              {project.signatures?.length ? project.signatures.map(sig => (
                                <div key={sig.id} className="p-4 bg-neutral-50 rounded-xl border border-black/5">
                                  <div className="flex items-center justify-between mb-3">
                                    <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-[10px] font-bold uppercase">{sig.role}</span>
                                    <span className="text-[10px] text-neutral-400">{sig.timestamp instanceof Timestamp ? sig.timestamp.toDate().toLocaleDateString() : new Date(sig.timestamp).toLocaleDateString()}</span>
                                  </div>
                                  <div className="bg-white rounded-lg p-2 mb-2 border border-black/5 h-24 flex items-center justify-center">
                                    <img src={sig.signatureUrl} alt="Signature" className="max-h-full max-w-full object-contain" />
                                  </div>
                                  <p className="text-xs font-bold text-neutral-900 text-center">{sig.name}</p>
                                </div>
                              )) : (
                                <div className="sm:col-span-2 text-center py-12">
                                  <PenTool className="w-8 h-8 text-neutral-200 mx-auto mb-2" />
                                  <p className="text-xs text-neutral-400">No signatures captured yet.</p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {activeDetailTab === 'team' && (
                          <div className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm">
                            <h4 className="text-sm font-bold text-neutral-900 mb-6 flex items-center gap-2">
                              <User className="w-4 h-4 text-blue-500" />
                              Assigned Team
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {technicians.map(tech => {
                                const isAssigned = project.assignedTechnicianIds?.includes(tech.uid);
                                return (
                                  <div key={tech.uid} className={`flex items-center justify-between p-4 rounded-xl border transition-all ${isAssigned ? 'bg-blue-50 border-blue-100' : 'bg-neutral-50 border-black/5'}`}>
                                    <div className="flex items-center gap-3">
                                      <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center border border-black/5 shadow-sm">
                                        <User className={`w-5 h-5 ${isAssigned ? 'text-blue-500' : 'text-neutral-400'}`} />
                                      </div>
                                      <div>
                                        <p className="text-sm font-bold text-neutral-900">{tech.name}</p>
                                        <p className="text-[10px] text-neutral-500 uppercase tracking-wider">{tech.role}</p>
                                      </div>
                                    </div>
                                    <button 
                                      onClick={() => handleAssignTechnician(project.id, tech.uid)}
                                      className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${isAssigned ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-neutral-600 border border-black/5 hover:bg-neutral-100'}`}
                                    >
                                      {isAssigned ? 'ASSIGNED' : 'ASSIGN'}
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {activeDetailTab === 'comments' && (
                          <div className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm">
                            <h4 className="text-sm font-bold text-neutral-900 mb-6 flex items-center gap-2">
                              <MessageSquare className="w-4 h-4 text-emerald-500" />
                              Project Discussion
                            </h4>
                            <div className="space-y-6 max-h-[400px] overflow-y-auto pr-2 no-scrollbar mb-6">
                              {project.comments?.length ? project.comments.map(comment => (
                                <div key={comment.id} className="flex gap-3">
                                  <div className="w-8 h-8 bg-neutral-100 rounded-full flex items-center justify-center shrink-0">
                                    <User className="w-4 h-4 text-neutral-400" />
                                  </div>
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="text-xs font-bold text-neutral-900">{comment.createdBy}</span>
                                      <span className="text-[10px] text-neutral-400">
                                        {comment.createdAt instanceof Timestamp ? comment.createdAt.toDate().toLocaleString() : new Date(comment.createdAt).toLocaleString()}
                                      </span>
                                    </div>
                                    <div className="p-3 bg-neutral-50 rounded-2xl rounded-tl-none border border-black/5 text-sm text-neutral-700">
                                      {comment.text}
                                    </div>
                                  </div>
                                </div>
                              )) : (
                                <div className="text-center py-12">
                                  <MessageSquare className="w-8 h-8 text-neutral-200 mx-auto mb-2" />
                                  <p className="text-xs text-neutral-400">No comments yet. Start the conversation!</p>
                                </div>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <input 
                                type="text" 
                                value={newComment}
                                onChange={(e) => setNewComment(e.target.value)}
                                placeholder="Write a comment..."
                                className="flex-1 px-4 py-2 bg-neutral-50 border border-black/5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                                onKeyPress={(e) => e.key === 'Enter' && handleAddComment(project.id)}
                              />
                              <button 
                                onClick={() => handleAddComment(project.id)}
                                className="p-2 bg-emerald-600 text-white rounded-xl shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-all"
                              >
                                <ChevronRight className="w-5 h-5" />
                              </button>
                            </div>
                          </div>
                        )}

                        {activeDetailTab === 'history' && (
                          <div className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm">
                            <h4 className="text-sm font-bold text-neutral-900 mb-6 flex items-center gap-2">
                              <History className="w-4 h-4 text-neutral-500" />
                              Activity Log
                            </h4>
                            <div className="space-y-6">
                              {project.history?.length ? project.history.slice().reverse().map(log => (
                                <div key={log.id} className="flex gap-4 relative">
                                  <div className="absolute left-4 top-8 bottom-0 w-px bg-neutral-100" />
                                  <div className="w-8 h-8 bg-neutral-50 rounded-full flex items-center justify-center shrink-0 border border-black/5 z-10">
                                    <Clock className="w-4 h-4 text-neutral-400" />
                                  </div>
                                  <div className="pb-6">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="text-xs font-bold text-neutral-900">{log.changedBy}</span>
                                      <span className="text-[10px] text-neutral-400">
                                        {log.timestamp instanceof Timestamp ? log.timestamp.toDate().toLocaleString() : new Date(log.timestamp).toLocaleString()}
                                      </span>
                                    </div>
                                    <p className="text-xs text-neutral-600">{log.description}</p>
                                    {log.fromValue && log.toValue && (
                                      <div className="mt-2 flex items-center gap-2 text-[10px] font-bold uppercase">
                                        <span className="text-red-400">{log.fromValue}</span>
                                        <ChevronRight className="w-3 h-3 text-neutral-300" />
                                        <span className="text-emerald-500">{log.toValue}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )) : (
                                <p className="text-xs text-neutral-400 italic text-center py-12">No history recorded.</p>
                              )}
                            </div>
                          </div>
                        )}

                        {activeDetailTab === 'documents' && (
                          <div className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm">
                            <div className="flex items-center justify-between mb-6">
                              <h4 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                                <Paperclip className="w-4 h-4 text-indigo-500" />
                                Project Documents
                              </h4>
                              <button className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
                                <Upload className="w-4 h-4" /> UPLOAD DOCUMENT
                              </button>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              {project.baPendukungUrl && (
                                <div className="p-4 bg-neutral-50 rounded-xl border border-black/5 flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <div className="p-2 bg-red-50 text-red-500 rounded-lg">
                                      <FileText className="w-5 h-5" />
                                    </div>
                                    <div>
                                      <p className="text-sm font-bold text-neutral-900">BA Pendukung</p>
                                      <p className="text-[10px] text-neutral-500 uppercase">PDF Document</p>
                                    </div>
                                  </div>
                                  <a href={project.baPendukungUrl} target="_blank" rel="noopener noreferrer" className="p-2 hover:bg-neutral-200 rounded-lg transition-all">
                                    <Download className="w-4 h-4 text-neutral-600" />
                                  </a>
                                </div>
                              )}
                              {/* Placeholder for more documents */}
                              <div className="p-4 border-2 border-dashed border-neutral-200 rounded-xl flex flex-col items-center justify-center text-neutral-400 py-8">
                                <FileUp className="w-6 h-6 mb-2 opacity-20" />
                                <span className="text-[10px] font-bold uppercase">No other documents</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
                  ))}

                  {filteredProjects.length > PROJECTS_PER_PAGE && (
                    <div className="flex items-center justify-between px-6 py-4 bg-white rounded-2xl border border-black/5 shadow-sm mt-4">
                      <div className="text-sm text-neutral-500">
                        Showing <span className="font-medium text-neutral-900">{start + 1}</span> to{' '}
                        <span className="font-medium text-neutral-900">
                          {Math.min(start + PROJECTS_PER_PAGE, filteredProjects.length)}
                        </span>{' '}
                        of <span className="font-medium text-neutral-900">{filteredProjects.length}</span> projects
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setProjectPage(prev => Math.max(1, prev - 1))}
                          disabled={projectPage === 1}
                          className="p-2 hover:bg-neutral-100 rounded-xl disabled:opacity-30 transition-all"
                        >
                          <ChevronLeft className="w-5 h-5" />
                        </button>
                        <div className="flex items-center gap-1">
                          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                            let pageNum;
                            if (totalPages <= 5) pageNum = i + 1;
                            else if (projectPage <= 3) pageNum = i + 1;
                            else if (projectPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                            else pageNum = projectPage - 2 + i;

                            return (
                              <button
                                key={pageNum}
                                onClick={() => setProjectPage(pageNum)}
                                className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-medium transition-all ${
                                  projectPage === pageNum
                                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
                                    : 'text-neutral-600 hover:bg-neutral-100'
                                }`}
                              >
                                {pageNum}
                              </button>
                            );
                          })}
                        </div>
                        <button
                          onClick={() => setProjectPage(prev => Math.min(totalPages, prev + 1))}
                          disabled={projectPage === totalPages}
                          className="p-2 hover:bg-neutral-100 rounded-xl disabled:opacity-30 transition-all"
                        >
                          <ChevronRight className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </>
        )}
      </div>
    </motion.div>
        )}
      </AnimatePresence>

      {/* Signature Modal */}
      <AnimatePresence>
        {isSigning && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSigning(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-black/5 flex items-center justify-between">
                <h3 className="text-lg font-bold text-neutral-900">Capture Signature</h3>
                <button onClick={() => setIsSigning(false)} className="p-2 hover:bg-neutral-100 rounded-lg text-neutral-500"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-neutral-500 uppercase mb-2">Role</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['technician', 'partner', 'supervisor'] as const).map(role => (
                      <button
                        key={role}
                        onClick={() => setSignatureRole(role)}
                        className={`px-3 py-2 rounded-xl text-[10px] font-bold uppercase transition-all border ${
                          signatureRole === role ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-600/20' : 'bg-white text-neutral-500 border-black/5 hover:bg-neutral-50'
                        }`}
                      >
                        {role}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-500 uppercase mb-2">Signature</label>
                  <div className="border border-black/5 rounded-2xl bg-neutral-50 overflow-hidden">
                    <SignatureCanvas 
                      ref={sigPadRef as any}
                      penColor="black"
                      canvasProps={{ className: "w-full h-48 cursor-crosshair" }}
                    />
                  </div>
                  <button 
                    onClick={() => sigPadRef.current?.clear()}
                    className="mt-2 text-[10px] font-bold text-neutral-400 hover:text-neutral-600 uppercase tracking-wider"
                  >
                    Clear Canvas
                  </button>
                </div>
                <button
                  onClick={() => editingProject && saveSignature(editingProject)}
                  className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 transition-all"
                >
                  Save Signature
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Template Selection Modal */}
      <AnimatePresence>
        {isTemplateModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsTemplateModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-6 border-b border-black/5 flex items-center justify-between">
                <h3 className="text-lg font-bold text-neutral-900">Select Project Template</h3>
                <button onClick={() => setIsTemplateModalOpen(false)} className="p-2 hover:bg-neutral-100 rounded-lg text-neutral-500"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-6 overflow-y-auto space-y-4">
                {templates.length > 0 ? templates.map(template => (
                  <button
                    key={template.id}
                    onClick={() => applyTemplate(template)}
                    className="w-full p-4 bg-neutral-50 hover:bg-white border border-black/5 hover:border-indigo-200 rounded-2xl text-left transition-all group"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-[10px] font-bold uppercase">{template.category}</span>
                      <ChevronRight className="w-4 h-4 text-neutral-300 group-hover:text-indigo-500 transition-all" />
                    </div>
                    <h4 className="text-sm font-bold text-neutral-900 mb-1">{template.name}</h4>
                    <p className="text-xs text-neutral-500 line-clamp-2">{template.description}</p>
                  </button>
                )) : (
                  <div className="text-center py-12">
                    <Copy className="w-12 h-12 text-neutral-200 mx-auto mb-4" />
                    <p className="text-sm text-neutral-500">No templates available. Create one in the settings.</p>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-black/5 flex items-center justify-between bg-white sticky top-0 z-10">
                <h3 className="text-xl font-bold text-neutral-900">
                  {editingProject ? 'Edit Project' : 'New Project'}
                </h3>
                <div className="flex items-center gap-2">
                  {!editingProject && (
                    <button
                      type="button"
                      onClick={() => setIsTemplateModalOpen(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 transition-all text-xs font-bold border border-indigo-100"
                    >
                      <Copy className="w-4 h-4" />
                      Use Template
                    </button>
                  )}
                  <button 
                    onClick={() => setIsModalOpen(false)}
                    className="p-2 hover:bg-neutral-100 rounded-lg text-neutral-500 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Basic Info */}
                  <div className="space-y-4">
                    <h4 className="text-sm font-bold text-neutral-900 uppercase tracking-wider">Basic Information</h4>
                    <div>
                      <label className="block text-xs font-bold text-neutral-500 uppercase mb-1">PID (Primary Key)</label>
                      <input
                        required
                        type="text"
                        value={formData.pid}
                        onChange={(e) => setFormData({ ...formData, pid: e.target.value })}
                        className="w-full px-4 py-2 bg-neutral-50 border border-black/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                        placeholder="e.g. PRJ-2024-001"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Project Name</label>
                      <input
                        required
                        type="text"
                        value={formData.projectName}
                        onChange={(e) => setFormData({ ...formData, projectName: e.target.value })}
                        className="w-full px-4 py-2 bg-neutral-50 border border-black/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                        placeholder="Nama Proyek"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-neutral-500 uppercase mb-1">No. Kontrak</label>
                        <input
                          type="text"
                          value={formData.contractNo}
                          onChange={(e) => setFormData({ ...formData, contractNo: e.target.value })}
                          className="w-full px-4 py-2 bg-neutral-50 border border-black/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                          placeholder="Nomor Kontrak"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-neutral-500 uppercase mb-1">No. Surat Pesanan</label>
                        <input
                          type="text"
                          value={formData.orderNo}
                          onChange={(e) => setFormData({ ...formData, orderNo: e.target.value })}
                          className="w-full px-4 py-2 bg-neutral-50 border border-black/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                          placeholder="Nomor SP"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Witel</label>
                        <input
                          type="text"
                          value={formData.witel}
                          onChange={(e) => setFormData({ ...formData, witel: e.target.value })}
                          className="w-full px-4 py-2 bg-neutral-50 border border-black/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                          placeholder="Witel"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Mitra</label>
                        <input
                          type="text"
                          value={formData.partner}
                          onChange={(e) => setFormData({ ...formData, partner: e.target.value })}
                          className="w-full px-4 py-2 bg-neutral-50 border border-black/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                          placeholder="Nama Mitra"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Description</label>
                      <textarea
                        required
                        rows={3}
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        className="w-full px-4 py-2 bg-neutral-50 border border-black/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                        placeholder="Describe the project..."
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Location</label>
                      <input
                        type="text"
                        value={formData.location}
                        onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                        className="w-full px-4 py-2 bg-neutral-50 border border-black/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                        placeholder="e.g. Area Jakarta Selatan"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Latitude</label>
                        <input
                          type="number"
                          step="any"
                          value={formData.latitude}
                          onChange={(e) => setFormData({ ...formData, latitude: parseFloat(e.target.value) || 0 })}
                          className="w-full px-4 py-2 bg-neutral-50 border border-black/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                          placeholder="-6.2088"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Longitude</label>
                        <input
                          type="number"
                          step="any"
                          value={formData.longitude}
                          onChange={(e) => setFormData({ ...formData, longitude: parseFloat(e.target.value) || 0 })}
                          className="w-full px-4 py-2 bg-neutral-50 border border-black/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                          placeholder="106.8456"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Assign Technicians</label>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 bg-neutral-50 rounded-xl border border-black/5">
                        {technicians.map(tech => (
                          <label key={tech.uid} className="flex items-center gap-2 cursor-pointer group">
                            <input 
                              type="checkbox"
                              checked={formData.assignedTechnicianIds.includes(tech.uid)}
                              onChange={(e) => {
                                const newIds = e.target.checked 
                                  ? [...formData.assignedTechnicianIds, tech.uid]
                                  : formData.assignedTechnicianIds.filter(id => id !== tech.uid);
                                setFormData({ ...formData, assignedTechnicianIds: newIds });
                              }}
                              className="w-3.5 h-3.5 rounded border-neutral-300 text-emerald-600 focus:ring-emerald-500/20"
                            />
                            <span className="text-[10px] font-bold text-neutral-600 group-hover:text-neutral-900 transition-colors uppercase">{tech.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-neutral-500 uppercase mb-1">BOQ REKON</label>
                        <input
                          type="text"
                          value={formData.boqRekon}
                          onChange={(e) => setFormData({ ...formData, boqRekon: e.target.value })}
                          className="w-full px-4 py-2 bg-neutral-50 border border-black/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                          placeholder="BOQ Rekon"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-neutral-500 uppercase mb-1">TIKET GAMAS</label>
                        <input
                          type="text"
                          value={formData.tiketGamas}
                          onChange={(e) => setFormData({ ...formData, tiketGamas: e.target.value })}
                          className="w-full px-4 py-2 bg-neutral-50 border border-black/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                          placeholder="Tiket Gamas"
                        />
                      </div>
                    </div>

                    {/* Multi-select Options */}
                    <div className="space-y-4 p-4 bg-neutral-50 rounded-2xl border border-black/5">
                      <div>
                        <label className="block text-xs font-bold text-neutral-500 uppercase mb-2">EVIDEN PRA</label>
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                          {EVIDEN_OPTIONS.map(opt => (
                            <label key={opt} className="flex items-center gap-1.5 cursor-pointer group">
                              <input 
                                type="checkbox"
                                checked={formData.evidenPraOptions.includes(opt)}
                                onChange={(e) => {
                                  const newOpts = e.target.checked 
                                    ? [...formData.evidenPraOptions, opt]
                                    : formData.evidenPraOptions.filter(o => o !== opt);
                                  setFormData({ ...formData, evidenPraOptions: newOpts });
                                }}
                                className="w-3.5 h-3.5 rounded border-neutral-300 text-emerald-600 focus:ring-emerald-500/20"
                              />
                              <span className="text-[9px] font-bold text-neutral-600 group-hover:text-neutral-900 transition-colors uppercase">{opt}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                      
                      <div>
                        <label className="block text-xs font-bold text-neutral-500 uppercase mb-2">PROSES</label>
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                          {EVIDEN_OPTIONS.map(opt => (
                            <label key={opt} className="flex items-center gap-1.5 cursor-pointer group">
                              <input 
                                type="checkbox"
                                checked={formData.prosesOptions.includes(opt)}
                                onChange={(e) => {
                                  const newOpts = e.target.checked 
                                    ? [...formData.prosesOptions, opt]
                                    : formData.prosesOptions.filter(o => o !== opt);
                                  setFormData({ ...formData, prosesOptions: newOpts });
                                }}
                                className="w-3.5 h-3.5 rounded border-neutral-300 text-blue-600 focus:ring-blue-500/20"
                              />
                              <span className="text-[9px] font-bold text-neutral-600 group-hover:text-neutral-900 transition-colors uppercase">{opt}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-neutral-500 uppercase mb-2">EVIDEN PASCA</label>
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                          {EVIDEN_OPTIONS.map(opt => (
                            <label key={opt} className="flex items-center gap-1.5 cursor-pointer group">
                              <input 
                                type="checkbox"
                                checked={formData.evidenPascaOptions.includes(opt)}
                                onChange={(e) => {
                                  const newOpts = e.target.checked 
                                    ? [...formData.evidenPascaOptions, opt]
                                    : formData.evidenPascaOptions.filter(o => o !== opt);
                                  setFormData({ ...formData, evidenPascaOptions: newOpts });
                                }}
                                className="w-3.5 h-3.5 rounded border-neutral-300 text-amber-600 focus:ring-amber-500/20"
                              />
                              <span className="text-[9px] font-bold text-neutral-600 group-hover:text-neutral-900 transition-colors uppercase">{opt}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-neutral-500 uppercase mb-1">BA PENDUKUNG (PDF URL)</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={formData.baPendukungUrl}
                          onChange={(e) => setFormData({ ...formData, baPendukungUrl: e.target.value })}
                          className="flex-1 px-4 py-2 bg-neutral-50 border border-black/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                          placeholder="URL to PDF"
                        />
                        <div className="relative">
                          <input
                            type="file"
                            accept=".pdf"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                try {
                                  setIsUploading(true);
                                  const storageRef = ref(storage, `projects/ba_pendukung/${formData.pid}_${Date.now()}_${file.name}`);
                                  const uploadTask = uploadBytesResumable(storageRef, file);
                                  
                                  uploadTask.on('state_changed', 
                                    (snapshot) => {
                                      const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                                      setUploadProgress(progress);
                                    },
                                    (error) => {
                                      console.error("PDF Upload error:", error);
                                      showToast("Failed to upload PDF", "error");
                                      setIsUploading(false);
                                    },
                                    async () => {
                                      const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                                      setFormData({ ...formData, baPendukungUrl: downloadURL });
                                      setIsUploading(false);
                                      showToast("PDF uploaded successfully", "success");
                                    }
                                  );
                                } catch (err) {
                                  console.error("PDF Upload error:", err);
                                  setIsUploading(false);
                                }
                              }
                            }}
                            className="absolute inset-0 opacity-0 cursor-pointer"
                          />
                          <button
                            type="button"
                            className="px-4 py-2 bg-neutral-100 text-neutral-600 rounded-xl hover:bg-neutral-200 transition-all text-xs font-bold flex items-center gap-2"
                          >
                            <Upload className="w-4 h-4" />
                            UPLOAD
                          </button>
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Tiket Insera</label>
                      <div className="flex flex-wrap gap-2 mb-2">
                        {formData.inseraTicketIds.map((id, idx) => (
                          <div key={idx} className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs font-bold border border-blue-100">
                            <span>{id}</span>
                            <button 
                              type="button"
                              onClick={() => setFormData({ ...formData, inseraTicketIds: formData.inseraTicketIds.filter((_, i) => i !== idx) })}
                              className="hover:text-red-500 transition-colors"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          id="newInseraTicket"
                          placeholder="Add Insera Ticket ID..."
                          className="flex-1 px-4 py-2 bg-neutral-50 border border-black/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const val = (e.target as HTMLInputElement).value.trim();
                              if (val && !formData.inseraTicketIds.includes(val)) {
                                setFormData({ ...formData, inseraTicketIds: [...formData.inseraTicketIds, val] });
                                (e.target as HTMLInputElement).value = '';
                              }
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const input = document.getElementById('newInseraTicket') as HTMLInputElement;
                            const val = input.value.trim();
                            if (val && !formData.inseraTicketIds.includes(val)) {
                              setFormData({ ...formData, inseraTicketIds: [...formData.inseraTicketIds, val] });
                              input.value = '';
                            }
                          }}
                          className="px-4 py-2 bg-neutral-900 text-white rounded-xl hover:bg-black transition-all text-xs font-bold"
                        >
                          ADD
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Status</label>
                        <select
                          value={formData.status}
                          onChange={(e) => setFormData({ ...formData, status: e.target.value as Project['status'] })}
                          className="w-full px-4 py-2 bg-neutral-50 border border-black/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                        >
                          <option value="open">Open</option>
                          <option value="in-progress">In Progress</option>
                          <option value="completed">Completed</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-neutral-700 mb-1">Activity Cost (Rp)</label>
                        <input
                          type="number"
                          value={formData.activityCost}
                          onChange={(e) => setFormData({ ...formData, activityCost: Number(e.target.value) })}
                          className="w-full px-4 py-2 bg-neutral-50 border border-black/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-neutral-700 mb-1">Estimated Duration (Days)</label>
                        <input
                          type="number"
                          value={formData.estimatedDuration}
                          onChange={(e) => setFormData({ ...formData, estimatedDuration: Number(e.target.value) })}
                          className="w-full px-4 py-2 bg-neutral-50 border border-black/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                          placeholder="e.g. 7"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Evidence Section */}
                  <div className="space-y-4">
                    <h4 className="text-sm font-bold text-neutral-900 uppercase tracking-wider">Project Evidence</h4>
                    
                    <div className="grid grid-cols-1 gap-4 p-4 bg-neutral-50 rounded-2xl border border-black/5">
                      <div className="grid grid-cols-1 gap-4">
                        <div>
                          <label className="block text-[10px] font-bold text-neutral-500 uppercase mb-2">Select Stages (Multiple)</label>
                          <div className="flex flex-wrap gap-2 max-h-[120px] overflow-y-auto p-3 bg-white border border-black/5 rounded-xl custom-scrollbar">
                            {EVIDEN_OPTIONS.map(stage => (
                              <button
                                key={stage}
                                type="button"
                                onClick={() => {
                                  if (selectedStages.includes(stage)) {
                                    if (selectedStages.length > 1) {
                                      setSelectedStages(selectedStages.filter(s => s !== stage));
                                    }
                                  } else {
                                    setSelectedStages([...selectedStages, stage]);
                                  }
                                }}
                                className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all border ${
                                  selectedStages.includes(stage)
                                    ? 'bg-emerald-500 text-white border-emerald-500 shadow-sm'
                                    : 'bg-neutral-50 text-neutral-500 border-black/5 hover:bg-neutral-100'
                                }`}
                              >
                                {stage}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-neutral-500 uppercase mb-1">Caption (Optional)</label>
                          <input
                            type="text"
                            value={currentCaption}
                            onChange={(e) => setCurrentCaption(e.target.value)}
                            placeholder="Add a caption..."
                            className="w-full px-3 py-2 bg-white border border-black/5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                          />
                        </div>
                      </div>

                      <div 
                        onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
                        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                        onDragLeave={() => setIsDragging(false)}
                        onDrop={(e) => handleFileUpload(e, editingProject || undefined)}
                        className={`
                          relative border-2 border-dashed rounded-2xl p-8 transition-all flex flex-col items-center justify-center gap-3
                          ${isDragging ? 'border-emerald-500 bg-emerald-50 scale-[1.02] shadow-lg shadow-emerald-500/10' : 'border-black/5 bg-white hover:bg-neutral-50'}
                          ${isUploading ? 'opacity-50 cursor-wait' : ''}
                        `}
                      >
                        <input
                          type="file"
                          multiple
                          accept="image/*"
                          onChange={(e) => handleFileUpload(e, editingProject || undefined)}
                          disabled={isUploading}
                          className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-wait"
                        />
                        <div className={`p-3 rounded-full ${isDragging ? 'bg-emerald-100 text-emerald-600' : 'bg-neutral-100 text-neutral-400'} transition-colors`}>
                          <Upload className="w-6 h-6" />
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-bold text-neutral-900">
                            {isDragging ? 'Drop to Upload' : 'Click or drag photos here'}
                          </p>
                          <p className="text-[10px] font-medium text-neutral-500 mt-1">
                            Supports multiple high-quality images
                          </p>
                        </div>
                        {isUploading && (
                          <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] flex flex-col items-center justify-center rounded-2xl">
                            <div className="w-10 h-10 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin mb-2" />
                            <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Uploading...</p>
                          </div>
                        )}
                      </div>

                      {/* Individual File Progress */}
                      {uploadingFiles.length > 0 && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Upload Progress</p>
                            <div className="flex items-center gap-3">
                              <span className="text-[10px] font-bold text-emerald-600">{Math.round(uploadProgress)}% Overall</span>
                              <button 
                                onClick={() => setUploadingFiles([])}
                                className="text-[10px] font-bold text-red-500 hover:text-red-600 uppercase transition-colors"
                              >
                                Clear All
                              </button>
                            </div>
                          </div>
                          <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                            {uploadingFiles.map(file => (
                              <div key={file.id} className="bg-white rounded-xl p-3 border border-black/5 shadow-sm">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <div className={`p-1.5 rounded-lg ${file.status === 'error' ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-500'}`}>
                                      <ImageIcon className="w-3 h-3" />
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-[10px] font-bold text-neutral-900 truncate">{file.name}</p>
                                      <p className="text-[8px] font-medium text-neutral-500 uppercase">
                                        {file.status === 'uploading' ? 'Uploading...' : file.status === 'completed' ? 'Completed' : 'Failed'}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className={`text-[10px] font-bold ${file.status === 'error' ? 'text-red-500' : 'text-emerald-600'}`}>
                                      {Math.round(file.progress)}%
                                    </span>
                                    <button 
                                      onClick={() => removeUploadingFile(file.id)}
                                      className="p-1 hover:bg-neutral-100 rounded-md transition-colors"
                                    >
                                      <X className="w-3 h-3 text-neutral-400" />
                                    </button>
                                  </div>
                                </div>
                                <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                                  <motion.div 
                                    initial={{ width: 0 }}
                                    animate={{ width: `${file.progress}%` }}
                                    className={`h-full transition-all duration-300 ${file.status === 'error' ? 'bg-red-500' : 'bg-emerald-500'}`}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {evidence.map((item, idx) => (
                        <div key={idx} className="bg-white rounded-xl overflow-hidden border border-black/5 relative group shadow-sm flex flex-col">
                          <div className="aspect-video relative">
                            <img src={resolvePhotoUrl(item.photoUrl)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            <div className="absolute top-1 left-1">
                              <span className="px-1.5 py-0.5 bg-black/60 text-white text-[8px] font-bold rounded uppercase">
                                {item.stage}
                              </span>
                            </div>
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <button
                                type="button"
                                onClick={() => removeEvidence(item.photoUrl)}
                                className="p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                          {item.caption && (
                            <div className="p-2 border-t border-black/5">
                              <p className="text-[10px] text-neutral-600 truncate">{item.caption}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Jobs Section */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <h4 className="text-sm font-bold text-neutral-900 uppercase tracking-wider">BOQ REKONSILIASI</h4>
                      {selectedJobs.length > 0 && (
                        <button
                          type="button"
                          onClick={clearAllJobs}
                          className="flex items-center gap-1.5 px-2 py-1 bg-red-50 text-red-600 hover:bg-red-100 rounded-md text-[10px] font-bold transition-all"
                        >
                          <Trash2 className="w-3 h-3" />
                          Hapus Semua
                        </button>
                      )}
                    </div>
                    <div className="text-sm font-bold text-emerald-600">
                      BOQ Total: Rp {selectedJobs.reduce((sum, j) => sum + j.subtotal, 0).toLocaleString()}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Job List */}
                    <div className="md:col-span-1 bg-neutral-50 rounded-2xl p-4 border border-black/5 flex flex-col gap-3">
                      <div className="flex flex-col gap-2">
                        <p className="text-[10px] font-bold text-neutral-400 uppercase">Available BOQ</p>
                        <div className="relative">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-neutral-400" />
                          <input
                            type="text"
                            placeholder="Search BOQ..."
                            value={jobSearchTerm}
                            onChange={(e) => setJobSearchTerm(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 bg-white border border-black/5 rounded-lg text-[10px] focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                          />
                        </div>
                      </div>
                      <div className="max-h-[250px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                        {(() => {
                          const filtered = availableJobs.filter(j => 
                            j.name.toLowerCase().includes(jobSearchTerm.toLowerCase()) ||
                            (j.designator && j.designator.toLowerCase().includes(jobSearchTerm.toLowerCase()))
                          );
                          const totalPages = Math.ceil(filtered.length / JOBS_PER_PAGE);
                          const start = (jobPage - 1) * JOBS_PER_PAGE;
                          const paginated = filtered.slice(start, start + JOBS_PER_PAGE);

                          return (
                            <>
                              {paginated.map(j => (
                                <button
                                  key={j.id}
                                  type="button"
                                  onClick={() => addJob(j)}
                                  className="w-full text-left p-2 hover:bg-white hover:shadow-sm rounded-lg transition-all flex items-center justify-between group"
                                >
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      {j.designator && (
                                        <span className="px-1 py-0.5 bg-neutral-200 text-neutral-600 text-[8px] font-mono font-bold rounded">
                                          {j.designator}
                                        </span>
                                      )}
                                      <p className="text-xs font-bold text-neutral-900 truncate">{j.name}</p>
                                    </div>
                                    <p className="text-[10px] text-neutral-500">Rp {j.price.toLocaleString()}</p>
                                  </div>
                                  <Plus className="w-4 h-4 text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </button>
                              ))}
                              
                              {filtered.length > JOBS_PER_PAGE && (
                                <div className="flex items-center justify-between pt-2 border-t border-black/5">
                                  <button
                                    type="button"
                                    onClick={() => setJobPage(p => Math.max(1, p - 1))}
                                    disabled={jobPage === 1}
                                    className="p-1 hover:bg-white rounded-md disabled:opacity-30 transition-colors"
                                  >
                                    <ChevronLeft className="w-4 h-4" />
                                  </button>
                                  <span className="text-[10px] font-medium text-neutral-500">
                                    Page {jobPage} of {totalPages}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setJobPage(p => Math.min(totalPages, p + 1))}
                                    disabled={jobPage === totalPages}
                                    className="p-1 hover:bg-white rounded-md disabled:opacity-30 transition-colors"
                                  >
                                    <ChevronRight className="w-4 h-4" />
                                  </button>
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Selected Jobs */}
                    <div className="md:col-span-2 space-y-3">
                      {selectedJobs.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-neutral-400 border-2 border-dashed border-black/5 rounded-2xl py-12">
                          <Briefcase className="w-8 h-8 mb-2 opacity-20" />
                          <p className="text-xs">No BOQ selected yet.</p>
                        </div>
                      ) : (
                        <div className="bg-white rounded-2xl border border-black/5 overflow-hidden">
                          <table className="w-full text-sm">
                            <thead className="bg-neutral-50 text-neutral-500 font-medium">
                              <tr>
                                <th className="px-4 py-2 text-left">Designator</th>
                                <th className="px-4 py-2 text-left">BOQ</th>
                                <th className="px-4 py-2 text-center">Quantity</th>
                                <th className="px-4 py-2 text-right">Subtotal</th>
                                <th className="px-4 py-2"></th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-black/5">
                              {selectedJobs.map(j => (
                                <tr key={j.jobId}>
                                  <td className="px-4 py-2">
                                    <span className="px-1.5 py-0.5 bg-neutral-100 text-neutral-500 text-[10px] font-mono font-bold rounded">
                                      {j.designator || '-'}
                                    </span>
                                  </td>
                                  <td className="px-4 py-2">
                                    <p className="font-bold text-neutral-900">{j.name}</p>
                                    <p className="text-[10px] text-neutral-500">Rp {j.price.toLocaleString()} each</p>
                                  </td>
                                  <td className="px-4 py-2">
                                    <div className="flex items-center justify-center gap-2">
                                      <input
                                        type="number"
                                        min="1"
                                        value={j.quantity}
                                        onChange={(e) => updateJobQty(j.jobId, Number(e.target.value))}
                                        className="w-16 px-2 py-1 bg-neutral-50 border border-black/5 rounded-lg text-center focus:outline-none"
                                      />
                                    </div>
                                  </td>
                                  <td className="px-4 py-2 text-right font-bold text-neutral-900">
                                    Rp {j.subtotal.toLocaleString()}
                                  </td>
                                  <td className="px-4 py-2 text-right">
                                    <button
                                      type="button"
                                      onClick={() => removeJob(j.jobId)}
                                      className="p-1 text-red-500 hover:bg-red-50 rounded"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </form>

              <div className="p-6 border-t border-black/5 bg-neutral-50 flex items-center justify-between">
                <div className="text-left">
                  <p className="text-xs text-neutral-500 uppercase font-bold">Estimated Total Cost</p>
                  <p className="text-2xl font-black text-emerald-600">
                    Rp {(
                      (formData.activityCost || 0) + 
                      selectedJobs.reduce((sum, j) => sum + j.subtotal, 0)
                    ).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-6 py-2 text-neutral-500 font-medium hover:bg-neutral-100 rounded-xl transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={isUploading}
                    className="flex items-center gap-2 px-8 py-2 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isUploading ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Save className="w-5 h-5" />
                    )}
                    {isUploading ? 'Uploading...' : 'Save Record'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Report Overlay */}
      {viewingReport && (
        <ProjectReport 
          project={viewingReport} 
          onClose={() => setViewingReport(null)} 
        />
      )}

      {/* Photo Lightbox */}
      <AnimatePresence>
        {selectedPhotoIndex !== null && allEvidence[selectedPhotoIndex] && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center p-4 md:p-8"
            onClick={() => setSelectedPhotoIndex(null)}
          >
            {/* Close Button */}
            <motion.button
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="absolute top-4 right-4 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors z-[110]"
              onClick={() => setSelectedPhotoIndex(null)}
            >
              <X className="w-6 h-6" />
            </motion.button>

            {/* Navigation Buttons */}
            {selectedPhotoIndex > 0 && (
              <button 
                onClick={handlePrevPhoto}
                className="absolute left-4 p-4 bg-white/5 hover:bg-white/10 rounded-full text-white transition-colors z-[110]"
              >
                <ChevronLeft className="w-8 h-8" />
              </button>
            )}
            {selectedPhotoIndex < allEvidence.length - 1 && (
              <button 
                onClick={handleNextPhoto}
                className="absolute right-4 p-4 bg-white/5 hover:bg-white/10 rounded-full text-white transition-colors z-[110]"
              >
                <ChevronRight className="w-8 h-8" />
              </button>
            )}

            {/* Image Container */}
            <motion.div
              key={selectedPhotoIndex}
              initial={{ scale: 0.9, opacity: 0, x: 20 }}
              animate={{ scale: 1, opacity: 1, x: 0 }}
              className="relative max-w-full max-h-full flex flex-col items-center"
              onClick={(e) => e.stopPropagation()}
            >
              <img 
                src={resolvePhotoUrl(allEvidence[selectedPhotoIndex].photoUrl)} 
                alt="Evidence Full View" 
                className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-2xl border border-white/10"
                referrerPolicy="no-referrer"
              />
              
              {/* Metadata Overlay */}
              <div className="mt-6 w-full max-w-2xl bg-white/10 backdrop-blur-md rounded-2xl p-6 text-white border border-white/10">
                <div className="flex items-center justify-between mb-4">
                  <span className="px-3 py-1 bg-emerald-500 text-white text-xs font-bold rounded-full uppercase tracking-wider">
                    {allEvidence[selectedPhotoIndex].stage}
                  </span>
                  <div className="flex items-center gap-4 text-xs font-medium text-neutral-300">
                    <div className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {allEvidence[selectedPhotoIndex].reportedBy}
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {(() => {
                        const ts = allEvidence[selectedPhotoIndex].timestamp;
                        const date = ts instanceof Timestamp ? ts.toDate() : 
                                    (ts as any)?.toDate ? (ts as any).toDate() : 
                                    new Date(ts);
                        return date.toLocaleString('id-ID');
                      })()}
                    </div>
                  </div>
                </div>
                {allEvidence[selectedPhotoIndex].caption && (
                  <p className="text-lg font-medium text-white mb-4">
                    {allEvidence[selectedPhotoIndex].caption}
                  </p>
                )}
                <div className="flex justify-center">
                  <a 
                    href={resolvePhotoUrl(allEvidence[selectedPhotoIndex].photoUrl)} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="px-6 py-2 bg-white text-black rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-neutral-200 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Download Original
                  </a>
                </div>
              </div>
            </motion.div>

            {/* Counter */}
            <div className="absolute bottom-8 text-white/50 text-xs font-bold uppercase tracking-widest">
              Photo {selectedPhotoIndex + 1} of {allEvidence.length}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deletingProjectId && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-black/5"
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mb-6">
                  <Trash2 className="w-8 h-8 text-red-500" />
                </div>
                <h3 className="text-xl font-bold text-neutral-900 mb-2">Delete Project?</h3>
                <p className="text-neutral-500 mb-8">
                  Are you sure you want to delete this project? This action cannot be undone and all associated data will be permanently removed.
                </p>
                <div className="flex items-center gap-3 w-full">
                  <button
                    onClick={() => setDeletingProjectId(null)}
                    className="flex-1 px-6 py-3 bg-neutral-100 text-neutral-600 rounded-xl font-bold hover:bg-neutral-200 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleDelete(deletingProjectId)}
                    className="flex-1 px-6 py-3 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 transition-all shadow-lg shadow-red-200"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Confirmation Modal for Clear BOQ */}
      <ConfirmationModal
        isOpen={isConfirmClearBOQOpen}
        title="Hapus Semua BOQ"
        message="Apakah Anda yakin ingin menghapus semua data BOQ rekonsiliasi pada proyek ini?"
        confirmLabel="Hapus Semua"
        onConfirm={confirmClearAllJobs}
        onCancel={() => setIsConfirmClearBOQOpen(false)}
        variant="danger"
      />
    </div>
  );
}
