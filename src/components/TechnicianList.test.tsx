import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TechnicianList from './TechnicianList';
import { onSnapshot, addDoc, updateDoc, deleteDoc } from 'firebase/firestore';

const mockTechnicians = [
  { id: '1', name: 'Jane Smith', email: 'jane@example.com', phone: '123456', role: 'Network Specialist' },
  { id: '2', name: 'Bob Wilson', email: 'bob@example.com', phone: '789012', role: 'Electrician' },
];

const mockAdminProfile = {
  uid: 'admin123',
  name: 'Admin User',
  email: 'admin@example.com',
  role: 'admin' as const
};

describe('TechnicianList Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (onSnapshot as any).mockImplementation((col: any, callback: any) => {
      callback({
        docs: mockTechnicians.map(t => ({ id: t.id, data: () => t }))
      });
      return vi.fn();
    });
  });

  it('renders technicians correctly', async () => {
    render(<TechnicianList profile={mockAdminProfile} />);
    expect(screen.getByText('Jane Smith')).toBeDefined();
    expect(screen.getByText('Bob Wilson')).toBeDefined();
    expect(screen.getByText('Network Specialist')).toBeDefined();
    expect(screen.getByText('Electrician')).toBeDefined();
  });

  it('filters technicians by search query', async () => {
    render(<TechnicianList profile={mockAdminProfile} />);
    const input = screen.getByPlaceholderText('Search technicians...');
    fireEvent.change(input, { target: { value: 'Jane' } });
    
    expect(screen.getByText('Jane Smith')).toBeDefined();
    expect(screen.queryByText('Bob Wilson')).toBeNull();
  });

  it('opens modal for adding new technician', async () => {
    render(<TechnicianList profile={mockAdminProfile} />);
    fireEvent.click(screen.getByText('Add Technician'));
    expect(screen.getByText('Add New Technician')).toBeDefined();
  });

  it('submits new technician correctly', async () => {
    render(<TechnicianList profile={mockAdminProfile} />);
    fireEvent.click(screen.getByText('Add Technician'));
    
    fireEvent.change(screen.getByPlaceholderText('Jane Smith'), { target: { value: 'New Tech' } });
    fireEvent.change(screen.getByPlaceholderText('jane@example.com'), { target: { value: 'new@example.com' } });
    
    fireEvent.click(screen.getByText('Add Technician', { selector: 'button[type="submit"]' }));
    
    expect(addDoc).toHaveBeenCalled();
  });

  it('handles deletion with confirmation', async () => {
    window.confirm = vi.fn(() => true);
    render(<TechnicianList profile={mockAdminProfile} />);
    
    // Actions are visible on hover, but we can find them
    const deleteButtons = screen.getAllByRole('button').filter(b => b.querySelector('svg.lucide-trash2'));
    fireEvent.click(deleteButtons[0]);
    
    expect(window.confirm).toHaveBeenCalled();
    expect(deleteDoc).toHaveBeenCalled();
  });
});
