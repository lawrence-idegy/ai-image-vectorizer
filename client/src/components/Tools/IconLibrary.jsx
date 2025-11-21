import { useState, useEffect } from 'react';
import { Icon } from '@iconify/react';

const IconLibrary = ({ onIconSelect, isOpen, onClose }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCollection, setSelectedCollection] = useState('mdi');
  const [icons, setIcons] = useState([]);
  const [loading, setLoading] = useState(false);

  // Popular icon collections
  const collections = [
    { id: 'mdi', name: 'Material Design Icons', prefix: 'mdi' },
    { id: 'fa', name: 'Font Awesome', prefix: 'fa' },
    { id: 'bi', name: 'Bootstrap Icons', prefix: 'bi' },
    { id: 'heroicons', name: 'Hero Icons', prefix: 'heroicons' },
    { id: 'feather', name: 'Feather Icons', prefix: 'feather' },
    { id: 'lucide', name: 'Lucide', prefix: 'lucide' },
  ];

  // Popular/common icons for each collection
  const popularIcons = {
    mdi: [
      'home', 'heart', 'star', 'user', 'settings', 'search', 'menu', 'close',
      'check', 'arrow-right', 'arrow-left', 'arrow-up', 'arrow-down',
      'plus', 'minus', 'edit', 'delete', 'download', 'upload', 'share',
      'bell', 'calendar', 'clock', 'email', 'phone', 'location',
      'camera', 'image', 'video', 'music', 'file', 'folder',
      'shopping-cart', 'credit-card', 'bank', 'wallet',
      'wifi', 'bluetooth', 'battery', 'signal',
      'sun', 'moon', 'cloud', 'umbrella', 'fire', 'water-drop',
    ],
    fa: [
      'house', 'heart', 'star', 'user', 'gear', 'magnifying-glass',
      'bars', 'xmark', 'check', 'arrow-right', 'arrow-left',
      'plus', 'minus', 'pen', 'trash', 'download', 'upload', 'share',
    ],
    bi: [
      'house', 'heart', 'star', 'person', 'gear', 'search',
      'list', 'x', 'check', 'arrow-right', 'arrow-left',
    ],
    heroicons: [
      'home', 'heart', 'star', 'user', 'cog', 'magnifying-glass',
      'bars-3', 'x-mark', 'check', 'arrow-right', 'arrow-left',
    ],
    feather: [
      'home', 'heart', 'star', 'user', 'settings', 'search',
      'menu', 'x', 'check', 'arrow-right', 'arrow-left',
    ],
    lucide: [
      'home', 'heart', 'star', 'user', 'settings', 'search',
      'menu', 'x', 'check', 'arrow-right', 'arrow-left',
    ],
  };

  useEffect(() => {
    if (searchQuery.trim()) {
      searchIcons();
    } else {
      loadPopularIcons();
    }
  }, [searchQuery, selectedCollection]);

  const loadPopularIcons = () => {
    const collection = collections.find(c => c.id === selectedCollection);
    const iconNames = popularIcons[selectedCollection] || popularIcons.mdi;
    const iconList = iconNames.map(name => `${collection.prefix}:${name}`);
    setIcons(iconList);
  };

  const searchIcons = async () => {
    setLoading(true);
    try {
      // For now, filter popular icons by search query
      // In production, you could use Iconify API: https://api.iconify.design/search?query=...
      const collection = collections.find(c => c.id === selectedCollection);
      const filtered = (popularIcons[selectedCollection] || popularIcons.mdi)
        .filter(name => name.toLowerCase().includes(searchQuery.toLowerCase()))
        .map(name => `${collection.prefix}:${name}`);
      setIcons(filtered);
    } catch (error) {
      console.error('Error searching icons:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleIconClick = (iconName) => {
    if (onIconSelect) {
      onIconSelect(iconName);
    }
    if (onClose) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="gradient-header p-6 rounded-t-2xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-white">Icon Library</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <Icon icon="mdi:close" className="w-6 h-6 text-white" />
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Icon
              icon="mdi:magnify"
              className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search thousands of icons..."
              className="w-full pl-12 pr-4 py-3 rounded-lg border-2 border-white/20 bg-white/10 text-white placeholder-white/60 focus:bg-white focus:text-gray-900 focus:placeholder-gray-400 transition-all outline-none"
            />
          </div>
        </div>

        {/* Collection Tabs */}
        <div className="flex gap-2 px-6 py-4 border-b border-gray-200 overflow-x-auto">
          {collections.map((collection) => (
            <button
              key={collection.id}
              onClick={() => setSelectedCollection(collection.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                selectedCollection === collection.id
                  ? 'bg-idegy-blue text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {collection.name}
            </button>
          ))}
        </div>

        {/* Icon Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Icon icon="mdi:loading" className="w-8 h-8 animate-spin text-idegy-blue" />
            </div>
          ) : icons.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500">
              <Icon icon="mdi:magnify-close" className="w-16 h-16 mb-4 text-gray-300" />
              <p className="text-lg font-medium">No icons found</p>
              <p className="text-sm">Try a different search term</p>
            </div>
          ) : (
            <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-3">
              {icons.map((iconName) => (
                <button
                  key={iconName}
                  onClick={() => handleIconClick(iconName)}
                  className="aspect-square p-3 rounded-lg border-2 border-gray-200 hover:border-idegy-blue hover:bg-idegy-lightblue transition-all flex items-center justify-center group"
                  title={iconName}
                >
                  <Icon icon={iconName} className="w-full h-full text-gray-700 group-hover:text-idegy-blue" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 p-4 bg-gray-50 rounded-b-2xl">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <Icon icon="mdi:information-outline" className="w-4 h-4" />
              <span>Powered by Iconify - 200,000+ icons</span>
            </div>
            <div>
              <span className="font-medium">{icons.length}</span> icons shown
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IconLibrary;
