'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  Sparkles,
  Send,
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Dumbbell,
  Apple,
  Clock,
  ShieldCheck,
} from 'lucide-react';

interface ActionConfirmationDetails {
  pending_action?: boolean;
  action_type?: string;
  details?: {
    from?: string;
    to?: string;
    grams?: number;
    difference_grams?: number;
  };
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  safety_flags?: string[];
  requires_confirmation?: boolean;
  confirmation_token?: string;
  confirmation_details?: ActionConfirmationDetails;
  confirmed?: boolean;
  cancelled?: boolean;
  timestamp: string;
}

const QUICK_PROMPTS = [
  'O que tenho para comer no almoço hoje?',
  'Qual é o meu treino programado para hoje?',
  'Não tenho frango hoje, quais são as opções de substituição?',
  'Estou com muita fome entre o almoço e o jantar.',
  'Quantas séries tenho para peito esta semana?',
];

const INITIAL_WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome-1',
  role: 'assistant',
  content:
    'Olá! Sou o seu AI Companion do AppNutri. Estou aqui para te ajudar a entender seu plano alimentar, organizar seu treino de hoje, tirar dúvidas sobre calorias e propor substituições autorizadas. Como posso te apoiar hoje?',
  timestamp: 'Agora',
};

export default function PatientAssistantPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [rateLimitError, setRateLimitError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageCounterRef = useRef(1);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSendMessage = async (textToSend?: string) => {
    const messageText = (textToSend ?? input).trim();
    if (!messageText || loading) return;

    setRateLimitError(null);
    setInput('');

    const currentCounter = ++messageCounterRef.current;
    const userMessage: ChatMessage = {
      id: `user-${currentCounter}`,
      role: 'user',
      content: messageText,
      timestamp: 'Agora',
    };

    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);

    try {
      const res = await fetch('/api/ai/companion/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageText,
          conversation_id: conversationId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 400 && data.details) {
          setRateLimitError('Mensagem inválida. Por favor, verifique o texto enviado.');
        } else {
          setRateLimitError(data.error ?? 'Falha temporária ao se comunicar com o assistente.');
        }
        return;
      }

      if (data.conversation_id && !conversationId) {
        setConversationId(data.conversation_id);
      }

      const assistantMessage: ChatMessage = {
        id: `assistant-${++messageCounterRef.current}`,
        role: 'assistant',
        content: data.content,
        safety_flags: data.safety_flags,
        requires_confirmation: data.requires_confirmation,
        confirmation_token: data.confirmation_token,
        confirmation_details: data.confirmation_details,
        timestamp: 'Agora',
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch {
      setRateLimitError('Erro de conexão com o servidor. Tente novamente em instantes.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmAction = async (msgId: string, token: string, decision: 'confirm' | 'cancel') => {
    try {
      const res = await fetch('/api/ai/companion/confirm-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: conversationId,
          confirmation_token: token,
          decision,
        }),
      });

      await res.json();

      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id === msgId) {
            return {
              ...msg,
              requires_confirmation: false,
              confirmed: decision === 'confirm',
              cancelled: decision === 'cancel',
            };
          }
          return msg;
        })
      );

      // Adiciona mensagem de confirmação do assistente
      const feedbackMsg: ChatMessage = {
        id: `feedback-${msgId}`,
        role: 'assistant',
        content:
          decision === 'confirm'
            ? 'Pronto! A substituição foi confirmada e aplicada com sucesso ao seu plano alimentar ativo.'
            : 'Ação cancelada. O seu plano alimentar permanece inalterado.',
        timestamp: 'Agora',
      };

      setMessages((prev) => [...prev, feedbackMsg]);
    } catch {
      alert('Falha ao processar confirmação. Tente novamente.');
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-50">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-slate-900/50 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <Link
            href="/patient"
            className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Sparkles className="w-5 h-5 text-slate-950" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-semibold text-slate-100">AI Companion</h1>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <ShieldCheck className="w-3 h-3" /> Contexto seguro
                </span>
              </div>
              <p className="text-xs text-slate-400">Contexto oficial do seu plano e treino</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/patient/nutrition/plan"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors"
          >
            <Apple className="w-3.5 h-3.5 text-emerald-400" /> Plano Alimentar
          </Link>
          <Link
            href="/patient/workout"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors"
          >
            <Dumbbell className="w-3.5 h-3.5 text-blue-400" /> Treino Ativo
          </Link>
        </div>
      </header>

      {/* Main Chat Feed */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            const isEmergency = msg.safety_flags?.includes('medical_emergency');
            const isClinical = msg.safety_flags?.includes('symptom_not_diagnosis');

            return (
              <div
                key={msg.id}
                className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                {!isUser && (
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0 mt-1">
                    <Sparkles className="w-4 h-4 text-emerald-400" />
                  </div>
                )}

                <div className={`max-w-[85%] sm:max-w-[75%] space-y-3`}>
                  {/* Safety Alert Banner */}
                  {(isEmergency || isClinical) && (
                    <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-200 text-xs flex gap-2.5 items-start">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold block text-amber-300 mb-0.5">
                          {isEmergency ? 'Atenção Médica Imediata' : 'Princípio: Sintoma não é Diagnóstico'}
                        </span>
                        <span>
                          {isEmergency
                            ? 'O AI Companion não substitui atendimento médico de urgência.'
                            : 'Avaliações de dores e sintomas clínicos devem ser realizadas presencialmente por profissional habilitado.'}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Message Bubble */}
                  <div
                    className={`p-4 rounded-2xl text-sm leading-relaxed ${
                      isUser
                        ? 'bg-emerald-600 text-white rounded-br-none shadow-md shadow-emerald-600/10'
                        : 'bg-slate-900/90 border border-slate-800/80 text-slate-200 rounded-bl-none'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    <span
                      className={`text-[10px] mt-2 block text-right ${
                        isUser ? 'text-emerald-200/70' : 'text-slate-500'
                      }`}
                    >
                      {msg.timestamp}
                    </span>
                  </div>

                  {/* Interactive Confirmation Action Card */}
                  {msg.requires_confirmation && msg.confirmation_token && !msg.confirmed && !msg.cancelled && (
                    <div className="p-4 rounded-xl border border-teal-500/30 bg-slate-900/90 shadow-xl space-y-3">
                      <div className="flex items-center gap-2 text-teal-400 font-medium text-xs">
                        <Clock className="w-4 h-4" />
                        <span>Confirmação Explícita Obrigatória</span>
                      </div>
                      <p className="text-xs text-slate-300">
                        O assistente não altera seus dados sem sua autorização expressa. Deseja aplicar esta substituição no seu plano?
                      </p>
                      {msg.confirmation_details?.details && (
                        <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs space-y-1">
                          <div className="text-slate-400">De: <span className="text-slate-200 font-medium">{msg.confirmation_details.details.from}</span></div>
                          <div className="text-emerald-400">Para: <span className="text-white font-medium">{msg.confirmation_details.details.to}</span></div>
                        </div>
                      )}
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => handleConfirmAction(msg.id, msg.confirmation_token!, 'confirm')}
                          className="flex-1 py-2 px-3 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-600/20"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Confirmar Troca
                        </button>
                        <button
                          onClick={() => handleConfirmAction(msg.id, msg.confirmation_token!, 'cancel')}
                          className="py-2 px-3 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors flex items-center justify-center gap-1.5"
                        >
                          <XCircle className="w-3.5 h-3.5" /> Cancelar
                        </button>
                      </div>
                    </div>
                  )}

                  {msg.confirmed && (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Ação Confirmada pelo Usuário
                    </div>
                  )}

                  {msg.cancelled && (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium bg-slate-800 text-slate-400">
                      <XCircle className="w-3.5 h-3.5" /> Ação Cancelada
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {loading && (
            <div className="flex gap-3 justify-start items-center">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-emerald-400 animate-pulse" />
              </div>
              <div className="bg-slate-900/80 border border-slate-800 px-4 py-3 rounded-2xl rounded-bl-none flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" />
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce [animation-delay:0.2s]" />
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce [animation-delay:0.4s]" />
                <span className="text-xs text-slate-400 ml-1">Consultando motores autorizados...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Quick Prompts Bar (se poucas mensagens) */}
      {messages.length <= 3 && (
        <div className="px-4 py-2 border-t border-slate-900 bg-slate-950/80 overflow-x-auto">
          <div className="max-w-3xl mx-auto flex gap-2">
            {QUICK_PROMPTS.map((prompt, idx) => (
              <button
                key={idx}
                onClick={() => handleSendMessage(prompt)}
                disabled={loading}
                className="whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors shrink-0"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Form Footer */}
      <footer className="p-4 sm:p-6 border-t border-slate-800/80 bg-slate-900/50 backdrop-blur-md">
        <div className="max-w-3xl mx-auto space-y-2">
          {rateLimitError && (
            <div className="text-xs text-amber-400 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{rateLimitError}</span>
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Pergunte sobre seu plano, substituições ou treino..."
              maxLength={1000}
              disabled={loading}
              className="flex-1 px-4 py-3 rounded-xl bg-slate-900 border border-slate-800 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="p-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-emerald-600/20 shrink-0"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
          <div className="flex justify-between text-[11px] text-slate-500 px-1">
            <span>AI Companion seguro • Autoridade clínica dos motores do sistema</span>
            <span>{input.length}/1000</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
