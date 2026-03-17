'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import {
  Plus, MoreHorizontal, User, MapPin, Clock, Stethoscope,
  Phone, Mail, Filter, Users, ChevronDown, Search, SlidersHorizontal
} from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { cn, formatRelativeTime } from '@/lib/utils';
import toast from 'react-hot-toast';

const STAGES = [
  { id: 'sourced',    label: 'Sourced',    color: '#6366f1', bg: 'bg-indigo-50',  border: 'border-indigo-200', text: 'text-indigo-700' },
  { id: 'contacted',  label: 'Contacted',  color: '#8b5cf6', bg: 'bg-violet-50',  border: 'border-violet-200', text: 'text-violet-700' },
  { id: 'interested', label: 'Interested', color: '#ec4899', bg: 'bg-pink-50',    border: 'border-pink-200',   text: 'text-pink-700' },
  { id: 'submitted',  label: 'Submitted',  color: '#f59e0b', bg: 'bg-amber-50',   border: 'border-amber-200',  text: 'text-amber-700' },
  { id: 'interview',  label: 'Interview',  color: '#3b82f6', bg: 'bg-blue-50',    border: 'border-blue-200',   text: 'text-blue-700' },
  { id: 'offer',      label: 'Offer',      color: '#10b981', bg: 'bg-emerald-50', border: 'border-emerald-200',text: 'text-emerald-700' },
  { id: 'placed',     label: 'Placed',     color: '#059669', bg: 'bg-green-50',   border: 'border-green-200',  text: 'text-green-700' },
];

export default function CandidatesKanbanPage() {
  const queryClient = useQueryClient();
  const [searchQ, setSearchQ] = useState('');

  const { data: pipeline = [], isLoading } = useQuery({
    queryKey: ['candidates', 'pipeline'],
    queryFn: () => api.get('/candidates/pipeline').then(r => r.data),
    refetchInterval: 30000,
  });

  const updateStageMutation = useMutation({
    mutationFn: ({ candidateId, stage }) => api.patch(`/candidates/${candidateId}/stage`, { stage }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['candidates', 'pipeline'] }),
    onError: () => toast.error('Failed to update stage'),
  });

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    const { draggableId, destination } = result;
    const newStage = destination.droppableId;

    updateStageMutation.mutate({ candidateId: draggableId, stage: newStage });

    // Optimistic update
    queryClient.setQueryData(['candidates', 'pipeline'], (old) => {
      if (!old) return old;
      return old.map(col => {
        if (col.stage === destination.droppableId) {
          const candidate = old.flatMap(c => c.candidates).find(c => c.id === draggableId);
          if (!candidate) return col;
          return { ...col, candidates: [...col.candidates, { ...candidate, pipeline_stage: newStage }] };
        }
        return {
          ...col,
          candidates: col.candidates.filter(c => c.id !== draggableId),
        };
      });
    });
  };

  const filteredPipeline = pipeline.map(col => ({
    ...col,
    candidates: searchQ
      ? col.candidates.filter(c =>
          `${c.firstName} ${c.lastName} ${c.specialty}`.toLowerCase().includes(searchQ.toLowerCase())
        )
      : col.candidates,
  }));

  const totalCandidates = pipeline.reduce((sum, col) => sum + col.count, 0);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 bg-white border-b border-slate-100 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Pipeline</h1>
          <p className="text-sm text-slate-400 mt-0.5">{totalCandidates} candidates total</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              placeholder="Filter candidates..."
              className="pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl 
                focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-300
                w-56 placeholder:text-slate-400"
            />
          </div>
          <Link
            href="/candidates/new"
            className="flex items-center gap-1.5 px-4 py-2 bg-brand-500 text-white text-sm font-medium 
              rounded-xl hover:bg-brand-600 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Add Candidate
          </Link>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-4">
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="flex gap-3 h-full" style={{ minWidth: `${STAGES.length * 280}px` }}>
            {STAGES.map((stage) => {
              const col = filteredPipeline.find(c => c.stage === stage.id) || { candidates: [], count: 0 };
              return (
                <KanbanColumn
                  key={stage.id}
                  stage={stage}
                  candidates={col.candidates}
                  totalCount={col.count}
                  isLoading={isLoading}
                />
              );
            })}
          </div>
        </DragDropContext>
      </div>
    </div>
  );
}

function KanbanColumn({ stage, candidates, totalCount, isLoading }) {
  return (
    <div className="flex flex-col w-[272px] flex-shrink-0 bg-slate-50 rounded-2xl overflow-hidden">
      {/* Column Header */}
      <div className="flex items-center justify-between px-3.5 py-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: stage.color }} />
          <span className="text-sm font-semibold text-slate-700">{stage.label}</span>
          <span className={cn(
            'text-xs font-bold px-1.5 py-0.5 rounded-full',
            stage.bg, stage.border, stage.text, 'border'
          )}>
            {totalCount}
          </span>
        </div>
        <button className="p-1 hover:bg-white hover:shadow-sm rounded-lg transition-all text-slate-400">
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Cards */}
      <Droppable droppableId={stage.id}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={cn(
              'flex-1 overflow-y-auto px-2 pb-2 space-y-2 min-h-0',
              snapshot.isDraggingOver && 'bg-brand-50/50'
            )}
          >
            {isLoading ? (
              [...Array(3)].map((_, i) => (
                <div key={i} className="h-24 bg-white rounded-xl animate-pulse shadow-sm" />
              ))
            ) : candidates.length === 0 ? (
              <div className="flex items-center justify-center h-20 text-xs text-slate-400">
                Drop candidates here
              </div>
            ) : (
              candidates.map((candidate, index) => (
                <Draggable key={candidate.id} draggableId={candidate.id} index={index}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      {...provided.dragHandleProps}
                    >
                      <CandidateCard candidate={candidate} isDragging={snapshot.isDragging} />
                    </div>
                  )}
                </Draggable>
              ))
            )}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
}

function CandidateCard({ candidate, isDragging }) {
  return (
    <motion.div
      layout
      className={cn(
        'bg-white rounded-xl p-3.5 shadow-sm border transition-all cursor-grab active:cursor-grabbing',
        isDragging
          ? 'border-brand-300 shadow-card-lg rotate-2 scale-105'
          : 'border-slate-100 hover:border-slate-200 hover:shadow-card'
      )}
    >
      {/* Name + Actions */}
      <div className="flex items-start justify-between mb-2">
        <Link href={`/candidates/${candidate.id}`} className="hover:text-brand-600 transition-colors">
          <p className="text-sm font-semibold text-slate-900 leading-tight">
            Dr. {candidate.firstName} {candidate.lastName}
          </p>
        </Link>
        <button className="p-0.5 hover:bg-slate-100 rounded-md transition-colors flex-shrink-0 ml-1">
          <MoreHorizontal className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      {/* Specialty */}
      {candidate.specialty && (
        <div className="flex items-center gap-1.5 mb-2">
          <Stethoscope className="w-3 h-3 text-slate-400 flex-shrink-0" />
          <span className="text-xs text-slate-500 truncate">{candidate.specialty}</span>
        </div>
      )}

      {/* Location */}
      {(candidate.state || candidate.city) && (
        <div className="flex items-center gap-1.5 mb-2">
          <MapPin className="w-3 h-3 text-slate-400 flex-shrink-0" />
          <span className="text-xs text-slate-500">
            {[candidate.city, candidate.state].filter(Boolean).join(', ')}
          </span>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 mt-2 border-t border-slate-100">
        {/* Assignee */}
        {candidate.assigneeFirst && (
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center">
              <span className="text-white text-[8px] font-bold">
                {candidate.assigneeFirst[0]}{candidate.assigneeLast?.[0]}
              </span>
            </div>
            <span className="text-[11px] text-slate-400">{candidate.assigneeFirst}</span>
          </div>
        )}

        {/* Last Activity */}
        {candidate.lastContactedAt && (
          <div className="flex items-center gap-1 ml-auto">
            <Clock className="w-3 h-3 text-slate-300" />
            <span className="text-[11px] text-slate-400">
              {formatRelativeTime(candidate.lastContactedAt)}
            </span>
          </div>
        )}
      </div>

      {/* Tags */}
      {candidate.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {candidate.tags.slice(0, 3).map((tag, i) => (
            <span key={i} className="text-[10px] px-1.5 py-0.5 bg-brand-50 text-brand-600 rounded-md font-medium">
              {tag}
            </span>
          ))}
        </div>
      )}
    </motion.div>
  );
}
