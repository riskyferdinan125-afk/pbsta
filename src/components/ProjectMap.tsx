import React from 'react';
import { APIProvider, Map, Marker, InfoWindow } from '@vis.gl/react-google-maps';
import { Project } from '../types';
import { Map as MapIcon, X } from 'lucide-react';

interface ProjectMapProps {
  projects: Project[];
  onSelectProject: (project: Project) => void;
}

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_PLATFORM_KEY || '';

export default function ProjectMap({ projects, onSelectProject }: ProjectMapProps) {
  const [selectedProject, setSelectedProject] = React.useState<Project | null>(null);

  const projectsWithLocation = projects.filter(p => p.latitude && p.longitude);

  const center = projectsWithLocation.length > 0
    ? { lat: projectsWithLocation[0].latitude!, lng: projectsWithLocation[0].longitude! }
    : { lat: -7.6298, lng: 111.5239 }; // Madiun center

  return (
    <div className="h-[600px] w-full rounded-3xl overflow-hidden border border-black/5 shadow-sm relative">
      <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
        <Map
          defaultCenter={center}
          defaultZoom={12}
          gestureHandling={'greedy'}
          disableDefaultUI={false}
        >
          {projectsWithLocation.map((project) => (
            <Marker
              key={project.id}
              position={{ lat: project.latitude!, lng: project.longitude! }}
              onClick={() => setSelectedProject(project)}
              icon={{
                path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z',
                fillColor: project.status === 'completed' ? '#10b981' : project.status === 'in-progress' ? '#3b82f6' : '#f59e0b',
                fillOpacity: 1,
                strokeWeight: 1,
                strokeColor: '#ffffff',
                scale: 1.5,
                anchor: { x: 12, y: 24 } as any
              }}
            />
          ))}

          {selectedProject && (
            <InfoWindow
              position={{ lat: selectedProject.latitude!, lng: selectedProject.longitude! }}
              onCloseClick={() => setSelectedProject(null)}
            >
              <div className="p-2 min-w-[200px]">
                <h4 className="font-bold text-neutral-900 mb-1">{selectedProject.projectName || selectedProject.pid}</h4>
                <p className="text-xs text-neutral-500 mb-2">{selectedProject.location}</p>
                <div className="flex items-center justify-between">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                    selectedProject.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                    selectedProject.status === 'in-progress' ? 'bg-blue-100 text-blue-700' :
                    'bg-amber-100 text-amber-700'
                  }`}>
                    {selectedProject.status}
                  </span>
                  <button 
                    onClick={() => onSelectProject(selectedProject)}
                    className="text-xs font-bold text-indigo-600 hover:underline"
                  >
                    Lihat Detail
                  </button>
                </div>
              </div>
            </InfoWindow>
          )}
        </Map>
      </APIProvider>
      
      {!GOOGLE_MAPS_API_KEY && (
        <div className="absolute inset-0 bg-neutral-100/80 backdrop-blur-sm flex items-center justify-center p-8 text-center">
          <div className="max-w-md">
            <MapIcon className="w-12 h-12 text-neutral-400 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-neutral-900 mb-2">Google Maps API Key Required</h3>
            <p className="text-sm text-neutral-500">
              Please configure your Google Maps API Key in the environment variables to enable the GIS view.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
