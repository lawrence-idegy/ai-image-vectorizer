import { useState } from 'react';
import { Icon } from '@iconify/react';
import { templates, templateCategories, getTemplatesByCategory } from '../../data/templates';

const TemplateGallery = ({ onTemplateSelect }) => {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [hoveredTemplate, setHoveredTemplate] = useState(null);

  const filteredTemplates = getTemplatesByCategory(selectedCategory);

  const handleTemplateClick = (template) => {
    if (onTemplateSelect) {
      onTemplateSelect(template);
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Professional Templates</h2>
        <p className="text-gray-600">Start with a template and customize to your needs</p>
      </div>

      {/* Category Filter */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex gap-2 overflow-x-auto">
          {templateCategories.map((category) => (
            <button
              key={category.id}
              onClick={() => setSelectedCategory(category.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium whitespace-nowrap transition-all ${
                selectedCategory === category.id
                  ? 'bg-idegy-blue text-white shadow-md'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <Icon icon={category.icon} className="w-5 h-5" />
              {category.name}
            </button>
          ))}
        </div>
      </div>

      {/* Template Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTemplates.map((template) => (
            <div
              key={template.id}
              className="group relative bg-white rounded-xl border-2 border-gray-200 hover:border-idegy-blue transition-all overflow-hidden cursor-pointer"
              onMouseEnter={() => setHoveredTemplate(template.id)}
              onMouseLeave={() => setHoveredTemplate(null)}
              onClick={() => handleTemplateClick(template)}
            >
              {/* Template Preview */}
              <div className="aspect-[4/3] bg-gray-100 relative overflow-hidden">
                <img
                  src={template.thumbnail}
                  alt={template.name}
                  className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
                />

                {/* Hover Overlay */}
                {hoveredTemplate === template.id && (
                  <div className="absolute inset-0 bg-idegy-blue/90 flex items-center justify-center">
                    <div className="text-center text-white">
                      <Icon icon="mdi:plus-circle" className="w-12 h-12 mx-auto mb-2" />
                      <p className="font-semibold">Use Template</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Template Info */}
              <div className="p-4">
                <h3 className="font-semibold text-gray-900 mb-1">{template.name}</h3>
                <div className="flex items-center justify-between text-sm text-gray-500">
                  <span className="capitalize">{template.category.replace('-', ' ')}</span>
                  <span>{template.width} × {template.height}</span>
                </div>
              </div>

              {/* Category Badge */}
              <div className="absolute top-3 right-3">
                <span className="px-3 py-1 bg-white/90 backdrop-blur-sm rounded-full text-xs font-medium text-gray-700 shadow-sm">
                  {template.category.replace('-', ' ')}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Empty State */}
        {filteredTemplates.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <Icon icon="mdi:folder-open-outline" className="w-16 h-16 mb-4 text-gray-300" />
            <p className="text-lg font-medium">No templates found</p>
            <p className="text-sm">Try selecting a different category</p>
          </div>
        )}
      </div>

      {/* Footer Stats */}
      <div className="bg-white border-t border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2 text-gray-600">
            <Icon icon="mdi:information-outline" className="w-4 h-4" />
            <span>Click any template to start editing</span>
          </div>
          <div className="text-gray-600">
            <span className="font-semibold text-idegy-blue">{filteredTemplates.length}</span> templates available
          </div>
        </div>
      </div>
    </div>
  );
};

export default TemplateGallery;
