import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import TicketSelector from './TicketSelector';
import { Ticket } from '../types';

const mockTickets: (Ticket & { customerName?: string })[] = [
  { id: '1', ticketNumber: 1001, customerName: 'Alice', customerId: 'c1', description: 'Broken screen', status: 'open', priority: 'high', category: 'PROJECT', createdAt: {} as any, technicianIds: [] },
  { id: '2', ticketNumber: 1002, customerName: 'Bob', customerId: 'c2', description: 'Software update', status: 'in-progress', priority: 'medium', category: 'CORRECTIVE', createdAt: {} as any, technicianIds: [] },
];

describe('TicketSelector Component', () => {
  it('renders correctly with tickets', () => {
    render(
      <TicketSelector 
        tickets={mockTickets} 
        selectedIds={[]} 
        onSelect={() => {}} 
        onDeselect={() => {}} 
      />
    );
    expect(screen.getByText('Alice')).toBeDefined();
    expect(screen.getByText('Bob')).toBeDefined();
  });

  it('filters tickets based on search input', () => {
    render(
      <TicketSelector 
        tickets={mockTickets} 
        selectedIds={[]} 
        onSelect={() => {}} 
        onDeselect={() => {}} 
      />
    );
    const input = screen.getByPlaceholderText('Search tickets to link...');
    fireEvent.change(input, { target: { value: 'Alice' } });
    
    expect(screen.getByText('Alice')).toBeDefined();
    expect(screen.queryByText('Bob')).toBeNull();
  });

  it('calls onSelect when a ticket is clicked', () => {
    const onSelect = vi.fn();
    render(
      <TicketSelector 
        tickets={mockTickets} 
        selectedIds={[]} 
        onSelect={onSelect} 
        onDeselect={() => {}} 
      />
    );
    fireEvent.click(screen.getByText('Alice'));
    expect(onSelect).toHaveBeenCalledWith('1');
  });

  it('calls onDeselect when a selected ticket is clicked', () => {
    const onDeselect = vi.fn();
    render(
      <TicketSelector 
        tickets={mockTickets} 
        selectedIds={['1']} 
        onSelect={() => {}} 
        onDeselect={onDeselect} 
      />
    );
    fireEvent.click(screen.getByText('Alice'));
    expect(onDeselect).toHaveBeenCalledWith('1');
  });

  it('shows selected tickets as tags', () => {
    render(
      <TicketSelector 
        tickets={mockTickets} 
        selectedIds={['1']} 
        onSelect={() => {}} 
        onDeselect={() => {}} 
      />
    );
    expect(screen.getAllByText('#1001').length).toBeGreaterThan(0);
  });
});
