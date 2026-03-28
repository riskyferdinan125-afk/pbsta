import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Dashboard from './Dashboard';
import { getDocs, getDoc } from 'firebase/firestore';

// Mock data
const mockTickets = [
  { id: '1', status: 'open', customerId: 'c1', description: 'Test Ticket 1', priority: 'high', createdAt: { toDate: () => new Date() } },
  { id: '2', status: 'in-progress', customerId: 'c2', description: 'Test Ticket 2', priority: 'medium', createdAt: { toDate: () => new Date() } },
  { id: '3', status: 'resolved', customerId: 'c1', description: 'Test Ticket 3', priority: 'low', createdAt: { toDate: () => new Date() } },
];

const mockCustomer = { name: 'John Doe' };

describe('Dashboard Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    const { container } = render(<Dashboard />);
    expect(container.querySelector('.animate-pulse')).toBeDefined();
  });

  it('renders stats correctly after loading', async () => {
    (getDocs as any).mockResolvedValueOnce({
      docs: mockTickets.map(t => ({ id: t.id, data: () => t }))
    });
    (getDocs as any).mockResolvedValueOnce({
      docs: mockTickets.map(t => ({ id: t.id, data: () => t }))
    });
    (getDoc as any).mockResolvedValue({
      exists: () => true,
      data: () => mockCustomer
    });

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('Total Tickets')).toBeDefined();
      expect(screen.getByText('3')).toBeDefined(); // Total
    });

    // Check individual stats by looking at the parent of the label
    const openStat = screen.getByText('Open').parentElement;
    expect(openStat?.querySelector('h3')?.textContent).toBe('1');

    const inProgressStat = screen.getByText('In Progress').parentElement;
    expect(inProgressStat?.querySelector('h3')?.textContent).toBe('1');

    const resolvedStat = screen.getByText('Resolved').parentElement;
    expect(resolvedStat?.querySelector('h3')?.textContent).toBe('1');

    expect(screen.getByText('Recent Tickets')).toBeDefined();
    expect(screen.getAllByText('John Doe').length).toBeGreaterThan(0);
  });

  it('handles empty state correctly', async () => {
    (getDocs as any).mockResolvedValue({
      docs: []
    });

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('No recent tickets found.')).toBeDefined();
      expect(screen.getAllByText('0').length).toBeGreaterThan(0);
    });
  });
});
