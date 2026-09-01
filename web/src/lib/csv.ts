export function baixarCsv(nomeArquivo: string, linhas: Record<string, string | number | null>[]) {
  if (linhas.length === 0) return
  const colunas = Object.keys(linhas[0])
  const escapar = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const corpo = linhas.map((l) => colunas.map((c) => escapar(l[c])).join(',')).join('\n')
  const csv = colunas.join(',') + '\n' + corpo
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeArquivo
  a.click()
  URL.revokeObjectURL(url)
}
