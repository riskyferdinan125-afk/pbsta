import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MaterialList from './MaterialList';
import { onSnapshot, addDoc, updateDoc, deleteDoc } from 'firebase/firestore';

const mockMaterials = [
  { id: '1', name: 'Fiber Cable', unit: 'meters', price: 5000, quantity: 100 },
  { id: '2', name: 'Connector', unit: 'pcs', price: 1000, quantity: 3 }, // Low stock
];

describe('MaterialList Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (onSnapshot as any).mockImplementation((col: any, callback: any) => {
      callback({
        docs: mockMaterials.map(m => ({ id: m.id, data: () => m }))
      });
      return vi.fn();
    });
  });

  it('renders materials correctly', async () => {
    render(<MaterialList />);
    expect(screen.getByText('Fiber Cable')).toBeDefined();
    expect(screen.getByText('Connector')).toBeDefined();
    expect(screen.getByText('100')).toBeDefined();
    expect(screen.getByText('3')).toBeDefined();
  });

  it('filters materials by search query', async () => {
    render(<MaterialList />);
    const input = screen.getByPlaceholderText('Search materials...');
    fireEvent.change(input, { target: { value: 'Fiber' } });
    
    expect(screen.getByText('Fiber Cable')).toBeDefined();
    expect(screen.queryByText('Connector')).toBeNull();
  });

  it('opens modal for adding new material', async () => {
    render(<MaterialList />);
    fireEvent.click(screen.getByText('Add Material'));
    expect(screen.getByText('Add New Material')).toBeDefined();
  });

  it('submits new material correctly', async () => {
    render(<MaterialList />);
    fireEvent.click(screen.getByText('Add Material'));
    
    fireEvent.change(screen.getByPlaceholderText('Fiber Optic Cable'), { target: { value: 'New Material' } });
    fireEvent.change(screen.getByPlaceholderText('meters, pcs, etc.'), { target: { value: 'unit' } });
    
    fireEvent.click(screen.getByText('Add Material', { selector: 'button[type="submit"]' }));
    
    expect(addDoc).toHaveBeenCalled();
  });

  it('handles deletion with confirmation', async () => {
    window.confirm = vi.fn(() => true);
    render(<MaterialList />);
    
    // Actions are hidden by default, but we can find them
    const deleteButtons = screen.getAllByRole('button').filter(b => b.querySelector('svg.lucide-trash2'));
    fireEvent.click(deleteButtons[0]);
    
    expect(window.confirm).toHaveBeenCalled();
    expect(deleteDoc).toHaveBeenCalled();
  });
});
