'use client';

import Link from 'next/link';
import { FormEvent, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, KeyRound, Package, XCircle } from 'lucide-react';
import { grantEntitlementAction, revokeEntitlementAction } from '@/app/actions/entitlements';
import { ProductCatalogItem, UserEntitlement } from '@/types/entitlements';

export function AdminProductsClient({ data, initialError }: {
  data: { products: ProductCatalogItem[]; entitlements: UserEntitlement[] }; initialError?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState(initialError ?? '');

  const grant = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await grantEntitlementAction({
        patient_id: form.get('patient_id'), product_code: form.get('product_code'),
        external_reference: form.get('external_reference'), valid_until: form.get('valid_until') || undefined,
      });
      setMessage(result.success ? 'Acesso concedido.' : result.error ?? 'Falha na concessão.');
      if (result.success) router.refresh();
    });
  };

  const revoke = (id: string) => startTransition(async () => {
    const result = await revokeEntitlementAction({ entitlement_id: id, reason: 'Revogação administrativa' });
    setMessage(result.success ? 'Acesso revogado.' : result.error ?? 'Falha na revogação.');
    if (result.success) router.refresh();
  });

  return <main className="min-h-screen bg-zinc-950 text-white"><div className="mx-auto max-w-6xl space-y-7 px-4 py-8 sm:px-6">
    <header className="flex items-start gap-4 border-b border-zinc-800 pb-6"><Link href="/admin" className="rounded-lg border border-zinc-800 p-2 text-zinc-400"><ArrowLeft className="h-5 w-5" /></Link><div><div className="text-xs font-bold uppercase text-rose-400">Governança de acesso</div><h1 className="mt-1 text-2xl font-bold">Produtos e entitlements</h1><p className="mt-1 text-sm text-zinc-400">Direitos efetivos são concedidos pelo servidor e guardam um snapshot dos recursos.</p></div></header>
    {message && <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-3 text-sm">{message}</div>}
    <section className="grid gap-4 md:grid-cols-2">{data.products.map((product) => <div key={product.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5"><div className="flex items-center gap-2"><Package className="h-4 w-4 text-emerald-400" /><h2 className="font-bold">{product.name}</h2></div><p className="mt-2 text-xs text-zinc-500">{product.description}</p><div className="mt-4 flex flex-wrap gap-2">{product.features.map((feature) => <span key={feature} className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300">{feature}</span>)}</div></div>)}</section>
    <form onSubmit={grant} className="grid gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 md:grid-cols-4"><label className="text-xs text-zinc-400">ID do paciente<input required name="patient_id" className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 text-white" /></label><label className="text-xs text-zinc-400">Produto<select name="product_code" className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 text-white">{data.products.map((product) => <option key={product.id} value={product.code}>{product.name}</option>)}</select></label><label className="text-xs text-zinc-400">Referência idempotente<input required name="external_reference" placeholder="contrato-123" className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 text-white" /></label><button disabled={pending} className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-500 text-sm font-bold text-zinc-950"><KeyRound className="h-4 w-4" /> Conceder</button></form>
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6"><h2 className="font-bold">Concessões recentes</h2><div className="mt-4 space-y-2">{data.entitlements.slice(0, 50).map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950/50 p-3"><div><div className="text-sm font-medium">{item.patient_name ?? item.patient_id}</div><div className="text-xs text-zinc-500">{item.product_name} · {item.source} · {item.status}</div></div>{item.status === 'active' && item.source !== 'system' && <button onClick={() => revoke(item.id)} disabled={pending} className="inline-flex items-center gap-1 text-xs text-red-400"><XCircle className="h-4 w-4" /> Revogar</button>}</div>)}</div></section>
  </div></main>;
}
