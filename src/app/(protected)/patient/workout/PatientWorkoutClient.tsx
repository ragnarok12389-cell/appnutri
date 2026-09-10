'use client';

import React, { useState } from 'react';
import {
  WorkoutProgram,
  WorkoutProgramDay,
  WorkoutExercisePrescription,
  ExerciseSubstitutionOption,
} from '@/types/workout-engine';
import {
  logWorkoutExecutionAction,
  getExerciseSubstitutionsAction,
} from '@/app/actions/workout-program';
import {
  Calendar,
  Dumbbell,
  Timer,
  CheckCircle2,
  RefreshCw,
  TrendingUp,
  Activity,
} from 'lucide-react';

interface Props {
  initialProgram: WorkoutProgram | null;
  patientId: string;
}

const OBJECTIVE_LABELS: Record<string, string> = {
  hypertrophy: 'Ganho de massa muscular',
  general_fitness: 'Condicionamento geral',
  strength_foundation: 'Base de força',
  weight_loss_support: 'Apoio à perda de peso',
  conditioning_foundation: 'Base de condicionamento',
};

const EXPERIENCE_LABELS: Record<string, string> = {
  beginner: 'Iniciante',
  intermediate: 'Intermediário',
  advanced: 'Avançado',
};

const MOVEMENT_LABELS: Record<string, string> = {
  squat: 'Agachamento', hinge: 'Quadril', push_horizontal: 'Empurrar horizontal',
  push_vertical: 'Empurrar vertical', pull_horizontal: 'Puxar horizontal',
  pull_vertical: 'Puxar vertical', lunge: 'Avanço', carry: 'Transporte',
  core: 'Centro do corpo', isolation: 'Isolamento',
};

const EQUIPMENT_LABELS: Record<string, string> = {
  barbell: 'barra', dumbbell: 'halter', cable: 'cabo', machine: 'máquina',
  bodyweight: 'peso corporal', bench: 'banco', pull_up_bar: 'barra fixa',
  resistance_band: 'faixa elástica',
};

function sessionNameInPortuguese(name: string): string {
  return name
    .replace('Upper A - Foco Horizontal', 'Parte superior — foco horizontal')
    .replace('Upper B - Foco Vertical', 'Parte superior — foco vertical')
    .replace('Lower A - Foco Quadríceps', 'Parte inferior — foco em quadríceps')
    .replace('Lower B - Foco Posterior', 'Parte inferior — foco posterior');
}

export function PatientWorkoutClient({ initialProgram, patientId }: Props) {
  const [program] = useState<WorkoutProgram | null>(initialProgram);
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(0);
  const [activeExercise, setActiveExercise] = useState<WorkoutExercisePrescription | null>(null);
  const [substitutionOptions, setSubstitutionOptions] = useState<ExerciseSubstitutionOption[]>([]);
  const [isLoadingSubstitutions, setIsLoadingSubstitutions] = useState<boolean>(false);

  // Estado para registro de execução (Log)
  const [loggingExercise, setLoggingExercise] = useState<WorkoutExercisePrescription | null>(null);
  const [logForm, setLogForm] = useState({
    set_number: 1,
    weight_kg: 20,
    reps_completed: 10,
    actual_rir: 2,
  });
  const [isSubmittingLog, setIsSubmittingLog] = useState<boolean>(false);
  const [logFeedback, setLogFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Timer de descanso
  const [timerSeconds, setTimerSeconds] = useState<number | null>(null);

  if (!program) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 text-center max-w-2xl mx-auto">
        <Dumbbell className="w-14 h-14 text-slate-300 mx-auto mb-4 animate-pulse" />
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Nenhum Programa de Treino Ativo</h2>
        <p className="text-slate-500 mb-6 leading-relaxed">
          Seu programa determinístico de treinamento está em fase de cálculo ou aguardando liberação.
          Assim que for aprovado, sua rotina semanal completa estará disponível aqui.
        </p>
      </div>
    );
  }

  const currentDay: WorkoutProgramDay | undefined = program.days[selectedDayIndex];
  const currentSession = currentDay?.sessions[0];

  function startRestTimer(seconds: number) {
    setTimerSeconds(seconds);
  }

  async function handleOpenSubstitutions(exercise: WorkoutExercisePrescription) {
    setActiveExercise(exercise);
    setIsLoadingSubstitutions(true);
    setSubstitutionOptions([]);
    try {
      const res = await getExerciseSubstitutionsAction(exercise.exercise_id);
      if (res.data) {
        setSubstitutionOptions(res.data);
      }
    } finally {
      setIsLoadingSubstitutions(false);
    }
  }

  async function handleSubmitLog(e: React.FormEvent) {
    e.preventDefault();
    if (!loggingExercise) return;
    setIsSubmittingLog(true);
    setLogFeedback(null);
    try {
      const res = await logWorkoutExecutionAction(patientId, {
        exercise_id: loggingExercise.exercise_id,
        set_number: Number(logForm.set_number),
        weight_kg: Number(logForm.weight_kg),
        reps_completed: Number(logForm.reps_completed),
        actual_rir: Number(logForm.actual_rir),
      });

      if (res.error) {
        setLogFeedback({ message: res.error, type: 'error' });
      } else {
        const prog = res.data?.progression_event;
        const msg = prog
          ? `Série registrada com sucesso! 🚀 RECOMENDAÇÃO: Subir carga para ${prog.recommended_weight_kg}kg (+${prog.recommended_increment_kg}kg)!`
          : `Série ${logForm.set_number} registrada com sucesso!`;
        setLogFeedback({ message: msg, type: 'success' });
        setLogForm((prev) => ({ ...prev, set_number: prev.set_number + 1 }));
      }
    } finally {
      setIsSubmittingLog(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header do Programa */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white rounded-3xl p-6 sm:p-8 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-400/20">
              <Activity className="w-3.5 h-3.5" />
              Motor Versionado {program.engine_version}
            </span>
            <h1 className="text-2xl sm:text-3xl font-black mt-2 tracking-tight">
              Programa de Treino Personalizado
            </h1>
            <p className="text-slate-300 text-sm mt-1">
              Objetivo: <strong className="text-white">{OBJECTIVE_LABELS[program.objective] || program.objective}</strong> •{' '}
              Nível: <strong className="text-white">{EXPERIENCE_LABELS[program.experience_level] || program.experience_level}</strong> •{' '}
              Frequência: <strong className="text-white">{program.sessions_per_week} sessões/semana</strong>
            </p>
          </div>

          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3 px-4 border border-white/10 flex items-center gap-3">
            <TrendingUp className="w-8 h-8 text-emerald-400" />
            <div>
              <div className="text-xs text-slate-300 font-medium">Status do programa</div>
              <div className="text-sm font-bold text-emerald-300 uppercase tracking-wide">
                {program.approval_status === 'approved' ? 'Liberado' : program.approval_status}
              </div>
            </div>
          </div>
        </div>

        {/* Seletor Semanal de Dias */}
        <div className="grid grid-cols-7 gap-2 mt-6">
          {program.days.map((day, idx) => {
            const isSelected = idx === selectedDayIndex;
            return (
              <button
                key={day.day_of_week}
                onClick={() => {
                  setSelectedDayIndex(idx);
                  setLoggingExercise(null);
                  setLogFeedback(null);
                }}
                className={`py-3 px-1 sm:px-2 rounded-2xl text-center transition-all duration-200 ${
                  isSelected
                    ? 'bg-indigo-500 text-white font-bold shadow-lg shadow-indigo-500/30 scale-105'
                    : day.is_rest_day
                    ? 'bg-white/5 text-slate-400 hover:bg-white/10'
                    : 'bg-white/15 text-slate-200 hover:bg-white/25 font-semibold'
                }`}
              >
                <div className="text-[10px] uppercase tracking-wider">{day.day_label.substring(0, 3)}</div>
                <div className="text-xs mt-0.5">
                  {day.is_rest_day ? 'Descanso' : 'Treino'}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Conteúdo do Dia Selecionado */}
      {currentDay?.is_rest_day ? (
        <div className="bg-white rounded-3xl p-8 border border-slate-100 text-center shadow-sm">
          <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-xl font-bold text-slate-800">Dia de Recuperação e Supercompensação</h3>
          <p className="text-slate-500 text-sm mt-1 max-w-md mx-auto">
            O descanso estruturado é fundamental para o reparo miofibrilar e a restauração dos estoques de glicogênio muscular.
          </p>
        </div>
      ) : currentSession ? (
        <div className="space-y-6">
          {/* Card de Visão Geral da Sessão */}
          <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-indigo-600">
                Foco da Sessão
              </div>
              <h2 className="text-xl font-bold text-slate-900 mt-0.5">{sessionNameInPortuguese(currentSession.name)}</h2>
              <div className="text-sm text-slate-500 mt-1 flex items-center gap-4">
                <span>⏱️ Duração estimada: {currentSession.estimated_duration_minutes} min</span>
                <span>🏋️ Total: {currentSession.exercises.length} exercícios</span>
              </div>
            </div>

            {/* Timer de descanso ativo */}
            {timerSeconds !== null && (
              <div className="bg-slate-900 text-white px-4 py-2.5 rounded-2xl flex items-center gap-3 border border-slate-700 shadow-sm">
                <Timer className="w-5 h-5 text-indigo-400 animate-spin" />
                <div>
                  <div className="text-[10px] uppercase text-slate-400 font-bold">Descanso Ativo</div>
                  <div className="text-lg font-black font-mono text-emerald-400">{timerSeconds}s</div>
                </div>
                <button
                  onClick={() => {
                    setTimerSeconds(null);
                  }}
                  className="text-xs text-slate-400 hover:text-white underline ml-2"
                >
                  Fechar
                </button>
              </div>
            )}
          </div>

          {/* Lista de Exercícios com Ordem Neural */}
          <div className="space-y-4">
            {currentSession.exercises.map((exercise) => (
              <div
                key={exercise.exercise_id}
                className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm hover:border-indigo-100 hover:shadow-md transition-all duration-200"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 font-bold flex items-center justify-center shrink-0 text-base">
                      {exercise.exercise_order}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 uppercase">
                          {MOVEMENT_LABELS[exercise.movement_pattern] || exercise.movement_pattern}
                        </span>
                        {exercise.warmup_sets > 0 && (
                          <span className="text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md font-medium">
                            {exercise.warmup_sets} aquecimento
                          </span>
                        )}
                      </div>
                      <h3 className="text-lg font-bold text-slate-900 mt-1">{exercise.exercise_name}</h3>
                      {exercise.notes && (
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2 max-w-xl">{exercise.notes}</p>
                      )}
                    </div>
                  </div>

                  {/* Parâmetros Biomecânicos Prescritos */}
                  <div className="flex flex-wrap items-center gap-2 sm:gap-4 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                    <div className="text-center px-2">
                      <div className="text-[10px] uppercase font-bold text-slate-400">Séries</div>
                      <div className="text-base font-black text-slate-800">{exercise.prescribed_sets}</div>
                    </div>
                    <div className="w-px h-6 bg-slate-200" />
                    <div className="text-center px-2">
                      <div className="text-[10px] uppercase font-bold text-slate-400">Faixa Reps</div>
                      <div className="text-base font-black text-indigo-600">
                        {exercise.min_reps}–{exercise.max_reps}
                      </div>
                    </div>
                    <div className="w-px h-6 bg-slate-200" />
                    <div className="text-center px-2">
                      <div className="text-[10px] uppercase font-bold text-slate-400">Reserva</div>
                      <div className="text-base font-black text-emerald-600">{exercise.target_rir ?? 2}</div>
                    </div>
                    <div className="w-px h-6 bg-slate-200" />
                    <button
                      onClick={() => startRestTimer(exercise.rest_seconds)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-indigo-50 hover:border-indigo-200 text-xs font-bold text-slate-700 transition"
                      title="Iniciar cronômetro de descanso"
                    >
                      <Timer className="w-3.5 h-3.5 text-indigo-600" />
                      {exercise.rest_seconds}s
                    </button>
                  </div>
                </div>

                {/* Ações Rápidas: Registrar Carga / Trocar Exercício */}
                <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-xs">
                  <button
                    onClick={() => handleOpenSubstitutions(exercise)}
                    className="text-slate-500 hover:text-indigo-600 font-semibold flex items-center gap-1 transition"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Trocar exercício (Substituição Inteligente)
                  </button>

                  <button
                    onClick={() => {
                      setLoggingExercise(exercise);
                      setLogFeedback(null);
                    }}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2 rounded-xl transition flex items-center gap-1.5 shadow-sm shadow-indigo-600/20"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Registrar Série / Carga
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Modal / Gaveta de Registro de Execução */}
      {loggingExercise && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-slate-100 space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">
                  Registro de Execução
                </span>
                <h3 className="text-xl font-bold text-slate-900 mt-1">{loggingExercise.exercise_name}</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Meta: {loggingExercise.prescribed_sets} séries de {loggingExercise.min_reps} a {loggingExercise.max_reps} repetições ({loggingExercise.target_rir} na reserva)
                </p>
              </div>
              <button
                onClick={() => setLoggingExercise(null)}
                className="text-slate-400 hover:text-slate-600 p-1 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            {logFeedback && (
              <div
                className={`p-3.5 rounded-2xl text-xs font-medium ${
                  logFeedback.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}
              >
                {logFeedback.message}
              </div>
            )}

            <form onSubmit={handleSubmitLog} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Nº da Série</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={logForm.set_number}
                    onChange={(e) => setLogForm({ ...logForm, set_number: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 font-bold text-slate-800"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Carga Utilizada (kg)</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={logForm.weight_kg}
                    onChange={(e) => setLogForm({ ...logForm, weight_kg: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 font-bold text-slate-800"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Reps Concluídas</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={logForm.reps_completed}
                    onChange={(e) => setLogForm({ ...logForm, reps_completed: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 font-bold text-indigo-600"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Repetições que sobraram</label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={logForm.actual_rir}
                    onChange={(e) => setLogForm({ ...logForm, actual_rir: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 font-bold text-slate-800"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setLoggingExercise(null)}
                  className="w-1/2 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 transition text-sm"
                >
                  Fechar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingLog}
                  className="w-1/2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition text-sm shadow-md shadow-indigo-600/20 disabled:opacity-50"
                >
                  {isSubmittingLog ? 'Salvando...' : 'Salvar Série'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Substituições de Exercício */}
      {activeExercise && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl border border-slate-100 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">
                  Troca Inteligente
                </span>
                <h3 className="text-xl font-bold text-slate-900 mt-1">
                  Alternativas para {activeExercise.exercise_name}
                </h3>
              </div>
              <button
                onClick={() => setActiveExercise(null)}
                className="text-slate-400 hover:text-slate-600 p-1 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            {isLoadingSubstitutions ? (
              <div className="py-12 text-center text-slate-400 font-medium">
                <RefreshCw className="w-8 h-8 mx-auto animate-spin mb-2 text-indigo-500" />
                Buscando alternativas biomecânicas compatíveis...
              </div>
            ) : substitutionOptions.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-sm">
                Nenhum exercício alternativo com os mesmos equipamentos e requisitos foi encontrado.
              </div>
            ) : (
              <div className="space-y-3">
                {substitutionOptions.map((opt) => (
                  <div
                    key={opt.exercise_id}
                    className="p-4 rounded-2xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/40 transition flex items-center justify-between"
                  >
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm">{opt.exercise_name}</h4>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Padrão: <span className="font-semibold text-slate-700">{MOVEMENT_LABELS[opt.movement_pattern] || opt.movement_pattern}</span> •{' '}
                        Equipamento: <span className="font-semibold text-slate-700">{opt.required_equipment.map((item) => EQUIPMENT_LABELS[item] || item).join(', ')}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                          {opt.compatibility_score}% compatível
                        </span>
                        {opt.reason_codes.map((r) => (
                          <span key={r} className="text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                            {r}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
