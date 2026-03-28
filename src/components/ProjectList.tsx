import { useState, useEffect } from 'react';
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
  Timestamp
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage, handleFirestoreError, OperationType } from '../firebase';
import { Project, UserProfile, Material, ProjectMaterial, Job, ProjectJob, ProjectEvidence } from '../types';
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
  Database
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { motion, AnimatePresence } from 'motion/react';
import { useToast } from './Toast';
import ProjectReport from './ProjectReport';

interface ProjectListProps {
  profile: UserProfile | null;
}

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
    activityCost: 0,
  });
  const [selectedMaterials, setSelectedMaterials] = useState<ProjectMaterial[]>([]);
  const [selectedJobs, setSelectedJobs] = useState<ProjectJob[]>([]);
  const [evidence, setEvidence] = useState<ProjectEvidence[]>([]);
  const [selectedStage, setSelectedStage] = useState<ProjectEvidence['stage']>('Initial');

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

  // Helper function to get all evidence for a project
  const getProjectEvidence = (project: Project) => {
    return [
      ...(project.photos?.map(url => ({ 
        photoUrl: url, 
        stage: 'Legacy' as any, 
        reportedBy: 'System', 
        timestamp: project.createdAt,
        caption: '' 
      })) || []),
      ...(project.evidence || [])
    ];
  };

  const allEvidence = activeProjectForGallery ? getProjectEvidence(activeProjectForGallery) : [];

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
      ["PELAKSANA", ": " + (project.partner || "-")],
      ["STATUS", ": " + project.status.toUpperCase()],
      ["TANGGAL DIBUAT", ": " + (project.createdAt ? project.createdAt.toDate().toLocaleString('id-ID') : "-")],
      []
    ];

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
    const boqFooter = [["", "", "", "TOTAL BOQ", project.totalJobCost || 0], []];

    // Materials Section
    const matHeader = [["MATERIAL TERPASANG", "", "", ""]];
    const matSubHeader = [["NAMA MATERIAL", "QTY", "HARGA SATUAN", "SUBTOTAL"]];
    const matData = (project.materials || []).map(m => [
      m.name,
      m.quantity,
      m.price,
      m.subtotal
    ]);
    const matFooter = [["", "", "TOTAL MATERIAL", project.totalMaterialCost || 0], []];

    // Grand Total
    const grandTotal = [["", "", "GRAND TOTAL COST", project.totalCost || 0], []];

    // Evidence Section
    const evidenceHeader = [["EVIDEN FOTO", "", "", ""]];
    const evidenceSubHeader = [["STAGE", "CAPTION", "TIMESTAMP", "PHOTO URL"]];
    const projectEvidence = getProjectEvidence(project);
    const evidenceData = projectEvidence.map(e => [
      e.stage,
      e.caption || "-",
      e.timestamp ? e.timestamp.toDate().toLocaleString('id-ID') : "-",
      e.photoUrl
    ]);

    // Combine All
    const fullData = [
      ...header,
      ...evidenceHeader,
      ...evidenceSubHeader,
      ...evidenceData,
      [],
      ...boqHeader,
      ...boqSubHeader,
      ...boqData,
      ...boqFooter,
      ...matHeader,
      ...matSubHeader,
      ...matData,
      ...matFooter,
      ...grandTotal
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

  const getBase64ImageFromURL = (url: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.setAttribute('crossOrigin', 'anonymous');
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0);
        const dataURL = canvas.toDataURL('image/jpeg');
        resolve(dataURL);
      };
      img.onerror = error => reject(error);
      img.src = url;
    });
  };

  const exportToPDF = async (project: Project) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;

    const drawHeader = (pageTitle: string, pageNum: number, totalPages: number) => {
      // Logos
      doc.setFontSize(10);
      doc.setTextColor(150);
      doc.text("TelkomAkses", margin, 15);
      doc.text("Telkom Indonesia", pageWidth - margin - 30, 15);

      // Metadata Section
      doc.setFontSize(9);
      doc.setTextColor(0);
      doc.setFont("helvetica", "bold");
      
      const metadata = [
        ["PROYEK", ": " + (project.projectName || project.description)],
        ["NO. KONTRAK", ": " + (project.contractNo || "-")],
        ["NO. SURAT PESANAN", ": " + (project.orderNo || "-")],
        ["WITEL", ": " + (project.witel || "-")],
        ["TIKET / LOKASI", ": " + (project.ticketId ? `${project.ticketId} - ${project.location}` : project.location || "-")],
        ["PELAKSANA", ": " + (project.partner || "-")]
      ];

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
      doc.text(`Halaman ${pageNum}/${totalPages} Created by AISS 4.0 (RAM)`, pageWidth / 2, pageHeight - 10, { align: "center" });
      
      return y + 15;
    };

    try {
      showToast("Preparing PDF report...", "info");
      
      // Photo Pages
      const projectEvidence = getProjectEvidence(project);
      const stages = ['Initial', 'Penggalian', 'Tanam tiang', 'Pengecoran', 'Penarikan kabel', 'Pemasangan aksesoris', 'Penyambungan core', 'Pemasangan UC', 'Penaikan UC', 'Berita acara'];
      const stageLabels: Record<string, string> = {
        'Initial': 'SEBELUM',
        'Penaikan UC': 'SESUDAH'
      };

      let pageNum = 1;
      for (const stage of stages) {
        const photos = projectEvidence.filter(e => e.stage === stage);
        if (photos.length === 0) continue;

        if (pageNum > 1) doc.addPage();
        let y = drawHeader(stageLabels[stage] || stage.toUpperCase(), pageNum, 10);
        pageNum++;

        // Draw photos in a grid (2 per row)
        const imgWidth = (pageWidth - (margin * 3)) / 2;
        const imgHeight = imgWidth * 0.75;
        let photoX = margin;
        let photoY = y + 10;

        for (let i = 0; i < photos.length; i++) {
          try {
            const base64 = await getBase64ImageFromURL(photos[i].photoUrl);
            doc.addImage(base64, 'JPEG', photoX, photoY, imgWidth, imgHeight);
            
            // Photo Label & Metadata
            doc.setFontSize(8);
            doc.setFont("helvetica", "bold");
            doc.text(`(${i + 1}) ${stage}`, photoX, photoY + imgHeight + 5);
            
            doc.setFont("helvetica", "normal");
            doc.setFontSize(7);
            const ts = photos[i].timestamp ? photos[i].timestamp.toDate().toLocaleString('id-ID') : "-";
            doc.text(ts, photoX + imgWidth, photoY + imgHeight + 5, { align: "right" });
            
            if (photos[i].caption) {
              doc.setFont("helvetica", "italic");
              doc.text(photos[i].caption || "", photoX, photoY + imgHeight + 9, { maxWidth: imgWidth });
            }

            if ((i + 1) % 2 === 0) {
              photoX = margin;
              photoY += imgHeight + 20;
            } else {
              photoX += imgWidth + margin;
            }

            // New page if needed
            if (photoY + imgHeight > pageHeight - 30 && i < photos.length - 1) {
              doc.addPage();
              y = drawHeader(stageLabels[stage] || stage.toUpperCase(), pageNum, 10);
              pageNum++;
              photoX = margin;
              photoY = y + 10;
            }
          } catch (err) {
            console.error("Error adding image to PDF:", err);
          }
        }
      }

      // Page: Project Summary (BOQ & Materials) - Moved to end
      doc.addPage();
      let currentY = drawHeader("BOQ REKONSILIASI & MATERIAL", pageNum, pageNum + 1);
      pageNum++;
      
      // BOQ Table
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("BOQ REKONSILIASI", margin, currentY + 5);
      
      const boqData = (project.jobs || []).map(j => [
        j.designator || "-",
        j.name,
        j.quantity.toString(),
        `Rp ${j.price.toLocaleString()}`,
        `Rp ${j.subtotal.toLocaleString()}`
      ]);

      autoTable(doc, {
        startY: currentY + 8,
        head: [['DESIGNATOR', 'URAIAN PEKERJAAN', 'QTY', 'HARGA', 'SUBTOTAL']],
        body: boqData,
        theme: 'grid',
        headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' },
        styles: { fontSize: 8 },
        margin: { left: margin, right: margin }
      });

      currentY = (doc as any).lastAutoTable.finalY + 10;

      // Materials Table
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("MATERIAL TERPASANG", margin, currentY);

      const matData = (project.materials || []).map(m => [
        m.name,
        m.quantity.toString(),
        `Rp ${m.price.toLocaleString()}`,
        `Rp ${m.subtotal.toLocaleString()}`
      ]);

      autoTable(doc, {
        startY: currentY + 3,
        head: [['NAMA MATERIAL', 'QTY', 'HARGA', 'SUBTOTAL']],
        body: matData,
        theme: 'grid',
        headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' },
        styles: { fontSize: 8 },
        margin: { left: margin, right: margin }
      });

      currentY = (doc as any).lastAutoTable.finalY + 10;

      // Grand Total
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text(`GRAND TOTAL COST: Rp ${(project.totalCost || 0).toLocaleString()}`, pageWidth - margin, currentY, { align: "right" });

      // Last Page: Signatures
      doc.addPage();
      drawHeader("PENGESAHAN LAPORAN", pageNum, pageNum);
      
      const sigY = pageHeight - 60;
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      
      doc.text("PT TELKOM INFRASTRUKTUR INDONESIA", margin + 20, sigY, { align: "center" });
      doc.text("Waspang", margin + 20, sigY + 5, { align: "center" });
      
      doc.text("PT TELKOM AKSES", pageWidth - margin - 40, sigY, { align: "center" });
      doc.text("Pelaksana Harian", pageWidth - margin - 40, sigY + 5, { align: "center" });

      doc.setFont("helvetica", "normal");
      doc.text("__________________________", margin + 20, sigY + 30, { align: "center" });
      doc.text("__________________________", pageWidth - margin - 40, sigY + 30, { align: "center" });

      doc.save(`Project_Report_${project.pid}.pdf`);
      showToast("Project report generated successfully", "success");
    } catch (error) {
      console.error("PDF Export Error:", error);
      showToast("Failed to generate PDF report", "error");
    }
  };
  const [currentCaption, setCurrentCaption] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<{ id: string; name: string; progress: number; status: 'uploading' | 'completed' | 'error' }[]>([]);
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
        activityCost: project.activityCost || 0,
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
        activityCost: 0,
      });
      setSelectedMaterials([]);
      setSelectedJobs([]);
      setEvidence([]);
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const totalMaterialCost = selectedMaterials.reduce((sum, m) => sum + m.subtotal, 0);
    const totalJobCost = selectedJobs.reduce((sum, j) => sum + j.subtotal, 0);
    const totalCost = (formData.activityCost || 0) + totalMaterialCost + totalJobCost;

    const data = {
      ...formData,
      materials: selectedMaterials,
      jobs: selectedJobs,
      evidence,
      totalMaterialCost,
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
        status: 'in-progress',
        activityCost: 500000,
        materials: [
          { materialId: 'm1', name: 'Fiber Optic Cable 24 Core', quantity: 500, price: 15000, subtotal: 7500000 },
          { materialId: 'm2', name: 'Closure 24 Core', quantity: 2, price: 450000, subtotal: 900000 }
        ],
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement> | React.DragEvent) => {
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
      status: 'uploading' as const
    }));
    
    setUploadingFiles(prev => [...prev, ...newUploadingFiles]);

    const uploadPromises = imageFiles.map((file, index) => {
      const fileId = newUploadingFiles[index].id;
      try {
        const storageRef = ref(storage, `projects/${formData.pid || 'new'}/${fileId}`);
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
        const newEvidence: ProjectEvidence[] = validUrls.map(url => ({
          stage: selectedStage,
          photoUrl: url,
          caption: currentCaption,
          timestamp: Timestamp.now(),
          reportedBy: profile?.name || 'Unknown'
        }));

        const updatedEvidence = [...evidence, ...newEvidence];
        setEvidence(updatedEvidence);
        
        // If we're editing an existing project, save the evidence immediately to Firestore
        // to ensure all uploaded photos are persisted even if the main form isn't saved.
        if (editingProject) {
          try {
            await updateDoc(doc(db, 'projects', editingProject.id), {
              evidence: updatedEvidence,
              updatedAt: serverTimestamp()
            });
            showToast(`Successfully saved ${validUrls.length} photo(s) to project`, 'success');
          } catch (saveError) {
            console.error("Error auto-saving evidence to Firestore:", saveError);
            // We don't show an error toast here because the local state is still updated,
            // and the user can still click the main "Save Record" button.
          }
        } else {
          showToast(`Added ${validUrls.length} photo(s) to project`, 'success');
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
                <div className="flex items-start justify-between gap-4">
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
                      <Camera className="w-3 h-3 text-amber-500" />
                      Evidence
                    </div>
                    <div className="text-sm font-bold text-neutral-900">
                      {project.evidence?.length || 0} Photos
                    </div>
                  </div>
                </div>

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
                    <div className="p-6 space-y-6">
                      {/* Evidence Gallery Section */}
                      <div>
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                          <div className="flex items-center gap-2">
                            <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg">
                              <Camera className="w-5 h-5" />
                            </div>
                            <div>
                              <h4 className="text-sm font-bold text-neutral-900">
                                Project Evidence Gallery
                              </h4>
                              <p className="text-[10px] text-neutral-500 font-medium">
                                Visual progress tracking and documentation
                              </p>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-4">
                            <div className="flex items-center bg-neutral-100 p-1 rounded-lg">
                              <button
                                onClick={() => setGalleryViewMode('grid')}
                                className={`p-1.5 rounded-md transition-all ${galleryViewMode === 'grid' ? 'bg-white shadow-sm text-emerald-600' : 'text-neutral-400 hover:text-neutral-600'}`}
                                title="Grid View"
                              >
                                <Activity className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setGalleryViewMode('carousel')}
                                className={`p-1.5 rounded-md transition-all ${galleryViewMode === 'carousel' ? 'bg-white shadow-sm text-emerald-600' : 'text-neutral-400 hover:text-neutral-600'}`}
                                title="Carousel View"
                              >
                                <ChevronRight className="w-4 h-4" />
                              </button>
                            </div>
                            
                            <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 no-scrollbar">
                            {(() => {
                              const projectEvidence = getProjectEvidence(project);
                              const stages = Array.from(new Set(projectEvidence.map(e => e.stage)));
                              return (
                                <>
                                  <button
                                    onClick={() => setSelectedStage('Initial')} // Using 'Initial' as a reset or just showing all
                                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${selectedStage === 'Initial' ? 'bg-emerald-600 text-white shadow-md' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'}`}
                                  >
                                    All ({projectEvidence.length})
                                  </button>
                                  {stages.map(stage => (
                                    <button
                                      key={stage}
                                      onClick={() => {
                                        setSelectedStage(stage);
                                        const element = document.getElementById(`stage-${stage}-${project.id}`);
                                        element?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                                      }}
                                      className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap ${selectedStage === stage ? 'bg-emerald-600 text-white shadow-md' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}
                                    >
                                      {stage}
                                    </button>
                                  ))}
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      </div>

                      {/* Stage Progress Timeline */}
                      <div className="mb-8 px-2">
                        <div className="relative flex items-center justify-between">
                          <div className="absolute left-0 right-0 h-0.5 bg-neutral-200 top-1/2 -translate-y-1/2 z-0" />
                          {(() => {
                            const projectEvidence = getProjectEvidence(project);
                            const stages = Array.from(new Set(projectEvidence.map(e => e.stage)));
                            const allStages = ['Initial', 'Penggalian', 'Pengecoran', 'Penarikan', 'Terminasi', 'Legacy'];
                            const activeStages = allStages.filter(s => stages.includes(s as any) || s === 'Initial');
                            
                            return activeStages.map((stage, idx) => {
                              const hasPhotos = stages.includes(stage as any);
                              const isCurrent = selectedStage === stage;
                              return (
                                <div key={stage} className="relative z-10 flex flex-col items-center gap-2">
                                  <button
                                    onClick={() => {
                                      setSelectedStage(stage as any);
                                      const element = document.getElementById(`stage-${stage}-${project.id}`);
                                      element?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                                    }}
                                    className={`w-4 h-4 rounded-full border-2 transition-all duration-500 ${
                                      isCurrent ? 'bg-emerald-500 border-emerald-200 scale-125 shadow-lg shadow-emerald-200' : 
                                      hasPhotos ? 'bg-white border-emerald-500' : 'bg-neutral-100 border-neutral-300'
                                    }`}
                                  />
                                  <span className={`text-[8px] font-bold uppercase tracking-tighter transition-colors ${isCurrent ? 'text-emerald-600' : 'text-neutral-400'}`}>
                                    {stage}
                                  </span>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </div>

                        {(() => {
                          const projectEvidence = getProjectEvidence(project);
                          if (projectEvidence.length > 0) {
                            const stages = Array.from(new Set(projectEvidence.map(e => e.stage)));
                            return (
                              <div className="space-y-8">
                                {stages.map(stage => {
                                  const stagePhotos = projectEvidence.filter(e => e.stage === stage);
                                  return (
                                    <div key={stage} id={`stage-${stage}-${project.id}`} className="space-y-4">
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                          <div className="w-1 h-4 bg-emerald-500 rounded-full" />
                                          <h5 className="text-[11px] font-bold text-neutral-700 uppercase tracking-widest">
                                            {stage}
                                          </h5>
                                          <span className="text-[10px] font-medium text-neutral-400 bg-neutral-100 px-2 py-0.5 rounded-full">
                                            {stagePhotos.length} Photos
                                          </span>
                                        </div>
                                      </div>
                                      
                                      {galleryViewMode === 'grid' ? (
                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                          {stagePhotos.map((item, idx) => {
                                            const globalIdx = projectEvidence.findIndex(ae => ae.photoUrl === item.photoUrl);
                                            return (
                                              <motion.div 
                                                key={idx} 
                                                whileHover={{ scale: 1.02, y: -4 }}
                                                whileTap={{ scale: 0.98 }}
                                                className="group cursor-pointer relative aspect-square"
                                                onClick={() => {
                                                  setActiveProjectForGallery(project);
                                                  setSelectedPhotoIndex(globalIdx);
                                                }}
                                              >
                                                <div className="absolute inset-0 bg-neutral-200 animate-pulse rounded-2xl" />
                                                <img 
                                                  src={item.photoUrl} 
                                                  alt={item.stage} 
                                                  className="absolute inset-0 w-full h-full object-cover rounded-2xl border border-black/5 shadow-sm transition-all duration-500 group-hover:shadow-md"
                                                  referrerPolicy="no-referrer"
                                                  onLoad={(e) => (e.currentTarget.previousElementSibling as HTMLElement).style.display = 'none'}
                                                />
                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all duration-300 rounded-2xl flex flex-col items-center justify-center text-white gap-2">
                                                  <div className="p-2 bg-white/20 backdrop-blur-md rounded-full transform scale-75 group-hover:scale-100 transition-transform duration-300">
                                                    <Eye className="w-4 h-4" />
                                                  </div>
                                                  <span className="text-[10px] font-bold uppercase tracking-tighter">View Detail</span>
                                                </div>
                                                
                                                {/* Caption Preview on Hover */}
                                                {item.caption && (
                                                  <div className="absolute bottom-2 left-2 right-2 p-2 bg-black/60 backdrop-blur-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity translate-y-2 group-hover:translate-y-0 duration-300">
                                                    <p className="text-[9px] text-white font-medium line-clamp-1">
                                                      {item.caption}
                                                    </p>
                                                  </div>
                                                )}
                                              </motion.div>
                                            );
                                          })}
                                        </div>
                                      ) : (
                                        <div className="relative group/carousel">
                                          <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar snap-x scroll-smooth">
                                            {stagePhotos.map((item, idx) => {
                                              const globalIdx = projectEvidence.findIndex(ae => ae.photoUrl === item.photoUrl);
                                              return (
                                                <motion.div 
                                                  key={idx} 
                                                  whileHover={{ scale: 1.02 }}
                                                  whileTap={{ scale: 0.98 }}
                                                  className="flex-none w-48 sm:w-64 aspect-[4/3] group cursor-pointer relative snap-start"
                                                  onClick={() => {
                                                    setActiveProjectForGallery(project);
                                                    setSelectedPhotoIndex(globalIdx);
                                                  }}
                                                >
                                                  <div className="absolute inset-0 bg-neutral-200 animate-pulse rounded-2xl" />
                                                  <img 
                                                    src={item.photoUrl} 
                                                    alt={item.stage} 
                                                    className="absolute inset-0 w-full h-full object-cover rounded-2xl border border-black/5 shadow-sm transition-all duration-500 group-hover:shadow-md"
                                                    referrerPolicy="no-referrer"
                                                    onLoad={(e) => (e.currentTarget.previousElementSibling as HTMLElement).style.display = 'none'}
                                                  />
                                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all duration-300 rounded-2xl flex flex-col items-center justify-center text-white gap-2">
                                                    <div className="p-2 bg-white/20 backdrop-blur-md rounded-full">
                                                      <Eye className="w-4 h-4" />
                                                    </div>
                                                    <span className="text-[10px] font-bold uppercase tracking-tighter">View Detail</span>
                                                  </div>
                                                  
                                                  <div className="absolute top-2 left-2 px-2 py-1 bg-black/40 backdrop-blur-md rounded-lg text-[8px] font-bold text-white uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
                                                    {(() => {
                                                      const date = item.timestamp instanceof Timestamp ? item.timestamp.toDate() : 
                                                                  (item.timestamp as any)?.toDate ? (item.timestamp as any).toDate() : 
                                                                  new Date(item.timestamp);
                                                      return date.toLocaleDateString();
                                                    })()}
                                                  </div>

                                                  {/* Caption Preview on Hover */}
                                                  {item.caption && (
                                                    <div className="absolute bottom-2 left-2 right-2 p-2 bg-black/60 backdrop-blur-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity translate-y-2 group-hover:translate-y-0 duration-300">
                                                      <p className="text-[9px] text-white font-medium line-clamp-1">
                                                        {item.caption}
                                                      </p>
                                                    </div>
                                                  )}
                                                </motion.div>
                                              );
                                            })}
                                          </div>
                                          
                                          {/* Carousel Navigation Arrows */}
                                          <div className="absolute top-1/2 -translate-y-1/2 left-2 right-2 flex justify-between pointer-events-none opacity-0 group-hover/carousel:opacity-100 transition-opacity">
                                            <button 
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                const container = e.currentTarget.parentElement?.previousElementSibling;
                                                container?.scrollBy({ left: -200, behavior: 'smooth' });
                                              }}
                                              className="p-2 bg-white/90 backdrop-blur-md rounded-full shadow-lg pointer-events-auto hover:bg-white transition-colors text-neutral-600"
                                            >
                                              <ChevronLeft className="w-4 h-4" />
                                            </button>
                                            <button 
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                const container = e.currentTarget.parentElement?.previousElementSibling;
                                                container?.scrollBy({ left: 200, behavior: 'smooth' });
                                              }}
                                              className="p-2 bg-white/90 backdrop-blur-md rounded-full shadow-lg pointer-events-auto hover:bg-white transition-colors text-neutral-600"
                                            >
                                              <ChevronRight className="w-4 h-4" />
                                            </button>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          }
                          return (
                            <div className="bg-neutral-100/50 rounded-2xl border-2 border-dashed border-neutral-200 p-12 text-center">
                              <div className="w-16 h-16 bg-neutral-200 rounded-full flex items-center justify-center mx-auto mb-4">
                                <ImageIcon className="w-8 h-8 text-neutral-400" />
                              </div>
                              <h5 className="text-sm font-bold text-neutral-900 mb-1">No Evidence Photos</h5>
                              <p className="text-xs text-neutral-500">Upload project progress photos to build your gallery</p>
                            </div>
                          );
                        })()}
                      </div>

                      {/* Jobs Section */}
                      <div>
                        <h4 className="text-sm font-bold text-neutral-900 mb-3 flex items-center gap-2">
                          <Briefcase className="w-4 h-4" />
                          BOQ REKONSILIASI
                        </h4>
                        {project.jobs && project.jobs.length > 0 ? (
                          <div className="bg-white rounded-xl border border-black/5 overflow-hidden">
                            <table className="w-full text-sm text-left">
                              <thead className="bg-neutral-50 text-neutral-500 font-medium">
                                <tr>
                                  <th className="px-4 py-2">Designator</th>
                                  <th className="px-4 py-2">Job Name</th>
                                  <th className="px-4 py-2 text-center">Qty</th>
                                  <th className="px-4 py-2 text-right">Price</th>
                                  <th className="px-4 py-2 text-right">Subtotal</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-black/5">
                                {project.jobs.map((j, idx) => (
                                  <tr key={idx}>
                                    <td className="px-4 py-2 font-mono text-[10px] text-neutral-500">{j.designator || '-'}</td>
                                    <td className="px-4 py-2 font-medium text-neutral-900">{j.name}</td>
                                    <td className="px-4 py-2 text-center">{j.quantity}</td>
                                    <td className="px-4 py-2 text-right text-neutral-500">Rp {j.price.toLocaleString()}</td>
                                    <td className="px-4 py-2 text-right font-bold text-neutral-900">Rp {j.subtotal.toLocaleString()}</td>
                                  </tr>
                                ))}
                                <tr className="bg-neutral-50/50">
                                  <td colSpan={4} className="px-4 py-2 text-right font-medium text-neutral-500">Job Subtotal</td>
                                  <td className="px-4 py-2 text-right font-bold text-emerald-600">Rp {(project.totalJobCost || 0).toLocaleString()}</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p className="text-xs text-neutral-500 italic">No BOQ recorded.</p>
                        )}
                      </div>

                      {/* Materials Section */}
                      <div>
                        <h4 className="text-sm font-bold text-neutral-900 mb-3 flex items-center gap-2">
                          <Package className="w-4 h-4" />
                          Materials Used
                        </h4>
                        {project.materials && project.materials.length > 0 ? (
                          <div className="bg-white rounded-xl border border-black/5 overflow-hidden">
                            <table className="w-full text-sm text-left">
                              <thead className="bg-neutral-50 text-neutral-500 font-medium">
                                <tr>
                                  <th className="px-4 py-2">Material</th>
                                  <th className="px-4 py-2 text-center">Qty</th>
                                  <th className="px-4 py-2 text-right">Price</th>
                                  <th className="px-4 py-2 text-right">Subtotal</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-black/5">
                                {project.materials.map((m, idx) => (
                                  <tr key={idx}>
                                    <td className="px-4 py-2 font-medium text-neutral-900">{m.name}</td>
                                    <td className="px-4 py-2 text-center">{m.quantity}</td>
                                    <td className="px-4 py-2 text-right text-neutral-500">Rp {m.price.toLocaleString()}</td>
                                    <td className="px-4 py-2 text-right font-bold text-neutral-900">Rp {m.subtotal.toLocaleString()}</td>
                                  </tr>
                                ))}
                                <tr className="bg-neutral-50/50">
                                  <td colSpan={3} className="px-4 py-2 text-right font-medium text-neutral-500">Material Subtotal</td>
                                  <td className="px-4 py-2 text-right font-bold text-emerald-600">Rp {(project.totalMaterialCost || 0).toLocaleString()}</td>
                                </tr>
                                <tr className="bg-neutral-50/50">
                                  <td colSpan={3} className="px-4 py-2 text-right font-medium text-neutral-500">Activity Cost</td>
                                  <td className="px-4 py-2 text-right font-bold text-emerald-600">Rp {(project.activityCost || 0).toLocaleString()}</td>
                                </tr>
                                <tr className="bg-emerald-50">
                                  <td colSpan={3} className="px-4 py-2 text-right font-bold text-emerald-700">GRAND TOTAL</td>
                                  <td className="px-4 py-2 text-right font-black text-emerald-800">Rp {(project.totalCost || 0).toLocaleString()}</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p className="text-xs text-neutral-500 italic">No materials recorded.</p>
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

      {/* Modal */}
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
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 hover:bg-neutral-100 rounded-lg text-neutral-500 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
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
                    </div>
                  </div>

                  {/* Evidence Section */}
                  <div className="space-y-4">
                    <h4 className="text-sm font-bold text-neutral-900 uppercase tracking-wider">Project Evidence</h4>
                    
                    <div className="grid grid-cols-1 gap-4 p-4 bg-neutral-50 rounded-2xl border border-black/5">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[10px] font-bold text-neutral-500 uppercase mb-1">Select Stage</label>
                          <select
                            value={selectedStage}
                            onChange={(e) => setSelectedStage(e.target.value as ProjectEvidence['stage'])}
                            className="w-full px-3 py-2 bg-white border border-black/5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                          >
                            <option value="Initial">Kondisi Awal</option>
                            <option value="Penggalian">Penggalian</option>
                            <option value="Tanam tiang">Tanam tiang</option>
                            <option value="Pengecoran">Pengecoran</option>
                            <option value="Penarikan kabel">Penarikan kabel</option>
                            <option value="Pemasangan aksesoris">Pemasangan aksesoris</option>
                            <option value="Penyambungan core">Penyambungan core</option>
                            <option value="Pemasangan UC">Pemasangan UC</option>
                            <option value="Penaikan UC">Penaikan UC</option>
                            <option value="Berita acara">Berita acara</option>
                          </select>
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
                        onDrop={handleFileUpload}
                        className={`
                          relative border-2 border-dashed rounded-xl p-6 transition-all flex flex-col items-center justify-center gap-2
                          ${isDragging ? 'border-emerald-500 bg-emerald-50' : 'border-black/5 bg-white hover:bg-neutral-50'}
                          ${isUploading ? 'opacity-50 cursor-wait' : ''}
                        `}
                      >
                        <input
                          type="file"
                          multiple
                          accept="image/*"
                          onChange={handleFileUpload}
                          disabled={isUploading}
                          className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-wait"
                        />
                        <Upload className={`w-5 h-5 ${isDragging ? 'text-emerald-600' : 'text-neutral-400'}`} />
                        <p className="text-xs font-bold text-neutral-900">
                          {isUploading ? `Uploading ${Math.round(uploadProgress)}%` : 'Upload Photos for this Stage'}
                        </p>
                      </div>

                      {/* Individual File Progress */}
                      {uploadingFiles.length > 0 && (
                        <div className="space-y-2 max-h-[150px] overflow-y-auto pr-2 custom-scrollbar">
                          {uploadingFiles.map(file => (
                            <div key={file.id} className="bg-neutral-50 rounded-xl p-3 border border-black/5">
                              <div className="flex items-center justify-between mb-1.5">
                                <div className="flex items-center gap-2 min-w-0">
                                  <ImageIcon className="w-3 h-3 text-neutral-400 flex-shrink-0" />
                                  <span className="text-[10px] font-bold text-neutral-600 truncate">{file.name}</span>
                                </div>
                                <span className={`text-[10px] font-bold ${file.status === 'error' ? 'text-red-500' : 'text-emerald-600'}`}>
                                  {file.status === 'error' ? 'Error' : `${file.progress.toFixed(0)}%`}
                                </span>
                              </div>
                              <div className="h-1 bg-neutral-200 rounded-full overflow-hidden">
                                <motion.div 
                                  initial={{ width: 0 }}
                                  animate={{ width: `${file.progress}%` }}
                                  className={`h-full transition-all duration-300 ${file.status === 'error' ? 'bg-red-500' : 'bg-emerald-500'}`}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {evidence.map((item, idx) => (
                        <div key={idx} className="bg-white rounded-xl overflow-hidden border border-black/5 relative group shadow-sm flex flex-col">
                          <div className="aspect-video relative">
                            <img src={item.photoUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
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
                    <h4 className="text-sm font-bold text-neutral-900 uppercase tracking-wider">BOQ REKONSILIASI</h4>
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

                {/* Materials Section */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-neutral-900 uppercase tracking-wider">Materials Used</h4>
                    <div className="text-sm font-bold text-emerald-600">
                      Material Total: Rp {selectedMaterials.reduce((sum, m) => sum + m.subtotal, 0).toLocaleString()}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Material List */}
                    <div className="md:col-span-1 bg-neutral-50 rounded-2xl p-4 border border-black/5 flex flex-col gap-3">
                      <div className="flex flex-col gap-2">
                        <p className="text-[10px] font-bold text-neutral-400 uppercase">Available Materials</p>
                        <div className="relative">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-neutral-400" />
                          <input
                            type="text"
                            placeholder="Search materials..."
                            value={materialSearchTerm}
                            onChange={(e) => setMaterialSearchTerm(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 bg-white border border-black/5 rounded-lg text-[10px] focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                          />
                        </div>
                      </div>
                      <div className="max-h-[250px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                        {(() => {
                          const filtered = materials.filter(m => 
                            m.name.toLowerCase().includes(materialSearchTerm.toLowerCase())
                          );
                          const totalPages = Math.ceil(filtered.length / MATERIALS_PER_PAGE);
                          const start = (materialPage - 1) * MATERIALS_PER_PAGE;
                          const paginated = filtered.slice(start, start + MATERIALS_PER_PAGE);

                          return (
                            <>
                              {paginated.map(m => (
                                <button
                                  key={m.id}
                                  type="button"
                                  onClick={() => addMaterial(m)}
                                  className="w-full text-left p-2 hover:bg-white hover:shadow-sm rounded-lg transition-all flex items-center justify-between group"
                                >
                                  <div className="min-w-0">
                                    <p className="text-xs font-bold text-neutral-900 truncate">{m.name}</p>
                                    <p className="text-[10px] text-neutral-500">Rp {m.price.toLocaleString()} / {m.unit}</p>
                                  </div>
                                  <Plus className="w-4 h-4 text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </button>
                              ))}
                              
                              {filtered.length > MATERIALS_PER_PAGE && (
                                <div className="flex items-center justify-between pt-2 border-t border-black/5">
                                  <button
                                    type="button"
                                    onClick={() => setMaterialPage(p => Math.max(1, p - 1))}
                                    disabled={materialPage === 1}
                                    className="p-1 hover:bg-white rounded-md disabled:opacity-30 transition-colors"
                                  >
                                    <ChevronLeft className="w-4 h-4" />
                                  </button>
                                  <span className="text-[10px] font-medium text-neutral-500">
                                    Page {materialPage} of {totalPages}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setMaterialPage(p => Math.min(totalPages, p + 1))}
                                    disabled={materialPage === totalPages}
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

                    {/* Selected Materials */}
                    <div className="md:col-span-2 space-y-3">
                      {selectedMaterials.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-neutral-400 border-2 border-dashed border-black/5 rounded-2xl py-12">
                          <Package className="w-8 h-8 mb-2 opacity-20" />
                          <p className="text-xs">No materials selected yet.</p>
                        </div>
                      ) : (
                        <div className="bg-white rounded-2xl border border-black/5 overflow-hidden">
                          <table className="w-full text-sm">
                            <thead className="bg-neutral-50 text-neutral-500 font-medium">
                              <tr>
                                <th className="px-4 py-2 text-left">Material</th>
                                <th className="px-4 py-2 text-center">Quantity</th>
                                <th className="px-4 py-2 text-right">Subtotal</th>
                                <th className="px-4 py-2"></th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-black/5">
                              {selectedMaterials.map(m => (
                                <tr key={m.materialId}>
                                  <td className="px-4 py-2">
                                    <p className="font-bold text-neutral-900">{m.name}</p>
                                    <p className="text-[10px] text-neutral-500">Rp {m.price.toLocaleString()} each</p>
                                  </td>
                                  <td className="px-4 py-2">
                                    <div className="flex items-center justify-center gap-2">
                                      <input
                                        type="number"
                                        min="1"
                                        value={m.quantity}
                                        onChange={(e) => updateMaterialQty(m.materialId, Number(e.target.value))}
                                        className="w-16 px-2 py-1 bg-neutral-50 border border-black/5 rounded-lg text-center focus:outline-none"
                                      />
                                    </div>
                                  </td>
                                  <td className="px-4 py-2 text-right font-bold text-neutral-900">
                                    Rp {m.subtotal.toLocaleString()}
                                  </td>
                                  <td className="px-4 py-2 text-right">
                                    <button
                                      type="button"
                                      onClick={() => removeMaterial(m.materialId)}
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
                      selectedMaterials.reduce((sum, m) => sum + m.subtotal, 0) +
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
                src={allEvidence[selectedPhotoIndex].photoUrl} 
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
                    href={allEvidence[selectedPhotoIndex].photoUrl} 
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
    </div>
  );
}
