import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ConfirmActionRequestSchema } from '@/types/ai-companion';
import { executeAITool } from '@/lib/ai-companion/tools';
import { SupabaseToolDataServices } from '@/lib/ai-companion/supabase-service';

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
    const parsed = ConfirmActionRequestSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dados da requisição inválidos', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();
    const { conversation_id, confirmation_token, decision } = parsed.data;

    if (decision === 'cancel') {
      await adminClient
        .from('ai_tool_executions')
        .update({ confirmation_status: 'cancelled', execution_status: 'failed' })
        .eq('confirmation_token', confirmation_token)
        .eq('patient_id', user.id);

      return NextResponse.json({
        success: true,
        message: 'Ação de substituição cancelada com sucesso.',
        status: 'cancelled',
      });
    }

    // Decisão: 'confirm'
    const toolServices = new SupabaseToolDataServices();
    const executionResult = await executeAITool(
      'applyAuthorizedFoodSubstitution',
      { confirmation_token },
      {
        patientId: user.id,
        conversationId: conversation_id,
        dataServices: toolServices,
      }
    );

    if (!executionResult.is_authorized || executionResult.error) {
      return NextResponse.json(
        {
          success: false,
          error: executionResult.error ?? executionResult.authorization_denial_reason,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Substituição confirmada e aplicada com sucesso ao seu plano.',
      output: executionResult.output,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Erro interno ao processar confirmação';
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
