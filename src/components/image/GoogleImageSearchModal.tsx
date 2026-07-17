import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, Loader, Download } from 'lucide-react';

interface GoogleImageSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (imageUrl: string) => void;
}

interface ImageResult {
  link: string;
  image: {
    thumbnailLink: string;
    contextLink: string;
  };
  title: string;
}

const GoogleImageSearchModal: React.FC<GoogleImageSearchModalProps> = ({
  isOpen,
  onClose,
  onImport,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<ImageResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const API_KEY = 'AIzaSyBK8-0V3lR17qYhJAnWMhRXQRqof-kHJ_g';
  const SEARCH_ENGINE_ID = 'a3e3e8d4f8f4b4c2c';

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    setLoading(true);
    setError('');
    setResults([]);
    setSelectedImage(null);

    try {
      const response = await fetch(
        `https://www.googleapis.com/customsearch/v1?key=${API_KEY}&cx=${SEARCH_ENGINE_ID}&q=${encodeURIComponent(
          searchQuery
        )}&searchType=image&num=10`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch images');
      }

      const data = await response.json();

      if (data.items && data.items.length > 0) {
        setResults(data.items);
      } else {
        setError('No images found. Try a different search term.');
      }
    } catch (err) {
      setError('Failed to search images. Please try again.');
      console.error('Search error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!selectedImage) return;

    try {
      const response = await fetch(selectedImage);
      const blob = await response.blob();

      const reader = new FileReader();
      reader.onloadend = () => {
        onImport(reader.result as string);
        onClose();
      };
      reader.readAsDataURL(blob);
    } catch (err) {
      setError('Failed to import image. The image may not be accessible.');
      console.error('Import error:', err);
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{
        zIndex: 999999,
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0
      }}
    >
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      <div
        className="relative bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col border border-gray-700"
        style={{ zIndex: 1000000 }}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center space-x-3">
            <Search className="w-5 h-5 text-green-400" />
            <h2 className="text-lg font-semibold text-white">Search Images</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-700 rounded transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="p-4 border-b border-gray-700">
          <form onSubmit={handleSearch} className="flex space-x-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for images..."
              className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-green-400"
              autoFocus
            />
            <button
              type="submit"
              disabled={loading || !searchQuery.trim()}
              className="px-6 py-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center space-x-2"
            >
              {loading ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  <span>Searching...</span>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  <span>Search</span>
                </>
              )}
            </button>
          </form>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {error && (
            <div className="text-center py-8">
              <p className="text-red-400">{error}</p>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader className="w-8 h-8 animate-spin text-green-400" />
            </div>
          )}

          {!loading && !error && results.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Search for images to get started</p>
            </div>
          )}

          {!loading && results.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              {results.map((result, index) => (
                <button
                  key={index}
                  onClick={() => setSelectedImage(result.link)}
                  className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                    selectedImage === result.link
                      ? 'border-green-400 ring-2 ring-green-400/50'
                      : 'border-gray-600 hover:border-gray-500'
                  }`}
                >
                  <img
                    src={result.image.thumbnailLink}
                    alt={result.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {selectedImage === result.link && (
                    <div className="absolute inset-0 bg-green-400/20 flex items-center justify-center">
                      <div className="w-8 h-8 bg-green-400 rounded-full flex items-center justify-center">
                        <svg
                          className="w-5 h-5 text-white"
                          fill="none"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path d="M5 13l4 4L19 7"></path>
                        </svg>
                      </div>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {selectedImage && (
          <div className="p-4 border-t border-gray-700 flex justify-end space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition-colors flex items-center space-x-2"
            >
              <Download className="w-4 h-4" />
              <span>Import Selected</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default GoogleImageSearchModal;
