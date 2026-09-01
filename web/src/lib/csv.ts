export function formatarDataBR(isoDate: string): string {
  const [ano, mes, dia] = isoDate.split('-')
  if (!ano || !mes || !dia) return isoDate
  return `${dia}/${mes}/${ano}`
}

export function abrirPdf(titulo: string, colunas: string[], linhas: (string | number)[][]) {
  const janela = window.open('', '_blank')
  if (!janela) return
  const linhasHtml = linhas
    .map((l) => `<tr>${l.map((c) => `<td>${c}</td>`).join('')}</tr>`)
    .join('')
  const cabecalhoHtml = colunas.map((c) => `<th>${c}</th>`).join('')
  janela.document.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${titulo}</title>
        <style>
          body { font-family: system-ui, sans-serif; padding: 24px; color: #1f2328; }
          h1 { font-size: 1.1rem; }
          table { width: 100%; border-collapse: collapse; font-size: 0.82rem; margin-top: 12px; }
          th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid #ddd; }
          th { background: #f5f6f8; }
        </style>
      </head>
      <body>
        <h1>${titulo}</h1>
        <p>Gerado em ${new Date().toLocaleString('pt-BR')}</p>
        <table>
          <thead><tr>${cabecalhoHtml}</tr></thead>
          <tbody>${linhasHtml}</tbody>
        </table>
        <script>window.onload = () => window.print();</script>
      </body>
    </html>
  `)
  janela.document.close()
}

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
