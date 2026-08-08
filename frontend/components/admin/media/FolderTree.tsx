'use client';

import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Folder as FolderIcon,
  FolderOpen as FolderOpenIcon,
  Plus,
  Pencil,
  Trash2,
  X,
} from 'lucide-react';
import {
  buildFolderTree,
  createFolder,
  renameFolder,
  deleteFolder,
  type Folder,
  type FolderNode,
} from '@/lib/clientFolders';

export type FolderSelection = 'all' | 'unfiled' | number;

interface FolderTreeProps {
  folders: Folder[];
  selectedId: FolderSelection;
  onSelect: (id: FolderSelection) => void;
  onRefresh: () => void;
  onToast: (message: string) => void;
}

export function FolderTree({ folders, selectedId, onSelect, onRefresh, onToast }: FolderTreeProps) {
  const tree = buildFolderTree(folders);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [creatingIn, setCreatingIn] = useState<number | null | 'root'>(null);
  const [newName, setNewName] = useState('');

  async function handleCreate(parentId: number | null, name: string) {
    try {
      await createFolder(name, parentId);
      setCreatingIn(null);
      setNewName('');
      onRefresh();
    } catch (e) {
      onToast((e as Error).message);
    }
  }

  async function handleRename(id: number, name: string) {
    try {
      await renameFolder(id, name);
      setRenamingId(null);
      setRenameValue('');
      onRefresh();
    } catch (e) {
      onToast((e as Error).message);
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm('Delete this folder? Only empty folders can be deleted.')) return;
    try {
      await deleteFolder(id);
      if (selectedId === id) onSelect('all');
      onRefresh();
    } catch (e) {
      onToast((e as Error).message);
    }
  }

  return (
    <div className="space-y-1 text-sm">
      {/* Virtual nodes */}
      <TreeRow
        label="All Files"
        icon={<FolderIcon className="w-4 h-4 text-accent-foreground" />}
        active={selectedId === 'all'}
        onClick={() => onSelect('all')}
      />
      <TreeRow
        label="Unfiled"
        icon={<FolderIcon className="w-4 h-4 text-gray-400" />}
        active={selectedId === 'unfiled'}
        onClick={() => onSelect('unfiled')}
      />

      <div className="flex items-center justify-between px-2 pt-3 pb-1 text-xs text-gray-500 uppercase">
        <span>Folders</span>
        <button
          onClick={() => setCreatingIn('root')}
          title="New top-level folder"
          className="p-0.5 hover:bg-gray-100 rounded"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {creatingIn === 'root' && (
        <NewFolderInput
          onCancel={() => setCreatingIn(null)}
          onCreate={(name) => handleCreate(null, name)}
          value={newName}
          setValue={setNewName}
        />
      )}

      {tree.map((node) => (
        <FolderNodeRow
          key={node.id}
          node={node}
          depth={0}
          selectedId={selectedId}
          onSelect={onSelect}
          renamingId={renamingId}
          renameValue={renameValue}
          setRenamingId={setRenamingId}
          setRenameValue={setRenameValue}
          onRename={handleRename}
          onDelete={handleDelete}
          onCreate={handleCreate}
          creatingIn={creatingIn}
          setCreatingIn={setCreatingIn}
          newName={newName}
          setNewName={setNewName}
        />
      ))}
    </div>
  );
}

interface FolderNodeRowProps {
  node: FolderNode;
  depth: number;
  selectedId: FolderSelection;
  onSelect: (id: FolderSelection) => void;
  renamingId: number | null;
  renameValue: string;
  setRenamingId: (id: number | null) => void;
  setRenameValue: (v: string) => void;
  onRename: (id: number, name: string) => void;
  onDelete: (id: number) => void;
  onCreate: (parentId: number, name: string) => void;
  creatingIn: number | null | 'root';
  setCreatingIn: (id: number | null) => void;
  newName: string;
  setNewName: (v: string) => void;
}

function FolderNodeRow(props: FolderNodeRowProps) {
  const {
    node,
    depth,
    selectedId,
    onSelect,
    renamingId,
    renameValue,
    setRenamingId,
    setRenameValue,
    onRename,
    onDelete,
    onCreate,
    creatingIn,
    setCreatingIn,
    newName,
    setNewName,
  } = props;
  const [expanded, setExpanded] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const isSelected = selectedId === node.id;

  return (
    <div>
      <div
        className="group flex items-center gap-1 px-2 py-1 rounded cursor-pointer hover:bg-gray-100"
        style={{ paddingLeft: depth * 12 + 8 }}
        onClick={() => onSelect(node.id)}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenuOpen(true);
        }}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
          className="p-0.5 hover:bg-gray-200 rounded"
        >
          {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </button>
        {isSelected ? (
          <FolderOpenIcon className="w-4 h-4 text-accent-foreground" />
        ) : (
          <FolderIcon className="w-4 h-4 text-gray-500" />
        )}
        {renamingId === node.id ? (
          <input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={() => onRename(node.id, renameValue)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onRename(node.id, renameValue);
              if (e.key === 'Escape') setRenamingId(null);
            }}
            className="flex-1 px-1 py-0.5 text-sm border border-accent-foreground/60 rounded outline-none"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className={`flex-1 truncate ${isSelected ? 'font-medium text-accent-foreground' : ''}`}>
            {node.name}
          </span>
        )}
        <span className="text-xs text-gray-400">{node.upload_count}</span>
      </div>

      {menuOpen && (
        <div
          className="fixed inset-0 z-50"
          onClick={() => setMenuOpen(false)}
        >
          <div
            className="absolute bg-white border border-gray-200 rounded shadow-lg py-1 text-sm"
            style={{
              left: '40%',
              top: '40%',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                setCreatingIn(node.id);
                setExpanded(true);
                setMenuOpen(false);
              }}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-gray-100"
            >
              <Plus className="w-3.5 h-3.5" /> New Subfolder
            </button>
            <button
              onClick={() => {
                setRenamingId(node.id);
                setRenameValue(node.name);
                setMenuOpen(false);
              }}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-gray-100"
            >
              <Pencil className="w-3.5 h-3.5" /> Rename
            </button>
            <button
              onClick={() => {
                setMenuOpen(false);
                onDelete(node.id);
              }}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-red-600 hover:bg-red-50"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          </div>
        </div>
      )}

      {expanded && creatingIn === node.id && (
        <NewFolderInput
          depth={depth + 1}
          onCancel={() => setCreatingIn(null)}
          onCreate={(name) => onCreate(node.id, name)}
          value={newName}
          setValue={setNewName}
        />
      )}

      {expanded &&
        node.children.map((child) => (
          <FolderNodeRow key={child.id} {...props} node={child} depth={depth + 1} />
        ))}
    </div>
  );
}

interface NewFolderInputProps {
  depth?: number;
  value: string;
  setValue: (v: string) => void;
  onCancel: () => void;
  onCreate: (name: string) => void;
}

function NewFolderInput({ depth = 0, value, setValue, onCancel, onCreate }: NewFolderInputProps) {
  return (
    <div
      className="flex items-center gap-1 px-2 py-1"
      style={{ paddingLeft: depth * 12 + 8 }}
    >
      <FolderIcon className="w-4 h-4 text-gray-400" />
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={onCancel}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && value.trim()) onCreate(value.trim());
          if (e.key === 'Escape') onCancel();
        }}
        placeholder="Folder name"
        className="flex-1 px-1 py-0.5 text-sm border border-accent-foreground/60 rounded outline-none"
      />
      <button
        onClick={() => value.trim() && onCreate(value.trim())}
        className="p-0.5 text-accent-foreground hover:bg-accent rounded"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
      <button onClick={onCancel} className="p-0.5 text-gray-500 hover:bg-gray-100 rounded">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

interface TreeRowProps {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}

function TreeRow({ label, icon, active, onClick }: TreeRowProps) {
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-gray-100 ${
        active ? 'bg-accent text-accent-foreground font-medium' : ''
      }`}
    >
      {icon}
      <span className="flex-1">{label}</span>
    </div>
  );
}
