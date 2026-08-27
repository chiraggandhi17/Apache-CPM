import React, { useState } from 'react';
import { Check, Palette, Sparkles, RefreshCw } from 'lucide-react';
import { CURATED_SWATCHES } from '../../lib/color-resolver';


interface ColorPickerProps {
  value: string | null;
  onChange: (hex: string | null) => void;
  inheritedColor?: string;
  inheritedFromTitle?: string;
}

export const ColorPicker: React.FC<ColorPickerProps> = ({
  value,
  onChange,
  inheritedColor = '#0D9488',
  inheritedFromTitle,
}) => {
  const [showCustom, setShowCustom] = useState(false);
  const activeColor = value || inheritedColor;

  return (
    <div className="bg-gray-50/80 p-3.5 rounded-2xl border border-gray-200/80 space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
          <Palette className="w-3.5 h-3.5 text-teal-600" />
          <span>Color Theme Profile</span>
        </label>
        
        {value ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-[11px] text-teal-700 hover:text-teal-800 font-bold flex items-center gap-1 underline"
          >
            <RefreshCw className="w-3 h-3" /> Reset to Inherited Parent Color
          </button>
        ) : inheritedFromTitle ? (
          <span className="text-[10px] text-gray-500 font-medium flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-teal-600" /> Inheriting from: <strong className="text-gray-800 font-bold">{inheritedFromTitle}</strong>
          </span>
        ) : null}
      </div>

      {/* Spacious 6-column Grid Swatches */}
      <div className="grid grid-cols-6 sm:grid-cols-12 gap-2">
        {CURATED_SWATCHES.map(swatch => {
          const isSelected = value === swatch.hex || (!value && inheritedColor === swatch.hex);
          return (
            <button
              key={swatch.hex}
              type="button"
              onClick={() => onChange(swatch.hex)}
              title={swatch.name}
              style={{ backgroundColor: swatch.hex }}
              className={`h-8 rounded-xl flex items-center justify-center transition-all hover:scale-110 shadow-2xs border ${
                isSelected 
                  ? 'ring-2 ring-offset-2 ring-gray-900 scale-105 shadow-md' 
                  : 'border-black/10 opacity-90 hover:opacity-100'
              }`}
            >
              {isSelected && <Check className="w-4 h-4 text-white drop-shadow-md stroke-[3]" />}
            </button>
          );
        })}
      </div>

      {/* Custom Color Input & Preview */}
      <div className="flex items-center justify-between pt-1 border-t border-gray-200/60">
        <button
          type="button"
          onClick={() => setShowCustom(!showCustom)}
          className="text-xs font-semibold text-gray-700 hover:text-gray-900 flex items-center gap-1"
        >
          <span>{showCustom ? '▲ Hide Custom Hex' : '▼ Custom Color Hex Code...'}</span>
        </button>

        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-500 font-medium">Selected:</span>
          <div 
            className="w-5 h-5 rounded-md border border-gray-300 shadow-2xs"
            style={{ backgroundColor: activeColor }}
          />
          <span className="font-mono text-xs font-bold text-gray-800 uppercase">{activeColor}</span>
        </div>
      </div>

      {showCustom && (
        <div className="flex items-center gap-3 pt-2 animate-in fade-in">
          <input
            type="color"
            value={activeColor}
            onChange={e => onChange(e.target.value)}
            className="w-9 h-9 rounded-xl cursor-pointer border border-gray-300 shadow-2xs p-0.5 bg-white"
          />
          <input
            type="text"
            value={value || ''}
            placeholder={inheritedColor}
            onChange={e => onChange(e.target.value)}
            className="flex-1 text-xs font-mono px-3 py-2 border border-gray-300 rounded-xl uppercase font-bold outline-none focus:border-teal-500 bg-white"
          />
        </div>
      )}
    </div>
  );
};
