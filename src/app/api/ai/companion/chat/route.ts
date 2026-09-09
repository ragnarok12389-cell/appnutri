import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ChatRequestSchema } from '@/types/ai-companion';
import { getAIProvider } from '@/lib/ai-companion/provider';
import { AICompanionOrchestrator } from '@/lib/ai-companion/orchestrator';
import { SupabaseContextDataSource, SupabaseToolDataServices } from '@/lib/ai-companion/supabase-service';
import { AIRateLimiter, SupabaseRateLimitStore } from '@/lib/ai-companion/rate-limiter';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const json = await req.json();
    const parsed = ChatRequestSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dados da requisição inválidos', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();
    let conversationId = parsed.data.conversation_id;

    if (conversationId) {
      const { data: ownedConversation, error: conversationError } = await adminClient
        .from('ai_conversations')
        .select('id')
        .eq('id', conversationId)
        .eq('patient_id', user.id)
        .maybeSingle();

      if (conversationError || !ownedConversation) {
        return NextResponse.json({ error: 'Conversa não encontrada para este paciente' }, { status: 404 });
      }
    }

    // Se não informou conversa, busca conversa ativa recente ou cria uma nova
    if (!conversationId) {
      const { data: existingConv } = await adminClient
        .from('ai_conversations')
        .select('id')
        .eq('patient_id', user.id)
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (existingConv) {
        conversationId = existingConv.id;
      } else {
        const { data: newConv, error: convError } = await adminClient
          .from('ai_conversations')
          .insert({
            patient_id: user.id,
            title: 'Conversa com Assistente',
            is_active: true,
          })
          .select('id')
          .single();

        if (convError || !newConv) {
          return NextResponse.json(
            { error: 'Erro ao inicializar conversa do assistente' },
            { status: 500 }
          );
        }
        conversationId = newConv.id;
      }
    }

    const orchestrator = new AICompanionOrchestrator({
      provider: getAIProvider(),
      contextDataSource: new SupabaseContextDataSource(),
      rateLimiter: new AIRateLimiter(new SupabaseRateLimitStore(adminClient)),
      toolDataServices: new SupabaseToolDataServices(),
      messageStore: {
        async saveMessage(msg) {
          const { data, error } = await adminClient
            .from('ai_messages')
            .insert({
              conversation_id: msg.conversation_id,
              patient_id: msg.patient_id,
              role: msg.role,
              content: msg.content,
              tool_calls: msg.tool_calls,
              tool_call_id: msg.tool_call_id,
              safety_flags: msg.safety_flags ?? [],
            })
            .select('id')
            .single();
          if (error || !data) {
            throw new Error(`Falha ao persistir mensagem do Companion: ${error?.message ?? 'registro ausente'}`);
          }
          return data.id;
        },
        async recordToolExecution(exec) {
          const { data, error } = await adminClient
            .from('ai_tool_executions')
            .insert(exec)
            .select('id')
            .single();
          if (error || !data) {
            throw new Error(`Falha ao auditar ferramenta do Companion: ${error?.message ?? 'registro ausente'}`);
          }
          return data.id;
        },
      },
    });

    const result = await orchestrator.processMessage({
      patientId: user.id,
      conversationId: conversationId!,
      userMessage: parsed.data.message,
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Erro interno no servidor';
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
