import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { MOTIVOS, type Lancamento } from '../lib/types'

const LABEL_STATUS: Record<string, string> = {
  pendente: 'Pendente',
  aprovado: 'Aprovado',
  recusado: 'Recusado',
}

export default function CoordenadorPage() {
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [processando, setProcessando] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<'pendente' | 'todos'>('pendente')

  async function carregar() {
    setCarregando(true)
    setErro(null)
    let query = supabase
      .from('lancamentos')
      .select('*, colaboradores(nome_completo, matricula)')
      .order('data_hora_extra', { ascending: false })

    if (filtro === 'pendente') query = query.eq('status', 'pendente')

    const { data, error } = await query
    if (error) setErro(error.message)
    else setLancamentos(data as unknown as Lancamento[])
    setCarregando(false)
  }

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtro])

  async function decidir(id: string, novoStatus: 'aprovado' | 'recusado') {
    setProcessando(id)
    setErro(null)
    const { error } = await supabase.from('lancamentos').update({ status: novoStatus }).eq('id', id)
    if (error) setErro(error.message)
    setProcessando(null)
    carregar()
  }

  return (
    <div className="pagina">
      <section className="cartao">
        <div className="cartao-titulo">
          <h2>Lançamentos da equipe</h2>
          <select value={filtro} onChange={(e) => setFiltro(e.target.value as any)}>
            <option value="pendente">Só pendentes</option>
            <option value="todos">Todos</option>
          </select>
        </div>

        {erro && <p className="erro">{erro}</p>}

        {carregando ? (
          <p>Carregando…</p>
        ) : lancamentos.length === 0 ? (
          <p>Nenhum lançamento encontrado.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Colaborador</th>
                <th>Data</th>
                <th>Horário</th>
                <th>Motivo</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lancamentos.map((l) => (
                <tr key={l.id}>
                  <td>{l.colaboradores?.nome_completo ?? '—'}</td>
                  <td>{l.data_hora_extra}</td>
                  <td>
                    {l.hora_entrada}–{l.hora_saida}
                  </td>
                  <td>
                    {MOTIVOS.find((m) => m.value === l.motivo)?.label ?? l.motivo}
                    {l.motivo === 'outro' && l.motivo_outro_texto ? ` (${l.motivo_outro_texto})` : ''}
                  </td>
                  <td>
                    <span className={`status status-${l.status}`}>{LABEL_STATUS[l.status]}</span>
                  </td>
                  <td>
                    {l.status === 'pendente' && (
                      <div className="acoes">
                        <button
                          className="btn-aprovar"
                          disabled={processando === l.id}
                          onClick={() => decidir(l.id, 'aprovado')}
                        >
                          Aprovar
                        </button>
                        <button
                          className="btn-recusar"
                          disabled={processando === l.id}
                          onClick={() => decidir(l.id, 'recusado')}
                        >
                          Recusar
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
