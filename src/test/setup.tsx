import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock Firebase
vi.mock('../firebase', () => ({
  auth: {
    onAuthStateChanged: vi.fn(),
    currentUser: null,
  },
  db: {},
  login: vi.fn(),
  logout: vi.fn(),
  testConnection: vi.fn(),
  handleFirestoreError: vi.fn(),
  OperationType: {
    LIST: 'list',
    CREATE: 'create',
    UPDATE: 'update',
    DELETE: 'delete',
    GET: 'get',
    WRITE: 'write',
  },
}));

// Mock Firebase Firestore
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  onSnapshot: vi.fn(() => vi.fn()),
  addDoc: vi.fn(),
  serverTimestamp: vi.fn(),
  Timestamp: {
    fromDate: vi.fn((date) => ({ toDate: () => date })),
    now: vi.fn(() => ({ toDate: () => new Date() })),
  },
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  runTransaction: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
}));

// Mock Motion
vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    h1: ({ children, ...props }: any) => <h1 {...props}>{children}</h1>,
    p: ({ children, ...props }: any) => <p {...props}>{children}</p>,
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));
