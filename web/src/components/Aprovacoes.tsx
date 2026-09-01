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

interface AcaoAberta {
  ids: string[]
  tipo: 'aprovado' | 'recusado'
  emLote: boolean
}

export default function Aprovacoes() {
  const { perfil } = useAuth()
  const isRh = perfil?.perfil === 'rh'

  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [processando, setProcessando] = useState(false)
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [acaoAberta, setAcaoAberta] = useState<AcaoAberta | null>(null)
  const [motivoTexto, setMotivoTexto] = useState('')

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
    setAcaoAberta(null)
    setMotivoTexto('')
    carregar()
  }

  function precisaMotivo(tipo: 'aprovado' | 'recusado') {
    return tipo === 'recusado' || isRh
  }

  function clicarAprovar(id: string) {
    if (precisaMotivo('aprovado')) {
      setMotivoTexto('')
      setAcaoAberta({ ids: [id], tipo: 'aprovado', emLote: false })
    } else {
      decidir([id], 'aprovado', null)
    }
  }

  function clicarRecusar(id: string) {
    setMotivoTexto('')
    setAcaoAberta({ ids: [id], tipo: 'recusado', emLote: false })
  }

  function clicarAprovarLote() {
    if (selecionados.size === 0) return
    if (precisaMotivo('aprovado')) {
      setMotivoTexto('')
      setAcaoAberta({ ids: Array.from(selecionados), tipo: 'aprovado', emLote: true })
    } else {
      decidir(Array.from(selecionados), 'aprovado', null)
    }
  }

  function confirmarAcaoAberta() {
    if (!acaoAberta) return
    if (motivoTexto.trim().length === 0) return
    decidir(acaoAberta.ids, acaoAberta.tipo, motivoTexto.trim())
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
          <button className="btn-aprovar" onClick={clicarAprovarLote} disabled={processando}>
            Aprovar {selecionados.size} selecionado(s)
          </button>
        )}
      </div>

      <p className="nota">
        Fila da mais antiga para a mais nova. Itens parados há mais de 3 dias aparecem destacados.
        {isRh && ' Como RH, sua decisão pede um motivo — fica registrado que foi você quem decidiu.'}
      </p>

      {erro && <p className="erro">{erro}</p>}

      {acaoAberta?.emLote && (
        <div className="form-motivo">
          <label>
            Motivo da aprovação em lote de {acaoAberta.ids.length} lançamento(s) (obrigatório)
            <textarea
              value={motivoTexto}
              onChange={(e) => setMotivoTexto(e.target.value)}
              rows={2}
              autoFocus
            />
          </label>
          <div className="acoes">
            <button className="btn-aprovar" disabled={processando || motivoTexto.trim().length === 0} onClick={confirmarAcaoAberta}>
              Confirmar
            </button>
            <button onClick={() => setAcaoAberta(null)}>Cancelar</button>
          </div>
        </div>
      )}

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
            const formAberto = acaoAberta && !acaoAberta.emLote && acaoAberta.ids[0] === l.id
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

                  {formAberto && (
                    <div className="form-motivo">
                      <label>
                        {acaoAberta!.tipo === 'recusado'
                          ? 'Justificativa da recusa (obrigatória)'
                          : 'Motivo da aprovação pelo RH (obrigatório)'}
                        <textarea
                          value={motivoTexto}
                          onChange={(e) => setMotivoTexto(e.target.value)}
                          rows={2}
                          autoFocus
                        />
                      </label>
                      <div className="acoes">
                        <button
                          className={acaoAberta!.tipo === 'recusado' ? 'btn-recusar' : 'btn-aprovar'}
                          disabled={processando || motivoTexto.trim().length === 0}
                          onClick={confirmarAcaoAberta}
                        >
                          Confirmar
                        </button>
                        <button onClick={() => setAcaoAberta(null)}>Cancelar</button>
                      </div>
                    </div>
                  )}
                </div>
                {!formAberto && (
                  <div className="acoes">
                    <button className="btn-aprovar" disabled={processando} onClick={() => clicarAprovar(l.id)}>
                      Aprovar
                    </button>
                    <button className="btn-recusar" disabled={processando} onClick={() => clicarRecusar(l.id)}>
                      Recusar
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
