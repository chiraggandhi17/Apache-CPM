import React, { useState } from 'react';
import { Check, Palette, Sparkles, RefreshCw } from 'lucide-react';
import { CURATED_SWATCHES, getGradientLadder, getReadableTextColor } from '../../lib/color-resolver';


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
  const ladder = getGradientLadder(activeColor, 4);

  return (
    <div className="bg-[var(--badge-bg)]/70 p-3.5 rounded-2xl border border-[var(--border)] space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
          <Palette className="w-3.5 h-3.5 text-[var(--accent)]" />
          <span>Color Theme Profile</span>
        </label>
        
        {value ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-[11px] text-[var(--accent)] hover:brightness-90 font-bold flex items-center gap-1 underline"
          >
            <RefreshCw className="w-3 h-3" /> Reset to Inherited Parent Color
          </button>
        ) : inheritedFromTitle ? (
          <span className="text-[10px] text-[var(--text-secondary)] font-medium flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-[var(--accent)]" /> Inheriting from: <strong className="text-[var(--text-primary)] font-bold">{inheritedFromTitle}</strong>
          </span>
        ) : null}
      </div>

      {/* Spacious grid of curated swatches */}
      <div className="grid grid-cols-6 sm:grid-cols-12 gap-2">
        {CURATED_SWATCHES.map(swatch => {
          const isSelected = value === swatch.hex || (!value && inheritedColor === swatch.hex);
          const iconColor = getReadableTextColor(swatch.hex);
          return (
            <button
              key={swatch.hex}
              type="button"
              onClick={() => onChange(swatch.hex)}
              title={swatch.name}
              style={{ backgroundColor: swatch.hex }}
              className={`h-8 rounded-xl flex items-center justify-center transition-all hover:scale-110 shadow-2xs border ${
                isSelected 
                  ? 'ring-2 ring-offset-2 ring-offset-[var(--card-bg)] ring-[var(--text-primary)] scale-105 shadow-md' 
                  : 'border-black/10 opacity-90 hover:opacity-100'
              }`}
            >
              {isSelected && <Check className="w-4 h-4 drop-shadow-md stroke-[3]" style={{ color: iconColor }} />}
            </button>
          );
        })}
      </div>

      {/* Live Level-Gradient Preview — shows exactly how this color shades down the hierarchy */}
      <div className="pt-1 border-t border-[var(--border)]/60">
        <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] block mb-1.5 tracking-wide">
          Hierarchy Gradient Preview
        </span>
        <div className="flex items-center gap-1.5">
          {ladder.map((shade, idx) => (
            <div key={idx} className="flex-1 flex flex-col items-center gap-1">
              <div
                className="w-full h-7 rounded-lg border border-black/10 shadow-2xs"
                style={{ backgroundColor: shade }}
                title={`Level ${idx + 1}: ${shade}`}
              />
              <span className="text-[9px] font-mono font-bold text-[var(--text-muted)]">L{idx + 1}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Custom Color Input & Preview */}
      <div className="flex items-center justify-between pt-1 border-t border-[var(--border)]/60">
        <button
          type="button"
          onClick={() => setShowCustom(!showCustom)}
          className="text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1"
        >
          <span>{showCustom ? '▲ Hide Custom Hex' : '▼ Custom Color Hex Code...'}</span>
        </button>

        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[var(--text-secondary)] font-medium">Selected:</span>
          <div 
            className="w-5 h-5 rounded-md border border-[var(--border)] shadow-2xs"
            style={{ backgroundColor: activeColor }}
          />
          <span className="font-mono text-xs font-bold text-[var(--text-primary)] uppercase">{activeColor}</span>
        </div>
      </div>

      {showCustom && (
        <div className="flex items-center gap-3 pt-2 animate-in fade-in">
          <input
            type="color"
            value={activeColor}
            onChange={e => onChange(e.target.value)}
            className="w-9 h-9 rounded-xl cursor-pointer border border-[var(--border)] shadow-2xs p-0.5 bg-[var(--card-bg)]"
          />
          <input
            type="text"
            value={value || ''}
            placeholder={inheritedColor}
            onChange={e => onChange(e.target.value)}
            className="flex-1 text-xs font-mono px-3 py-2 border border-[var(--border)] rounded-xl uppercase font-bold outline-none focus:border-[var(--accent)] bg-[var(--card-bg)] text-[var(--text-primary)]"
          />
        </div>
      )}
    </div>
  );
};
