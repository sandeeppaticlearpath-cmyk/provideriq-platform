'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send, Zap, Mail, FileText, BarChart3, Sparkles, Copy,
  RotateCcw, ChevronDown, User, Bot, X, Check,
  PlusCircle, Lightbulb
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

const QUICK_ACTIONS = [
  {
    label: 'Write outreach email',
    icon: Mail,
    prompt: 'Write a compelling initial outreach email to a Hospitalist physician in Texas for a locum tenens opportunity.',
    color: 'brand',
  },
  {
    label: 'Score candidate fit',
    icon: BarChart3,
    prompt: 'How do I evaluate if a Cardiologist is a strong fit for a locum tenens position at a community hospital?',
    color: 'violet',
  },
  {
    label: 'Create follow-up sequence',
    icon: Zap,
    prompt: 'Create a 3-email follow-up sequence for physicians who haven\'t responded to my initial outreach.',
    color: 'amber',
  },
  {
    label: 'Sourcing strategy',
    icon: Lightbulb,
    prompt: 'What are the best strategies for sourcing Emergency Medicine physicians in rural markets?',
    color: 'emerald',
  },
];

export default function AIAssistantPage() {
  const [messages, setMessages] = useState([
    {
      id: '1',
      role: 'assistant',
      content: "Hi! I'm your ProviderIQ AI assistant. I specialize in healthcare staffing intelligence — I can help you write outreach emails, score candidate matches, develop sourcing strategies, and much more. What can I help you with today?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (content = input) => {
    if (!content.trim() || isStreaming) return;

    const userMsg = {
      id: Date.now().toString(),
      role: 'user',
      content: content.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsStreaming(true);

    // Add streaming assistant message
    const assistantMsgId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      streaming: true,
    }]);

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
        body: JSON.stringify({
          messages: messages.concat(userMsg).map(m => ({ role: m.role, content: m.content })),
        }),
      });

      if (!response.ok) throw new Error('AI request failed');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(l => l.startsWith('data: '));

        for (const line of lines) {
          const data = line.slice(6);
          if (data === '[DONE]') break;
          try {
            const { content: delta } = JSON.parse(data);
            accumulated += delta;
            setMessages(prev => prev.map(m =>
              m.id === assistantMsgId ? { ...m, content: accumulated } : m
            ));
          } catch {}
        }
      }

      setMessages(prev => prev.map(m =>
        m.id === assistantMsgId ? { ...m, streaming: false } : m
      ));
    } catch (error) {
      setMessages(prev => prev.map(m =>
        m.id === assistantMsgId ? {
          ...m,
          content: "I encountered an error. Please try again.",
          streaming: false,
          error: true,
        } : m
      ));
    } finally {
      setIsStreaming(false);
    }
  };

  const copyMessage = (id, content) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast.success('Copied to clipboard');
  };

  const clearChat = () => {
    setMessages([{
      id: 'fresh',
      role: 'assistant',
      content: "Chat cleared. How can I help you today?",
      timestamp: new Date(),
    }]);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-100 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-brand-600 flex items-center justify-center shadow-sm">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-slate-900">AI Recruiting Assistant</h1>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse-soft" />
              <span className="text-xs text-slate-400">Powered by GPT-4o</span>
            </div>
          </div>
        </div>
        <button
          onClick={clearChat}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-500 
            hover:bg-slate-100 rounded-xl transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Clear chat
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Quick Actions (shown when only initial message) */}
        {messages.length === 1 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-2 gap-2 max-w-2xl mx-auto"
          >
            {QUICK_ACTIONS.map((action) => {
              const Icon = action.icon;
              const colorMap = {
                brand: 'bg-brand-50 border-brand-100 hover:border-brand-200 text-brand-700',
                violet: 'bg-violet-50 border-violet-100 hover:border-violet-200 text-violet-700',
                amber: 'bg-amber-50 border-amber-100 hover:border-amber-200 text-amber-700',
                emerald: 'bg-emerald-50 border-emerald-100 hover:border-emerald-200 text-emerald-700',
              };
              return (
                <button
                  key={action.label}
                  onClick={() => sendMessage(action.prompt)}
                  className={cn(
                    'flex items-center gap-3 p-4 rounded-xl border text-left transition-all',
                    colorMap[action.color]
                  )}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  <span className="text-sm font-medium">{action.label}</span>
                </button>
              );
            })}
          </motion.div>
        )}

        <AnimatePresence>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className={cn(
                'flex gap-3 max-w-3xl',
                message.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'
              )}
            >
              {/* Avatar */}
              <div className={cn(
                'w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm',
                message.role === 'user'
                  ? 'bg-brand-500'
                  : 'bg-gradient-to-br from-violet-500 to-brand-600'
              )}>
                {message.role === 'user'
                  ? <User className="w-4 h-4 text-white" />
                  : <Zap className="w-4 h-4 text-white" />
                }
              </div>

              {/* Content */}
              <div className={cn(
                'group relative max-w-[560px]',
                message.role === 'user' ? 'text-right' : ''
              )}>
                <div className={cn(
                  'px-4 py-3 rounded-2xl text-sm leading-relaxed',
                  message.role === 'user'
                    ? 'bg-brand-500 text-white rounded-tr-sm'
                    : cn(
                        'bg-white border border-slate-100 text-slate-700 rounded-tl-sm shadow-card',
                        message.error && 'border-rose-200 bg-rose-50 text-rose-700'
                      )
                )}>
                  {message.streaming && !message.content ? (
                    <div className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  ) : (
                    <MessageContent content={message.content} />
                  )}
                  {message.streaming && message.content && (
                    <span className="inline-block w-0.5 h-4 bg-brand-500 ml-0.5 animate-pulse" />
                  )}
                </div>

                {/* Copy Button */}
                {!message.streaming && message.role === 'assistant' && (
                  <button
                    onClick={() => copyMessage(message.id, message.content)}
                    className="absolute -right-8 top-2 opacity-0 group-hover:opacity-100 transition-opacity
                      p-1.5 hover:bg-slate-100 rounded-lg text-slate-400"
                  >
                    {copiedId === message.id
                      ? <Check className="w-3.5 h-3.5 text-emerald-500" />
                      : <Copy className="w-3.5 h-3.5" />
                    }
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 pb-4 flex-shrink-0">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-end gap-2 bg-white border border-slate-200 rounded-2xl shadow-card p-2
            focus-within:ring-2 focus-within:ring-brand-500/20 focus-within:border-brand-300 transition-all">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Ask me anything about recruiting, sourcing, or your candidates..."
              rows={1}
              className="flex-1 resize-none bg-transparent text-sm text-slate-800 placeholder:text-slate-400
                focus:outline-none px-2 py-1.5 max-h-32"
              style={{ minHeight: '36px' }}
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || isStreaming}
              className={cn(
                'flex items-center justify-center w-9 h-9 rounded-xl transition-all flex-shrink-0',
                input.trim() && !isStreaming
                  ? 'bg-brand-500 text-white hover:bg-brand-600 shadow-sm'
                  : 'bg-slate-100 text-slate-300 cursor-not-allowed'
              )}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[11px] text-slate-400 text-center mt-2">
            AI Assistant · Responses may not always be accurate · Review before sending
          </p>
        </div>
      </div>
    </div>
  );
}

function MessageContent({ content }) {
  // Simple markdown-like rendering
  const lines = content.split('\n');
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        if (line.startsWith('**') && line.endsWith('**')) {
          return <p key={i} className="font-semibold">{line.slice(2, -2)}</p>;
        }
        if (line.startsWith('- ') || line.startsWith('• ')) {
          return <p key={i} className="flex gap-2"><span>•</span><span>{line.slice(2)}</span></p>;
        }
        if (line === '') return <div key={i} className="h-1" />;
        return <p key={i}>{line}</p>;
      })}
    </div>
  );
}
