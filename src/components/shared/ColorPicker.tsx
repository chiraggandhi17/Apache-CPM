import React, { useState } from 'react';
import { Check, Palette } from 'lucide-react';

export const CURATED_SWATCHES = [
  { name: 'Teal', hex: '#0D9488' },
  { name: 'Blue', hex: '#2563EB' },
  { name: 'Orange', hex: '#F97316' },
  { name: 'Purple', hex: '#8B5CF6' },
  { name: 'Red', hex: '#EF4444' },
  { name: 'Green', hex: '#22C55E' },
  { name: 'Indigo', hex: '#6366F1' },
  { name: 'Amber', hex: '#EAB308' },
  { name: 'Sky', hex: '#0EA5E9' },
  { name: 'Pink', hex: '#EC4899' },
  { name: 'Rose', hex: '#F43F5E' },
  { name: 'Gray', hex: '#6B7280' },
];

interface ColorPickerProps {
  value: string | null;
  onChange: (hex: string | null) => void;
  inheritedColor?: string;
  inheritedFromTitle?: string;
}

export const ColorPicker: React.FC<ColorPickerProps> = ({
  value,
  onChange,
  inheritedColor = '#6B7280',
  inheritedFromTitle,
}) => {
  const [showCustom, setShowCustom] = useState(false);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-semibold text-gray-700 flex items-center gap-1.5">
          <Palette className="w-3 h-3 text-gray-500" />
          Color Theme <span className="text-gray-400 font-normal">(Optional)</span>
        </label>
        {value ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-[11px] text-teal-600 hover:text-teal-700 font-medium"
          >
            Reset to inherited
          </button>
        ) : inheritedFromTitle ? (
          <span className="text-[10px] text-gray-400">
            Inherited from: <span className="font-medium text-gray-600">{inheritedFromTitle}</span>
          </span>
        ) : null}
      </div>

      {/* Sleek Compact Horizontal Swatch Row */}
      <div className="flex items-center gap-1.5 overflow-x-auto py-1">
        {CURATED_SWATCHES.map(swatch => {
          const isSelected = value === swatch.hex || (!value && inheritedColor === swatch.hex);
          return (
            <button
              key={swatch.hex}
              type="button"
              onClick={() => onChange(swatch.hex)}
              title={swatch.name}
              style={{ backgroundColor: swatch.hex }}
              className={`w-6 h-6 rounded-md flex items-center justify-center transition-transform hover:scale-110 shrink-0 shadow-2xs border ${
                isSelected ? 'ring-2 ring-offset-1 ring-gray-900 scale-105' : 'border-black/10'
              }`}
            >
              {value === swatch.hex && <Check className="w-3 h-3 text-white drop-shadow-xs stroke-[3]" />}
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setShowCustom(!showCustom)}
          className="text-[10px] px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md shrink-0 font-medium border border-gray-200"
        >
          Custom...
        </button>
      </div>

      {showCustom && (
        <div className="flex items-center gap-2 pt-1">
          <input
            type="color"
            value={value || '#2563EB'}
            onChange={e => onChange(e.target.value)}
            className="w-6 h-6 rounded-md cursor-pointer border border-gray-300"
          />
          <input
            type="text"
            value={value || ''}
            placeholder="#2563EB"
            onChange={e => onChange(e.target.value)}
            className="w-24 text-[11px] font-mono px-2 py-0.5 border border-gray-300 rounded-md uppercase"
          />
        </div>
      )}
    </div>
  );
};
