'use client';

import { useState, type FormEvent } from 'react';
import {
  LayoutDashboard, Cable, Tag, Factory, FolderOpen, Wrench, Image,
  Settings, ExternalLink, LogOut, FileText, Database, Box, Layers,
  Cpu, HardDrive, Server, Cloud, Link as LinkIcon, List, Grid, Trees,
  User, Users, Shield, Bell, Mail, MessageSquare, Search, Filter,
  Plus, Edit, Trash2, Save, X, Check, ChevronUp, ChevronDown,
  ChevronRight, ChevronLeft, Circle, Star, Heart, Bookmark, Flag,
  type LucideIcon,
} from 'lucide-react';

const ICONS: { name: string; Icon: LucideIcon }[] = [
  { name: 'LayoutDashboard', Icon: LayoutDashboard },
  { name: 'Cable', Icon: Cable },
  { name: 'Tag', Icon: Tag },
  { name: 'Factory', Icon: Factory },
  { name: 'FolderOpen', Icon: FolderOpen },
  { name: 'Wrench', Icon: Wrench },
  { name: 'Image', Icon: Image },
  { name: 'Settings', Icon: Settings },
  { name: 'ExternalLink', Icon: ExternalLink },
  { name: 'LogOut', Icon: LogOut },
  { name: 'FileText', Icon: FileText },
  { name: 'Database', Icon: Database },
  { name: 'Box', Icon: Box },
  { name: 'Layers', Icon: Layers },
  { name: 'Cpu', Icon: Cpu },
  { name: 'HardDrive', Icon: HardDrive },
  { name: 'Server', Icon: Server },
  { name: 'Cloud', Icon: Cloud },
  { name: 'Link', Icon: LinkIcon },
  { name: 'List', Icon: List },
  { name: 'Grid', Icon: Grid },
  { name: 'Trees', Icon: Trees },
  { name: 'User', Icon: User },
  { name: 'Users', Icon: Users },
  { name: 'Shield', Icon: Shield },
  { name: 'Bell', Icon: Bell },
  { name: 'Mail', Icon: Mail },
  { name: 'MessageSquare', Icon: MessageSquare },
  { name: 'Search', Icon: Search },
  { name: 'Filter', Icon: Filter },
  { name: 'Plus', Icon: Plus },
  { name: 'Edit', Icon: Edit },
  { name: 'Trash2', Icon: Trash2 },
  { name: 'Save', Icon: Save },
  { name: 'X', Icon: X },
  { name: 'Check', Icon: Check },
  { name: 'ChevronUp', Icon: ChevronUp },
  { name: 'ChevronDown', Icon: ChevronDown },
  { name: 'ChevronRight', Icon: ChevronRight },
  { name: 'ChevronLeft', Icon: ChevronLeft },
  { name: 'Circle', Icon: Circle },
  { name: 'Star', Icon: Star },
  { name: 'Heart', Icon: Heart },
  { name: 'Bookmark', Icon: Bookmark },
  { name: 'Flag', Icon: Flag },
];

const ICON_BY_NAME: Record<string, LucideIcon> = Object.fromEntries(
  ICONS.map((i) => [i.name, i.Icon])
);

interface IconPickerProps {
  value: string | null;
  onChange: (value: string | null) => void;
}

export function IconPicker({ value, onChange }: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const SelectedIcon = value ? ICON_BY_NAME[value] : null;
  const filtered = search
    ? ICONS.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()))
    : ICONS;

  function handleSelect(name: string | null) {
    onChange(name);
    setOpen(false);
    setSearch('');
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-foreground focus:outline-none focus:ring-1 focus:ring-accent-foreground"
      >
        {SelectedIcon ? (
          <>
            <SelectedIcon className="size-4 shrink-0 text-gray-700" />
            <span className="text-gray-900">{value}</span>
          </>
        ) : (
          <span className="text-gray-400">No icon</span>
        )}
      </button>
      {open && (
        <div className="absolute z-10 mt-1 w-80 rounded-md border border-gray-200 bg-white p-2 shadow-lg">
          <input
            type="text"
            placeholder="Search icons..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-2 w-full rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-accent-foreground focus:outline-none focus:ring-1 focus:ring-accent-foreground"
          />
          <div className="grid max-h-60 grid-cols-6 gap-1 overflow-y-auto">
            <button
              type="button"
              onClick={() => handleSelect(null)}
              className="flex flex-col items-center gap-1 rounded p-2 text-xs text-gray-500 hover:bg-gray-100"
            >
              <Circle className="size-4 opacity-30" />
              None
            </button>
            {filtered.map(({ name, Icon }) => (
              <button
                key={name}
                type="button"
                onClick={() => handleSelect(name)}
                className={`flex flex-col items-center gap-1 rounded p-2 text-xs hover:bg-gray-100 ${
                  value === name ? 'bg-accent text-accent-foreground' : 'text-gray-700'
                }`}
                title={name}
              >
                <Icon className="size-4" />
                <span className="truncate">{name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
