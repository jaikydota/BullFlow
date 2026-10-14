import { adminFormPost, adminRequest } from '@/lib/api/client'
import type { Invoice } from '@/lib/types'

function normalizeInvoice(row: Partial<Invoice>): Invoice {
  return {
    id: String(row.id ?? ''),
    orderNo: row.orderNo ?? undefined,
    tenantName: row.tenantName ?? undefined,
    status: (row.status as Invoice['status']) ?? 'pending',
    titleType: (row.titleType as Invoice['titleType']) ?? 'personal',
    title: row.title ?? '',
    taxNo: row.taxNo ?? null,
    invoiceKind: (row.invoiceKind as Invoice['invoiceKind']) ?? 'normal',
    regAddress: row.regAddress ?? null,
    regPhone: row.regPhone ?? null,
    bankName: row.bankName ?? null,
    bankAccount: row.bankAccount ?? null,
    email: row.email ?? null,
    amount: typeof row.amount === 'number' ? row.amount : 0,
    invoiceNo: row.invoiceNo ?? null,
    invoiceFileUrl: row.invoiceFileUrl ?? null,
    issuedAt: row.issuedAt ?? null,
    rejectReason: row.rejectReason ?? null,
    createdAt: row.createdAt ?? null,
  }
}

export async function fetchInvoiceList(params: {
  page: number
  page_size: number
  status?: string
  search?: string
}): Promise<{ items: Invoice[]; total: number; pages: number }> {
  const sp = new URLSearchParams()
  sp.set('page', String(params.page))
  sp.set('page_size', String(params.page_size))
  if (params.status) sp.set('status', params.status)
  if (params.search) sp.set('search', params.search)
  const raw = await adminRequest<{ items: Partial<Invoice>[]; total: number; pages: number }>(
    `/admin/invoices?${sp.toString()}`,
  )
  return { ...raw, items: (raw.items ?? []).map(normalizeInvoice) }
}

/** 开票：回填发票号 + 上传的发票文件 URL，置 issued 并通知用户。 */
export async function issueInvoiceApi(
  invoiceId: string,
  body: { invoice_no: string; invoice_file_url: string | null },
): Promise<Invoice> {
  const data = await adminRequest<{ invoice: Invoice }>(
    `/admin/invoices/${encodeURIComponent(invoiceId)}/issue`,
    { method: 'POST', json: body },
  )
  return normalizeInvoice(data.invoice)
}

/** 驳回开票申请：置 rejected 并通知用户。 */
export async function rejectInvoiceApi(invoiceId: string, reason: string): Promise<Invoice> {
  const data = await adminRequest<{ invoice: Invoice }>(
    `/admin/invoices/${encodeURIComponent(invoiceId)}/reject`,
    { method: 'POST', json: { reason } },
  )
  return normalizeInvoice(data.invoice)
}

/** 上传发票文件（图片或 PDF）到 MinIO，返回公开 URL。 */
export async function uploadInvoiceFileApi(file: File): Promise<{ url: string; filename: string }> {
  const fd = new FormData()
  fd.append('file', file)
  return adminFormPost<{ url: string; filename: string }>('/admin/uploads/file', fd)
}
