/**
 * History timeline types and configuration
 */

import type { ReactNode } from 'react';
import type { HistoryAction } from '@/lib/database.types';
import {
  PartyPopper,
  RefreshCw,
  MapPin,
  DollarSign,
  Building2,
  Undo2,
  FileText,
  Paperclip,
  Tag,
  Trash2,
} from 'lucide-react';
import { createElement } from 'react';

export interface EditionHistory {
  id: string;
  edition_id: string;
  action: HistoryAction;
  from_status: string | null;
  to_status: string | null;
  from_location: string | null;
  to_location: string | null;
  related_party: string | null;
  price: number | null;
  currency: string | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
}

export interface HistoryTimelineProps {
  history: EditionHistory[];
  editionId: string;
  onAddNote?: (note: string) => void;
  showAddNoteButton?: boolean;
  onHistoryAdded?: (history: EditionHistory) => void;
  defaultLimit?: number;
}

export interface MergedHistoryItem {
  type: 'single' | 'merged';
  items: EditionHistory[];
  action: HistoryAction;
  date: string; // YYYY-MM-DD
}

export interface ActionConfig {
  icon: ReactNode;
  color: string;
  bgColor: string;
  importance: 'high' | 'medium' | 'low';
}

// Helper to create icon elements
const icon = (Icon: typeof PartyPopper, className: string) =>
  createElement(Icon, { className });

// Action type configuration (labels handled via i18n)
export const ACTION_CONFIG: Record<HistoryAction, ActionConfig> = {
  created: {
    icon: icon(PartyPopper, 'w-4 h-4'),
    color: 'text-status-available',
    bgColor: 'bg-status-available/20',
    importance: 'high',
  },
  status_change: {
    icon: icon(RefreshCw, 'w-4 h-4'),
    color: 'text-status-transit',
    bgColor: 'bg-status-transit/20',
    importance: 'high',
  },
  location_change: {
    icon: icon(MapPin, 'w-4 h-4'),
    color: 'text-status-production',
    bgColor: 'bg-status-production/20',
    importance: 'high',
  },
  sold: {
    icon: icon(DollarSign, 'w-4 h-4'),
    color: 'text-status-sold',
    bgColor: 'bg-status-sold/20',
    importance: 'high',
  },
  consigned: {
    icon: icon(Building2, 'w-4 h-4'),
    color: 'text-status-consigned',
    bgColor: 'bg-status-consigned/20',
    importance: 'high',
  },
  returned: {
    icon: icon(Undo2, 'w-4 h-4'),
    color: 'text-status-inactive',
    bgColor: 'bg-status-inactive/20',
    importance: 'medium',
  },
  condition_update: {
    icon: icon(FileText, 'w-4 h-4'),
    color: 'text-status-consigned',
    bgColor: 'bg-status-consigned/20',
    importance: 'medium',
  },
  file_added: {
    icon: icon(Paperclip, 'w-4 h-4'),
    color: 'text-accent-blue',
    bgColor: 'bg-accent-blue/20',
    importance: 'low',
  },
  file_deleted: {
    icon: icon(Trash2, 'w-4 h-4'),
    color: 'text-status-sold',
    bgColor: 'bg-status-sold/20',
    importance: 'low',
  },
  number_assigned: {
    icon: icon(Tag, 'w-4 h-4'),
    color: 'text-status-production',
    bgColor: 'bg-status-production/20',
    importance: 'medium',
  },
};

// Actions that can be merged when consecutive on the same day
export const MERGABLE_ACTIONS: HistoryAction[] = [
  'file_added',
  'file_deleted',
  'condition_update',
];
