import React, { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface PortalDropdownProps {
  open: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  children: React.ReactNode;
  align?: 'left' | 'right';
  width?: number;
}

/**
 * Renders dropdown/popover content into document.body via a portal, positioned
 * under its trigger element using fixed coordinates. This sidesteps a whole class
 * of bugs where an `overflow-y-auto`/`overflow-hidden` ancestor (e.g. the app's
 * scrollable <main>) clips or hides an `absolute`-positioned popover before it
 * ever reaches the sidebar/other UI it should render above.
 */
export const PortalDropdown: React.FC<PortalDropdownProps> = ({
  open,
  anchorRef,
  onClose,
  children,
  align = 'left',
  width,
}) => {
  const [pos, setPos] = useState<{ top: number; left: number; minWidth: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;

    const updatePosition = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPos({
        top: rect.bottom + 6,
        left: align === 'right' ? rect.right - (width || rect.width) : rect.left,
        minWidth: width || rect.width,
      });
    };

    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open, anchorRef, align, width]);

  // Close on outside click / Escape
  useLayoutEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (anchorRef.current?.contains(target)) return;
      const panel = document.getElementById('portal-dropdown-panel');
      if (panel && panel.contains(target)) return;
      onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open, anchorRef, onClose]);

  if (!open || !pos) return null;

  return createPortal(
    <div
      id="portal-dropdown-panel"
      style={{ position: 'fixed', top: pos.top, left: pos.left, minWidth: pos.minWidth, zIndex: 9999 }}
      className="animate-in fade-in zoom-in-95 duration-100"
    >
      {children}
    </div>,
    document.body
  );
};
