import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { KnowledgeBaseArticle } from '../types';
import { Search, Book, Plus, Edit2, Trash2, X, ChevronRight, Clock, Tag, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ConfirmationModal from './ConfirmationModal';

export default function KnowledgeBase() {
  const [articles, setArticles] = useState<KnowledgeBaseArticle[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedArticle, setSelectedArticle] = useState<KnowledgeBaseArticle | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<KnowledgeBaseArticle | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<{ isOpen: boolean; id?: string }>({ isOpen: false });

  const [formData, setFormData] = useState({
    title: '',
    content: '',
    category: '',
    tags: '',
    isPublic: true
  });

  useEffect(() => {
    const q = query(collection(db, 'knowledgeBase'), orderBy('updatedAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as KnowledgeBaseArticle));
      setArticles(docs);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'knowledgeBase');
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const filteredArticles = articles.filter(article => 
    article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    article.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
    article.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
    article.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;

    const articleData = {
      title: formData.title,
      content: formData.content,
      category: formData.category,
      tags: formData.tags.split(',').map(t => t.trim()).filter(t => t),
      isPublic: formData.isPublic,
      authorId: auth.currentUser.uid,
      updatedAt: serverTimestamp()
    };

    try {
      if (editingArticle) {
        await updateDoc(doc(db, 'knowledgeBase', editingArticle.id), articleData);
      } else {
        await addDoc(collection(db, 'knowledgeBase'), {
          ...articleData,
          createdAt: serverTimestamp()
        });
      }
      setIsModalOpen(false);
      setEditingArticle(null);
      setFormData({ title: '', content: '', category: '', tags: '', isPublic: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'knowledgeBase');
    }
  };

  const handleDelete = async (id: string) => {
    setConfirmDelete({ isOpen: true, id });
  };

  const confirmDeleteArticle = async () => {
    if (!confirmDelete.id) return;
    try {
      await deleteDoc(doc(db, 'knowledgeBase', confirmDelete.id));
      if (selectedArticle?.id === confirmDelete.id) setSelectedArticle(null);
      setConfirmDelete({ isOpen: false });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'knowledgeBase');
    }
  };

  const openEditModal = (article: KnowledgeBaseArticle) => {
    setEditingArticle(article);
    setFormData({
      title: article.title,
      content: article.content,
      category: article.category,
      tags: article.tags.join(', '),
      isPublic: article.isPublic
    });
    setIsModalOpen(true);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900">Knowledge Base</h1>
          <p className="text-neutral-500">Find solutions and documentation</p>
        </div>
        <button
          onClick={() => {
            setEditingArticle(null);
            setFormData({ title: '', content: '', category: '', tags: '', isPublic: true });
            setIsModalOpen(true);
          }}
          className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20 font-semibold"
        >
          <Plus className="w-5 h-5" />
          Create Article
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Sidebar / Search */}
        <div className="lg:col-span-4 space-y-6">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
            <input
              type="text"
              placeholder="Search articles..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-white border border-black/10 rounded-2xl focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all shadow-sm"
            />
          </div>

          <div className="bg-white rounded-2xl border border-black/5 overflow-hidden shadow-sm">
            <div className="p-4 bg-neutral-50 border-b border-black/5">
              <h3 className="font-semibold text-neutral-900">Articles</h3>
            </div>
            <div className="divide-y divide-black/5 max-h-[600px] overflow-y-auto">
              {loading ? (
                <div className="p-8 text-center text-neutral-500">Loading...</div>
              ) : filteredArticles.length === 0 ? (
                <div className="p-8 text-center text-neutral-500">No articles found</div>
              ) : (
                filteredArticles.map(article => (
                  <button
                    key={article.id}
                    onClick={() => setSelectedArticle(article)}
                    className={`w-full p-4 text-left hover:bg-neutral-50 transition-colors flex items-start gap-3 ${selectedArticle?.id === article.id ? 'bg-emerald-50/50 border-r-4 border-emerald-600' : ''}`}
                  >
                    <Book className={`w-5 h-5 mt-0.5 ${selectedArticle?.id === article.id ? 'text-emerald-600' : 'text-neutral-400'}`} />
                    <div>
                      <h4 className="font-medium text-neutral-900 line-clamp-1">{article.title}</h4>
                      <p className="text-xs text-neutral-500 mt-1">{article.category}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Article Content */}
        <div className="lg:col-span-8">
          <AnimatePresence mode="wait">
            {selectedArticle ? (
              <motion.div
                key={selectedArticle.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="bg-white rounded-3xl border border-black/5 shadow-sm overflow-hidden"
              >
                <div className="p-8 border-b border-black/5 flex items-start justify-between bg-neutral-50/50">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full uppercase tracking-wider">
                        {selectedArticle.category}
                      </span>
                      {!selectedArticle.isPublic && (
                        <span className="px-3 py-1 bg-amber-100 text-amber-700 text-xs font-bold rounded-full uppercase tracking-wider">
                          Internal Only
                        </span>
                      )}
                    </div>
                    <h2 className="text-4xl font-bold text-neutral-900 leading-tight">{selectedArticle.title}</h2>
                    <div className="flex flex-wrap items-center gap-6 text-sm text-neutral-500">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        Last updated: {selectedArticle.updatedAt instanceof Timestamp ? selectedArticle.updatedAt.toDate().toLocaleDateString() : 'Just now'}
                      </div>
                      <div className="flex items-center gap-2">
                        <Tag className="w-4 h-4" />
                        {selectedArticle.tags.join(', ')}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openEditModal(selectedArticle)}
                      className="p-2 hover:bg-neutral-200 rounded-xl transition-colors text-neutral-600"
                    >
                      <Edit2 className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleDelete(selectedArticle.id)}
                      className="p-2 hover:bg-red-50 rounded-xl transition-colors text-red-600"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                <div className="p-8 prose prose-neutral max-w-none">
                  <div className="whitespace-pre-wrap text-neutral-700 leading-relaxed text-lg">
                    {selectedArticle.content}
                  </div>
                </div>
              </motion.div>
            ) : (
              <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-center p-12 bg-white rounded-3xl border border-dashed border-neutral-300">
                <div className="w-20 h-20 bg-neutral-100 rounded-full flex items-center justify-center mb-6">
                  <Book className="w-10 h-10 text-neutral-400" />
                </div>
                <h3 className="text-2xl font-bold text-neutral-900 mb-2">Select an article</h3>
                <p className="text-neutral-500 max-w-sm">Choose an article from the list to view its content or search for a specific topic.</p>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Create/Edit Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="p-6 border-b border-black/5 flex items-center justify-between bg-neutral-50">
                <h3 className="text-xl font-bold text-neutral-900">
                  {editingArticle ? 'Edit Article' : 'Create New Article'}
                </h3>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-neutral-200 rounded-xl transition-colors">
                  <X className="w-5 h-5 text-neutral-500" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-neutral-700">Title</label>
                  <input
                    required
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-4 py-3 bg-white border border-black/10 rounded-xl focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all"
                    placeholder="e.g., How to reset your password"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-neutral-700">Category</label>
                    <input
                      required
                      type="text"
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      className="w-full px-4 py-3 bg-white border border-black/10 rounded-xl focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all"
                      placeholder="e.g., Security, Hardware"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-neutral-700">Tags (comma separated)</label>
                    <input
                      type="text"
                      value={formData.tags}
                      onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                      className="w-full px-4 py-3 bg-white border border-black/10 rounded-xl focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all"
                      placeholder="e.g., password, reset, login"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-neutral-700">Content</label>
                  <textarea
                    required
                    rows={12}
                    value={formData.content}
                    onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                    className="w-full px-4 py-3 bg-white border border-black/10 rounded-xl focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all resize-none font-sans"
                    placeholder="Write your article content here..."
                  />
                </div>

                <div className="flex items-center gap-3 p-4 bg-neutral-50 rounded-2xl border border-black/5">
                  <input
                    type="checkbox"
                    id="isPublic"
                    checked={formData.isPublic}
                    onChange={(e) => setFormData({ ...formData, isPublic: e.target.checked })}
                    className="w-5 h-5 rounded border-neutral-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <label htmlFor="isPublic" className="text-sm font-medium text-neutral-700">
                    Make this article public (visible to customers)
                  </label>
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-6 py-2.5 text-neutral-600 font-semibold hover:bg-neutral-100 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-8 py-2.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20"
                  >
                    {editingArticle ? 'Update Article' : 'Create Article'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmDelete.isOpen}
        title="Delete Article"
        message="Are you sure you want to delete this article? This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={confirmDeleteArticle}
        onCancel={() => setConfirmDelete({ isOpen: false })}
        variant="danger"
      />
    </div>
  );
}
