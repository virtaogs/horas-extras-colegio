import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { MOTIVOS, type Lancamento } from '../lib/types'
import { formatarDuracao } from '../lib/prazo'
import { formatarDataBR } from '../lib/csv'

function diasParado(enviadoEm: string): number {
  const inicio = new Date(enviadoEm).getTime()
  const agora = Date.now()
  return Math.floor((agora - inicio) / 86400000)
}

export default function Aprovacoes() {
  const { perfil } = useAuth()
  const isRh = perfil?.perfil === 'rh'

  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [processando, setProcessando] = useState(false)
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())

  async function carregar() {
    setCarregando(true)
    setErro(null)
    const { data, error } = await supabase
      .from('lancamentos')
      .select('*, colaboradores(nome_completo, matricula, setor), aceites(texto_aceito, versao_texto, aceito_em)')
      .eq('status', 'pendente')
      .order('enviado_em', { ascending: true })
    if (error) setErro(error.message)
    else setLancamentos((data as unknown as Lancamento[]) ?? [])
    setSelecionados(new Set())
    setCarregando(false)
  }

  useEffect(() => {
    carregar()
  }, [])

  const contador = lancamentos.length

  async function decidir(ids: string[], novoStatus: 'aprovado' | 'recusado', motivo: string | null) {
    setProcessando(true)
    setErro(null)
    const { error } = await supabase
      .from('lancamentos')
      .update({ status: novoStatus, motivo_decisao: motivo })
      .in('id', ids)
    setProcessando(false)
    if (error) {
      setErro(error.message)
      return
    }
    carregar()
  }

  function aprovarUm(id: string) {
    let motivo: string | null = null
    if (isRh) {
      motivo = window.prompt('Motivo da aprovação pelo RH (obrigatório):')
      if (!motivo || motivo.trim().length === 0) return
    }
    decidir([id], 'aprovado', motivo)
  }

  function recusarUm(id: string) {
    const motivo = window.prompt('Justificativa da recusa (obrigatória):')
    if (!motivo || motivo.trim().length === 0) return
    decidir([id], 'recusado', motivo)
  }

  function aprovarLote() {
    if (selecionados.size === 0) return
    let motivo: string | null = null
    if (isRh) {
      motivo = window.prompt(`Motivo da aprovação em lote de ${selecionados.size} lançamento(s) pelo RH (obrigatório):`)
      if (!motivo || motivo.trim().length === 0) return
    }
    decidir(Array.from(selecionados), 'aprovado', motivo)
  }

  function alternarSelecao(id: string) {
    setSelecionados((atual) => {
      const novo = new Set(atual)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })
  }

  const ordenados = useMemo(() => lancamentos, [lancamentos])

  return (
    <div className="cartao">
      <div className="cartao-titulo">
        <h2>
          Aprovações <span className="contador-pendentes">{contador}</span>
        </h2>
        {selecionados.size > 0 && (
          <button className="btn-aprovar" onClick={aprovarLote} disabled={processando}>
            Aprovar {selecionados.size} selecionado(s)
          </button>
        )}
      </div>

      <p className="nota">
        Fila da mais antiga para a mais nova. Itens parados há mais de 3 dias aparecem destacados.
        {isRh && ' Como RH, sua decisão pede um motivo — fica registrado que foi você quem decidiu.'}
      </p>

      {erro && <p className="erro">{erro}</p>}

      {carregando ? (
        <p>Carregando…</p>
      ) : ordenados.length === 0 ? (
        <p>Nenhum lançamento pendente. 🎉</p>
      ) : (
        <div className="fila-aprovacoes">
          {ordenados.map((l) => {
            const parado = diasParado(l.enviado_em)
            const atrasado = parado > 3
            const aceite = l.aceites?.[0]
            return (
              <div key={l.id} className={`item-aprovacao ${atrasado ? 'item-atrasado' : ''}`}>
                <input
                  type="checkbox"
                  checked={selecionados.has(l.id)}
                  onChange={() => alternarSelecao(l.id)}
                />
                <div className="item-aprovacao-corpo">
                  <div className="item-aprovacao-topo">
                    <strong>{l.colaboradores?.nome_completo ?? '—'}</strong>
                    <span className={`badge-dias ${atrasado ? 'badge-dias-atrasado' : ''}`}>
                      {parado === 0 ? 'hoje' : parado === 1 ? '1 dia parado' : `${parado} dias parado`}
                    </span>
                  </div>
                  <div className="item-aprovacao-detalhes">
                    {formatarDataBR(l.data_hora_extra)} · {l.hora_entrada}–{l.hora_saida} ·{' '}
                    {formatarDuracao(l.duracao_calculada)} ·{' '}
                    {MOTIVOS.find((m) => m.value === l.motivo)?.label ?? l.motivo}
                    {l.motivo === 'outro' && l.motivo_outro_texto ? ` (${l.motivo_outro_texto})` : ''}
                  </div>
                  <div className="item-aprovacao-aceite">
                    {aceite
                      ? `Aceite registrado em ${new Date(aceite.aceito_em).toLocaleString('pt-BR')} (${aceite.versao_texto}): "${aceite.texto_aceito}"`
                      : 'Sem aceite registrado (inclusão manual do RH).'}
                  </div>
                </div>
                <div className="acoes">
                  <button className="btn-aprovar" disabled={processando} onClick={() => aprovarUm(l.id)}>
                    Aprovar
                  </button>
                  <button className="btn-recusar" disabled={processando} onClick={() => recusarUm(l.id)}>
                    Recusar
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
