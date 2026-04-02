import { Project, ProjectEvidence } from '../types';
import { X, Printer, Download } from 'lucide-react';
import { Timestamp } from 'firebase/firestore';

interface ProjectReportProps {
  project: Project;
  onClose: () => void;
}

export default function ProjectReport({ project, onClose }: ProjectReportProps) {
  const formatDate = (ts?: Timestamp) => {
    if (!ts) return '-';
    const date = ts.toDate();
    return date.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }) + ' ' + date.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const resolvePhotoUrl = (url: string) => {
    if (!url) return '';
    if (url.startsWith('http') || url.startsWith('data:') || url.startsWith('/')) return url;
    if (!url.includes('/')) {
      return `/api/telegram-photo/${url}`;
    }
    return url;
  };

  const handlePrint = () => {
    window.print();
  };

  const getEvidenceByStage = (stage: ProjectEvidence['stage']) => {
    const evidence = project.evidence?.filter(e => e.stage === stage) || [];
    if (stage === 'Initial' && project.photos) {
      const legacyPhotos = project.photos.map(url => ({
        photoUrl: url,
        stage: 'Initial' as any,
        reportedBy: 'System',
        timestamp: project.createdAt,
        caption: 'Legacy Photo'
      }));
      return [...legacyPhotos, ...evidence];
    }
    return evidence;
  };

  return (
    <div className="fixed inset-0 z-[60] bg-white overflow-y-auto print:p-0">
      {/* Header - Hidden in Print */}
      <div className="sticky top-0 z-10 bg-white border-b border-neutral-200 p-4 flex items-center justify-between print:hidden">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="p-2 hover:bg-neutral-100 rounded-full transition-colors">
            <X className="w-6 h-6" />
          </button>
          <h2 className="text-xl font-bold text-neutral-900">Project Report: {project.pid}</h2>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
          >
            <Printer className="w-4 h-4" />
            Print Report
          </button>
        </div>
      </div>

      {/* Report Content */}
      <div className="max-w-[210mm] mx-auto p-[10mm] sm:p-[20mm] bg-white shadow-lg my-8 print:my-0 print:shadow-none print:max-w-none">
        {/* PDF Header Section */}
        <div className="flex justify-between items-center mb-8 border-b-2 border-neutral-800 pb-4">
          <img 
            src="https://images.seeklogo.com/logo-png/34/2/telkom-akses-logo-png_seeklogo-340460.png" 
            alt="Telkom Akses" 
            className="h-12 object-contain"
            referrerPolicy="no-referrer"
          />
          <img 
            src="https://www.telkom.co.id/minio/show/data/image_upload/page/1594108255409_compress_logo%20telkom%20indonesia.png" 
            alt="Telkom Indonesia" 
            className="h-12 object-contain"
            referrerPolicy="no-referrer"
          />
        </div>

        {/* Project Details & BOQ Section (Page 1) */}
        <div className="space-y-8">
          <div className="grid grid-cols-[150px_1fr] gap-y-2 text-sm">
            <div className="font-bold uppercase">PROYEK</div>
            <div>: {project.projectName || project.description}</div>
            
            <div className="font-bold uppercase">NO. KONTRAK</div>
            <div>: {project.contractNo || '-'}</div>
            
            <div className="font-bold uppercase">NO. SURAT PESANAN</div>
            <div>: {project.orderNo || '-'}</div>
            
            <div className="font-bold uppercase">WITEL</div>
            <div>: {project.witel || 'MADIUN'}</div>
            
            <div className="font-bold uppercase">TIKET / LOKASI</div>
            <div>: {project.ticketId ? `${project.ticketId} - ${project.location}` : project.location || "-"}</div>
            
            <div className="font-bold uppercase">PELAKSANA</div>
            <div>: {project.partner || "-"}</div>

            {project.inseraTicketIds && project.inseraTicketIds.length > 0 && (
              <>
                <div className="font-bold uppercase">TIKET INSERA</div>
                <div className="flex flex-wrap gap-2">
                  : {project.inseraTicketIds.join(', ')}
                </div>
              </>
            )}
          </div>

          <hr className="border-black border-t-2" />

          {/* BOQ Section */}
          {project.jobs && project.jobs.length > 0 && (
            <div className="mb-8">
              <h3 className="text-sm font-bold bg-neutral-100 border border-black p-2 uppercase mb-4">BOQ REKONSILIASI</h3>
              <table className="w-full border-collapse border border-black text-[10px]">
                <thead>
                  <tr className="bg-neutral-50">
                    <th className="border border-black p-1 text-left">DESIGNATOR</th>
                    <th className="border border-black p-1 text-left">URAIAN PEKERJAAN</th>
                    <th className="border border-black p-1 text-center">QTY</th>
                    <th className="border border-black p-1 text-right">HARGA SATUAN</th>
                    <th className="border border-black p-1 text-right">SUBTOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  {project.jobs.map((j, idx) => (
                    <tr key={idx}>
                      <td className="border border-black p-1 font-mono">{j.designator || '-'}</td>
                      <td className="border border-black p-1">{j.name}</td>
                      <td className="border border-black p-1 text-center">{j.quantity}</td>
                      <td className="border border-black p-1 text-right">Rp {j.price.toLocaleString()}</td>
                      <td className="border border-black p-1 text-right">Rp {j.subtotal.toLocaleString()}</td>
                    </tr>
                  ))}
                  <tr className="bg-neutral-50 font-bold">
                    <td colSpan={4} className="border border-black p-1 text-right">TOTAL BOQ</td>
                    <td className="border border-black p-1 text-right text-emerald-700">Rp {(project.totalJobCost || 0).toLocaleString()}</td>
                  </tr>
                  {project.activityCost && project.activityCost > 0 ? (
                    <tr className="bg-neutral-50 font-bold">
                      <td colSpan={4} className="border border-black p-1 text-right">BIAYA AKTIVITAS</td>
                      <td className="border border-black p-1 text-right text-emerald-700">Rp {project.activityCost.toLocaleString()}</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Evidence Sections - Organized by requested sequence */}
        <div className="space-y-12">
          {[
            { title: 'TIKET INSERA', stages: ['Tiket Insera'] },
            { title: 'SEBELUM', stages: ['Initial', 'Sebelum'] },
            { title: 'PROGRESS', stages: ['Penggalian', 'Tanam tiang', 'Pengecoran', 'Penarikan kabel', 'Pemasangan aksesoris', 'Penyambungan core', 'Pemasangan UC'] },
            { title: 'SESUDAH', stages: ['Penaikan UC', 'Sesudah'] },
            { title: 'HASIL UKUR', stages: ['Hasil ukur'] },
            { title: 'BERITA ACARA', stages: ['Berita acara'] },
            { title: 'AS BUILT DRAWING', stages: ['As built drawing'] }
          ].map((section) => {
            const sectionPhotos = section.stages.flatMap(stage => getEvidenceByStage(stage as any));
            if (sectionPhotos.length === 0) return null;

            return (
              <section key={section.title} className="page-break-before">
                <div className="bg-neutral-100 border border-black p-2 text-center font-bold uppercase mb-4">
                  {section.title}
                </div>
                {section.title === 'TIKET INSERA' && project.inseraTicketIds && project.inseraTicketIds.length > 0 && (
                  <div className="mb-4 text-sm">
                    <span className="font-bold">TICKET IDS: </span>
                    <span>{project.inseraTicketIds.join(', ')}</span>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-6">
                  {sectionPhotos.map((item, idx) => (
                    <div key={idx} className="space-y-2 border border-black/10 p-2 rounded bg-neutral-50/30">
                      <div className="aspect-[4/3] border border-black overflow-hidden bg-white">
                        <img src={resolvePhotoUrl(item.photoUrl)} alt={section.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between items-center">
                          <p className="text-[10px] font-bold">({idx + 1}) {item.stage}</p>
                          <p className="text-[8px] text-neutral-500">{formatDate(item.timestamp)}</p>
                        </div>
                        {item.caption && <p className="text-[9px] text-neutral-700 font-medium">{item.caption}</p>}
                        <p className="text-[8px] text-neutral-400">Reported by: {item.reportedBy}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        {/* Footer Signatures */}
        <div className="mt-24 grid grid-cols-2 gap-12 text-center text-sm">
          <div className="space-y-20">
            <p className="font-bold">PT TELKOM INFRASTRUKTUR INDONESIA<br />Waspang</p>
            <div className="space-y-1">
              <p className="font-bold underline uppercase">__________________________</p>
              <p className="text-xs">NIK. </p>
            </div>
          </div>
          <div className="space-y-20">
            <p className="font-bold">PT TELKOM AKSES<br />Pelaksana Harian</p>
            <div className="space-y-1">
              <p className="font-bold underline uppercase">__________________________</p>
              <p className="text-xs">NIK. </p>
            </div>
          </div>
        </div>

        <div className="mt-12 text-center text-[10px] text-neutral-400 italic">
          Halaman 1/1 Created by AIS 4.0 (RAM)
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body { background: white; }
          .page-break-before { page-break-before: always; }
          @page { margin: 20mm; }
        }
      `}} />
    </div>
  );
}
