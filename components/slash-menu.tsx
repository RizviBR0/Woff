"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SlashMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  onSelect: (command: string, value?: string) => void;
  onClose: () => void;
}

const menuItems = [
  {
    label: "Heading 1",
    command: "formatBlock",
    value: "h1",
    icon: "H1",
    description: "Large heading",
  },
  {
    label: "Heading 2",
    command: "formatBlock",
    value: "h2",
    icon: "H2",
    description: "Medium heading",
  },
  {
    label: "Heading 3",
    command: "formatBlock",
    value: "h3",
    icon: "H3",
    description: "Small heading",
  },
  {
    label: "Heading 4",
    command: "formatBlock",
    value: "h4",
    icon: "H4",
    description: "Extra small heading",
  },
  {
    label: "Paragraph",
    command: "formatBlock",
    value: "p",
    icon: "¶",
    description: "Normal text",
  },
  {
    label: "Bulleted List",
    command: "insertUnorderedList",
    icon: "•",
    description: "Create a bulleted list",
  },
  {
    label: "Numbered List",
    command: "insertOrderedList",
    icon: "1.",
    description: "Create a numbered list",
  },
  {
    label: "Quote",
    command: "formatBlock",
    value: "blockquote",
    icon: '"',
    description: "Insert a quote block",
  },
  {
    label: "Code Block",
    command: "formatBlock",
    value: "pre",
    icon: "</>",
    description: "Insert code block",
  },
  {
    label: "Divider",
    command: "insertHorizontalRule",
    icon: "―",
    description: "Horizontal line",
  },
];

export function SlashMenu({
  isOpen,
  position,
  onSelect,
  onClose,
}: SlashMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [filteredItems, setFilteredItems] = useState(menuItems);
  const menuRef = useRef<HTMLDivElement>(null);
  const selectedItemRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedIndex(0);
      setFilteredItems(menuItems);
    }
  }, [isOpen]);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedItemRef.current && menuRef.current) {
      const selectedElement = selectedItemRef.current;
      const menuElement = menuRef.current;

      const selectedRect = selectedElement.getBoundingClientRect();
      const menuRect = menuElement.getBoundingClientRect();

      if (selectedRect.bottom > menuRect.bottom) {
        selectedElement.scrollIntoView({ block: "end", behavior: "smooth" });
      } else if (selectedRect.top < menuRect.top) {
        selectedElement.scrollIntoView({ block: "start", behavior: "smooth" });
      }
    }
  }, [selectedIndex]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < filteredItems.length - 1 ? prev + 1 : 0
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : filteredItems.length - 1
          );
          break;
        case "Enter":
          e.preventDefault();
          const selectedItem = filteredItems[selectedIndex];
          if (selectedItem) {
            onSelect(selectedItem.command, selectedItem.value);
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, selectedIndex, filteredItems, onSelect, onClose]);

  if (!isOpen) return null;

  // Calculate position to prevent going out of viewport
  const menuWidth = 288; // w-72 = 288px
  const menuHeight = 320; // max-h-80 = 320px
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let adjustedX = position.x;
  let adjustedY = position.y;

  // Adjust horizontal position if menu would overflow viewport
  if (adjustedX + menuWidth > viewportWidth) {
    adjustedX = viewportWidth - menuWidth - 16; // 16px padding from edge
  }
  if (adjustedX < 16) {
    adjustedX = 16; // 16px padding from left edge
  }

  // Adjust vertical position if menu would overflow viewport
  if (adjustedY + menuHeight > viewportHeight) {
    adjustedY = position.y - menuHeight - 32; // Show above cursor instead
  }
  if (adjustedY < 16) {
    adjustedY = 16; // 16px padding from top
  }

  return (
    <div
      ref={menuRef}
      className="fixed z-50 w-72 bg-popover border rounded-lg shadow-xl py-1 max-h-80 overflow-y-auto animate-in fade-in-0 zoom-in-95 scroll-smooth"
      style={{
        left: adjustedX,
        top: adjustedY,
      }}
    >
      <div className="px-2 py-1.5 text-xs text-muted-foreground font-medium">
        BLOCKS
      </div>
      {filteredItems.map((item, index) => (
        <button
          key={item.command + (item.value || "")}
          ref={index === selectedIndex ? selectedItemRef : null}
          className={cn(
            "w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-accent transition-colors",
            index === selectedIndex && "bg-accent"
          )}
          onClick={() => onSelect(item.command, item.value)}
          onMouseEnter={() => setSelectedIndex(index)}
        >
          <span className="w-8 h-8 flex items-center justify-center rounded bg-muted/50 font-mono text-xs text-muted-foreground flex-shrink-0">
            {item.icon}
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">{item.label}</div>
            <div className="text-xs text-muted-foreground">
              {item.description}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
