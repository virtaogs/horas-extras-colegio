import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabaseClient'
import { baixarCsv, abrirPdf, formatarDataBR } from '../lib/csv'
import { formatarDuracao, intervaloParaHoras } from '../lib/prazo'
import Aprovacoes from '../components/Aprovacoes'
import {
  MOTIVOS,
  type Coordenador,
  type Colaborador,
  type Lancamento,
  type IndicadorExcesso,
} from '../lib/types'

const ABAS = ['aprovacoes', 'lancamentos', 'colaboradores', 'coordenadores', 'indicador', 'feriados'] as const
type Aba = (typeof ABAS)[number]

const LABEL_ABA: Record<Aba, string> = {
  aprovacoes: 'Aprovações',
  lancamentos: 'Lançamentos',
  colaboradores: 'Colaboradores',
  coordenadores: 'Coordenadores',
  indicador: 'Indicador de excesso',
  feriados: 'Feriados',
}

export default function RHPage() {
  const [aba, setAba] = useState<Aba>('aprovacoes')

  return (
    <div className="pagina">
      <nav className="abas">
        {ABAS.map((a) => (
          <button key={a} className={a === aba ? 'aba-ativa' : ''} onClick={() => setAba(a)}>
            {LABEL_ABA[a]}
          </button>
        ))}
      </nav>

      {aba === 'aprovacoes' && <Aprovacoes />}
      {aba === 'lancamentos' && <AbaLancamentos />}
      {aba === 'colaboradores' && <AbaColaboradores />}
      {aba === 'coordenadores' && <AbaCoordenadores />}
      {aba === 'indicador' && <AbaIndicador />}
      {aba === 'feriados' && <AbaFeriados />}
    </div>
  )
}

const LABEL_STATUS: Record<string, string> = {
  pendente: 'Pendente',
  aprovado: 'Aprovado',
  recusado: 'Recusado',
}

function AbaLancamentos() {
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [modo, setModo] = useState<'lista' | 'agrupado'>('lista')

  const mesAtual = new Date().toISOString().slice(0, 7)
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'pendente' | 'aprovado' | 'recusado'>('todos')
  const [filtroMes, setFiltroMes] = useState(mesAtual)
  const [filtroColaboradorId, setFiltroColaboradorId] = useState('')
  const [filtroSetor, setFiltroSetor] = useState('')

  async function carregar() {
    setCarregando(true)
    let query = supabase
      .from('lancamentos')
      .select('*, colaboradores(nome_completo, matricula, setor)')
      .order('data_hora_extra', { ascending: false })
    if (filtroStatus !== 'todos') query = query.eq('status', filtroStatus)
    if (filtroColaboradorId) query = query.eq('colaborador_id', filtroColaboradorId)
    if (filtroMes) {
      const inicio = `${filtroMes}-01`
      const [ano, mes] = filtroMes.split('-').map(Number)
      const proximo = mes === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mes + 1).padStart(2, '0')}-01`
      query = query.gte('data_hora_extra', inicio).lt('data_hora_extra', proximo)
    }
    const { data, error } = await query
    if (error) setErro(error.message)
    else setLancamentos(data as unknown as Lancamento[])
    setCarregando(false)
  }

  useEffect(() => {
    carregar()
    supabase
      .from('colaboradores')
      .select('*')
      .eq('ativo', true)
      .order('nome_completo')
      .then(({ data }) => setColaboradores((data as Colaborador[]) ?? []))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroStatus, filtroColaboradorId, filtroMes])

  const visiveis = useMemo(
    () => (filtroSetor ? lancamentos.filter((l) => l.colaboradores?.setor === filtroSetor) : lancamentos),
    [lancamentos, filtroSetor],
  )

  const setores = ['Bosque', 'Horto']

  const totalizadores = useMemo(() => {
    const aprovados = visiveis.filter((l) => l.status === 'aprovado')
    const totalHoras = aprovados.reduce((s, l) => s + intervaloParaHoras(l.duracao_calculada), 0)
    const pendentes = visiveis.filter((l) => l.status === 'pendente').length
    const porColaborador = new Map<string, { nome: string; horas: number }>()
    for (const l of aprovados) {
      const nome = l.colaboradores?.nome_completo ?? '—'
      const atual = porColaborador.get(l.colaborador_id) ?? { nome, horas: 0 }
      atual.horas += intervaloParaHoras(l.duracao_calculada)
      porColaborador.set(l.colaborador_id, atual)
    }
    let quemMaisLancou: { nome: string; horas: number } | null = null
    for (const v of porColaborador.values()) {
      if (!quemMaisLancou || v.horas > quemMaisLancou.horas) quemMaisLancou = v
    }
    return { totalHoras, pendentes, quemMaisLancou }
  }, [visiveis])

  const agrupado = useMemo(() => {
    const mapa = new Map<
      string,
      { nome: string; matricula: string; horasAprovadas: number; qtdLancamentos: number; qtdPendentes: number }
    >()
    for (const l of visiveis) {
      const atual = mapa.get(l.colaborador_id) ?? {
        nome: l.colaboradores?.nome_completo ?? '—',
        matricula: l.colaboradores?.matricula ?? '—',
        horasAprovadas: 0,
        qtdLancamentos: 0,
        qtdPendentes: 0,
      }
      atual.qtdLancamentos += 1
      if (l.status === 'aprovado') atual.horasAprovadas += intervaloParaHoras(l.duracao_calculada)
      if (l.status === 'pendente') atual.qtdPendentes += 1
      mapa.set(l.colaborador_id, atual)
    }
    return Array.from(mapa.values()).sort((a, b) => b.horasAprovadas - a.horasAprovadas)
  }, [visiveis])

  async function decidir(id: string, novoStatus: 'aprovado' | 'recusado' | 'pendente') {
    let motivo: string | null = null
    if (novoStatus === 'aprovado' || novoStatus === 'recusado') {
      motivo = window.prompt(
        `Motivo para marcar como ${novoStatus === 'aprovado' ? 'aprovado' : 'recusado'} (obrigatório, você é RH):`,
      )
      if (!motivo || motivo.trim().length === 0) return
    }
    const { error } = await supabase
      .from('lancamentos')
      .update({ status: novoStatus, motivo_decisao: motivo })
      .eq('id', id)
    if (error) setErro(error.message)
    carregar()
  }

  function linhasParaExportar() {
    return visiveis.map((l) => ({
      colaborador: l.colaboradores?.nome_completo ?? '',
      matricula: l.colaboradores?.matricula ?? '',
      setor: l.colaboradores?.setor ?? '',
      data: l.data_hora_extra,
      entrada: l.hora_entrada,
      saida: l.hora_saida,
      duracao: formatarDuracao(l.duracao_calculada),
      motivo: l.motivo,
      destino: l.destino === 'banco_horas' ? 'banco_horas' : 'folha',
      status: l.status,
      origem: l.origem,
    }))
  }

  function exportarCsv() {
    baixarCsv(`lancamentos_${filtroMes}.csv`, linhasParaExportar())
  }

  function exportarPdf() {
    abrirPdf(
      `Lançamentos — ${filtroMes}`,
      ['Colaborador', 'Matrícula', 'Unidade', 'Data', 'Entrada', 'Saída', 'Duração', 'Destino', 'Status'],
      visiveis.map((l) => [
        l.colaboradores?.nome_completo ?? '',
        l.colaboradores?.matricula ?? '',
        l.colaboradores?.setor ?? '',
        formatarDataBR(l.data_hora_extra),
        l.hora_entrada,
        l.hora_saida,
        formatarDuracao(l.duracao_calculada),
        l.destino === 'banco_horas' ? 'Banco de horas' : 'Folha',
        LABEL_STATUS[l.status],
      ]),
    )
  }

  return (
    <div className="cartao">
      <div className="cartao-titulo">
        <h2>Lançamentos</h2>
        <div className="acoes">
          <button onClick={exportarCsv}>Exportar CSV</button>
          <button onClick={exportarPdf}>Exportar PDF</button>
          <button onClick={() => setMostrarForm((v) => !v)}>
            {mostrarForm ? 'Cancelar' : '+ Inclusão manual'}
          </button>
        </div>
      </div>

      <div className="filtros">
        <label>
          Período
          <input type="month" value={filtroMes} onChange={(e) => setFiltroMes(e.target.value)} />
        </label>
        <label>
          Pessoa
          <select value={filtroColaboradorId} onChange={(e) => setFiltroColaboradorId(e.target.value)}>
            <option value="">Todas</option>
            {colaboradores.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome_completo}
              </option>
            ))}
          </select>
        </label>
        <label>
          Unidade
          <select value={filtroSetor} onChange={(e) => setFiltroSetor(e.target.value)}>
            <option value="">Todos</option>
            {setores.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value as any)}>
            <option value="todos">Todos</option>
            <option value="pendente">Pendentes</option>
            <option value="aprovado">Aprovados</option>
            <option value="recusado">Recusados</option>
          </select>
        </label>
      </div>

      <div className="totalizadores">
        <div className="totalizador">
          <span className="totalizador-valor">{totalizadores.totalHoras.toFixed(1)}h</span>
          <span className="totalizador-label">total aprovado no período</span>
        </div>
        <div className="totalizador">
          <span className="totalizador-valor">{totalizadores.quemMaisLancou?.nome ?? '—'}</span>
          <span className="totalizador-label">
            quem mais lançou{totalizadores.quemMaisLancou ? ` (${totalizadores.quemMaisLancou.horas.toFixed(1)}h)` : ''}
          </span>
        </div>
        <div className="totalizador">
          <span className="totalizador-valor">{totalizadores.pendentes}</span>
          <span className="totalizador-label">pendentes no período</span>
        </div>
      </div>

      {mostrarForm && (
        <FormInclusaoManual
          colaboradores={colaboradores}
          onSalvo={() => {
            setMostrarForm(false)
            carregar()
          }}
        />
      )}

      {erro && <p className="erro">{erro}</p>}

      <div className="abas abas-secundarias">
        <button className={modo === 'lista' ? 'aba-ativa' : ''} onClick={() => setModo('lista')}>
          Lista
        </button>
        <button className={modo === 'agrupado' ? 'aba-ativa' : ''} onClick={() => setModo('agrupado')}>
          Agrupado por colaborador
        </button>
      </div>

      {carregando ? (
        <p>Carregando…</p>
      ) : modo === 'agrupado' ? (
        agrupado.length === 0 ? (
          <p>Nenhum lançamento no período.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Colaborador</th>
                <th>Matrícula</th>
                <th>Total aprovado</th>
                <th>Lançamentos</th>
                <th>Pendentes</th>
              </tr>
            </thead>
            <tbody>
              {agrupado.map((c) => (
                <tr key={c.matricula}>
                  <td>{c.nome}</td>
                  <td>{c.matricula}</td>
                  <td>{c.horasAprovadas.toFixed(1)}h</td>
                  <td>{c.qtdLancamentos}</td>
                  <td>{c.qtdPendentes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : visiveis.length === 0 ? (
        <p>Nenhum lançamento no período.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Colaborador</th>
              <th>Data</th>
              <th>Horário</th>
              <th>Duração</th>
              <th>Destino</th>
              <th>Origem</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((l) => (
              <tr key={l.id}>
                <td>{l.colaboradores?.nome_completo ?? '—'}</td>
                <td>{l.data_hora_extra}</td>
                <td>
                  {l.hora_entrada}–{l.hora_saida}
                </td>
                <td>{formatarDuracao(l.duracao_calculada)}</td>
                <td>{l.destino === 'banco_horas' ? 'Banco de horas' : 'Folha'}</td>
                <td title={l.justificativa_manual ?? undefined}>
                  {l.origem === 'colaborador' ? 'Colaborador' : 'RH (manual)'}
                </td>
                <td title={l.motivo_decisao ?? undefined}>
                  <span className={`status status-${l.status}`}>{LABEL_STATUS[l.status]}</span>
                  {l.decidido_por_perfil === 'rh' && l.status !== 'pendente' && (
                    <span className="badge-rh" title="Decidido pelo RH">
                      RH
                    </span>
                  )}
                </td>
                <td>
                  <div className="acoes">
                    {l.status === 'pendente' && (
                      <>
                        <button className="btn-aprovar" onClick={() => decidir(l.id, 'aprovado')}>
                          Aprovar
                        </button>
                        <button className="btn-recusar" onClick={() => decidir(l.id, 'recusado')}>
                          Recusar
                        </button>
                      </>
                    )}
                    {l.status !== 'pendente' && (
                      <select
                        className="corrigir-status"
                        value={l.status}
                        onChange={(e) => decidir(l.id, e.target.value as 'aprovado' | 'recusado' | 'pendente')}
                        title="Corrigir decisão (só o RH pode fazer isso)"
                      >
                        <option value="aprovado">Aprovado</option>
                        <option value="recusado">Recusado</option>
                        <option value="pendente">Voltar para pendente</option>
                      </select>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function FormInclusaoManual({
  colaboradores,
  onSalvo,
}: {
  colaboradores: Colaborador[]
  onSalvo: () => void
}) {
  const [colaboradorId, setColaboradorId] = useState('')
  const [data, setData] = useState('')
  const [horaEntrada, setHoraEntrada] = useState('')
  const [horaSaida, setHoraSaida] = useState('')
  const [motivo, setMotivo] = useState('')
  const [motivoOutro, setMotivoOutro] = useState('')
  const [destino, setDestino] = useState<'banco_horas' | 'folha'>('banco_horas')
  const [justificativa, setJustificativa] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    if (justificativa.trim().length === 0) {
      setErro('A justificativa é obrigatória em inclusão manual.')
      return
    }
    setEnviando(true)
    const { error } = await supabase.from('lancamentos').insert({
      colaborador_id: colaboradorId,
      data_hora_extra: data,
      hora_entrada: horaEntrada,
      hora_saida: horaSaida,
      motivo,
      motivo_outro_texto: motivo === 'outro' ? motivoOutro.trim() : null,
      destino,
      origem: 'rh_manual',
      justificativa_manual: justificativa.trim(),
    })
    setEnviando(false)
    if (error) {
      setErro(error.message)
      return
    }
    onSalvo()
  }

  return (
    <form onSubmit={handleSubmit} className="form-grid form-inclusao">
      <label>
        Colaborador
        <select value={colaboradorId} onChange={(e) => setColaboradorId(e.target.value)} required>
          <option value="" disabled>
            Selecione…
          </option>
          {colaboradores.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome_completo} ({c.matricula})
            </option>
          ))}
        </select>
      </label>
      <label>
        Data
        <input type="date" value={data} onChange={(e) => setData(e.target.value)} required />
      </label>
      <label>
        Entrada
        <input type="time" value={horaEntrada} onChange={(e) => setHoraEntrada(e.target.value)} required />
      </label>
      <label>
        Saída
        <input type="time" value={horaSaida} onChange={(e) => setHoraSaida(e.target.value)} required />
      </label>
      <label>
        Motivo
        <select value={motivo} onChange={(e) => setMotivo(e.target.value)} required>
          <option value="" disabled>
            Selecione…
          </option>
          {MOTIVOS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      {motivo === 'outro' && (
        <label>
          Descreva
          <input type="text" value={motivoOutro} onChange={(e) => setMotivoOutro(e.target.value)} required />
        </label>
      )}
      <label>
        Destino
        <select value={destino} onChange={(e) => setDestino(e.target.value as any)}>
          <option value="banco_horas">Banco de horas</option>
          <option value="folha">Folha de pagamento</option>
        </select>
      </label>
      <label className="span-2">
        Justificativa (obrigatória para inclusão manual)
        <input
          type="text"
          value={justificativa}
          onChange={(e) => setJustificativa(e.target.value)}
          placeholder="Por que este lançamento está sendo incluído manualmente"
          required
        />
      </label>

      {erro && <p className="erro span-2">{erro}</p>}

      <button type="submit" disabled={enviando}>
        {enviando ? 'Salvando…' : 'Salvar lançamento'}
      </button>
    </form>
  )
}

function AbaColaboradores() {
  const [lista, setLista] = useState<Colaborador[]>([])
  const [coordenadores, setCoordenadores] = useState<Coordenador[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [mostrarForm, setMostrarForm] = useState(false)

  async function carregar() {
    setCarregando(true)
    const [colabs, coords] = await Promise.all([
      supabase.from('colaboradores').select('*').order('nome_completo'),
      supabase.from('coordenadores').select('*').eq('ativo', true),
    ])
    if (colabs.error) setErro(colabs.error.message)
    else setLista(colabs.data as Colaborador[])
    setCoordenadores((coords.data as Coordenador[]) ?? [])
    setCarregando(false)
  }

  useEffect(() => {
    carregar()
  }, [])

  async function alternarAtivo(c: Colaborador) {
    const { error } = await supabase
      .from('colaboradores')
      .update({ ativo: !c.ativo })
      .eq('id', c.id)
    if (error) setErro(error.message)
    carregar()
  }

  return (
    <div className="cartao">
      <div className="cartao-titulo">
        <h2>Colaboradores</h2>
        <button onClick={() => setMostrarForm((v) => !v)}>
          {mostrarForm ? 'Cancelar' : '+ Novo colaborador'}
        </button>
      </div>

      {mostrarForm && (
        <FormColaborador
          coordenadores={coordenadores}
          onSalvo={() => {
            setMostrarForm(false)
            carregar()
          }}
        />
      )}

      {erro && <p className="erro">{erro}</p>}

      {carregando ? (
        <p>Carregando…</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Matrícula</th>
              <th>Cargo</th>
              <th>Unidade</th>
              <th>Coordenador</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lista.map((c) => (
              <tr key={c.id}>
                <td>{c.nome_completo}</td>
                <td>{c.matricula}</td>
                <td>{c.cargo}</td>
                <td>{c.setor}</td>
                <td>{coordenadores.find((k) => k.id === c.coordenador_id)?.nome ?? '—'}</td>
                <td>{c.ativo ? 'Ativo' : 'Inativo'}</td>
                <td>
                  <button onClick={() => alternarAtivo(c)}>
                    {c.ativo ? 'Inativar' : 'Reativar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="nota">
        Cadastro aqui não cria login. Para o colaborador acessar o sistema, crie o usuário em
        Authentication → Users no painel do Supabase e depois vincule o UUID gerado na coluna
        <code> user_id</code> desta tabela.
      </p>

      <ExpurgoAnonimizacao />
    </div>
  )
}

function ExpurgoAnonimizacao() {
  const [anos, setAnos] = useState(5)
  const [candidatos, setCandidatos] = useState<
    { colaborador_id: string; nome_anterior: string; matricula_anterior: string; ultima_atividade: string }[]
  >(null as any)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [mensagem, setMensagem] = useState<string | null>(null)

  async function simular() {
    setCarregando(true)
    setErro(null)
    setMensagem(null)
    const { data, error } = await supabase.rpc('anonimizar_colaboradores_antigos', {
      p_anos_retencao: anos,
      p_somente_simular: true,
    })
    setCarregando(false)
    if (error) setErro(error.message)
    else setCandidatos(data ?? [])
  }

  async function confirmar() {
    if (!confirm(`Confirma a anonimização de ${candidatos?.length ?? 0} colaborador(es) inativo(s)? Essa ação não pode ser desfeita.`)) {
      return
    }
    setCarregando(true)
    setErro(null)
    const { error } = await supabase.rpc('anonimizar_colaboradores_antigos', {
      p_anos_retencao: anos,
      p_somente_simular: false,
    })
    setCarregando(false)
    if (error) {
      setErro(error.message)
      return
    }
    setMensagem('Anonimização concluída.')
    setCandidatos(null as any)
  }

  return (
    <div className="expurgo">
      <h3>Expurgo / anonimização de ex-colaboradores</h3>
      <p className="nota">
        Afeta só colaboradores <strong>inativos</strong> sem atividade há mais que o prazo abaixo. Mantém
        os lançamentos (para obrigação legal), remove nome/matrícula/login. Não pode ser desfeito.
      </p>
      <div className="acoes">
        <label className="inline">
          Prazo de retenção (anos)
          <input type="number" min={1} value={anos} onChange={(e) => setAnos(Number(e.target.value))} style={{ width: 60 }} />
        </label>
        <button onClick={simular} disabled={carregando}>
          {carregando ? 'Verificando…' : 'Verificar quem seria afetado'}
        </button>
      </div>

      {erro && <p className="erro">{erro}</p>}
      {mensagem && <p className="sucesso">{mensagem}</p>}

      {candidatos && (
        candidatos.length === 0 ? (
          <p>Nenhum colaborador inativo passou do prazo.</p>
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Matrícula</th>
                  <th>Última atividade</th>
                </tr>
              </thead>
              <tbody>
                {candidatos.map((c) => (
                  <tr key={c.colaborador_id}>
                    <td>{c.nome_anterior}</td>
                    <td>{c.matricula_anterior}</td>
                    <td>{formatarDataBR(c.ultima_atividade)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="btn-recusar" onClick={confirmar} disabled={carregando}>
              Confirmar anonimização
            </button>
          </>
        )
      )}
    </div>
  )
}

function FormColaborador({
  coordenadores,
  onSalvo,
}: {
  coordenadores: Coordenador[]
  onSalvo: () => void
}) {
  const [nome, setNome] = useState('')
  const [matricula, setMatricula] = useState('')
  const [cargo, setCargo] = useState('')
  const [setor, setSetor] = useState('')
  const [coordenadorId, setCoordenadorId] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    setEnviando(true)
    const { error } = await supabase.from('colaboradores').insert({
      nome_completo: nome,
      matricula,
      cargo: cargo || null,
      setor: setor || null,
      coordenador_id: coordenadorId || null,
    })
    setEnviando(false)
    if (error) {
      setErro(error.message)
      return
    }
    onSalvo()
  }

  return (
    <form onSubmit={handleSubmit} className="form-grid form-inclusao">
      <label>
        Nome completo
        <input value={nome} onChange={(e) => setNome(e.target.value)} required />
      </label>
      <label>
        Matrícula
        <input value={matricula} onChange={(e) => setMatricula(e.target.value)} required />
      </label>
      <label>
        Cargo
        <input value={cargo} onChange={(e) => setCargo(e.target.value)} />
      </label>
      <label>
        Unidade
        <input value={setor} onChange={(e) => setSetor(e.target.value)} />
      </label>
      <label>
        Coordenador
        <select value={coordenadorId} onChange={(e) => setCoordenadorId(e.target.value)}>
          <option value="">Sem coordenador</option>
          {coordenadores.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </label>

      {erro && <p className="erro span-2">{erro}</p>}

      <button type="submit" disabled={enviando}>
        {enviando ? 'Salvando…' : 'Salvar colaborador'}
      </button>
    </form>
  )
}

function AbaCoordenadores() {
  const [lista, setLista] = useState<Coordenador[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [nome, setNome] = useState('')
  const [setor, setSetor] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function carregar() {
    setCarregando(true)
    const { data, error } = await supabase.from('coordenadores').select('*').order('nome')
    if (error) setErro(error.message)
    else setLista(data as Coordenador[])
    setCarregando(false)
  }

  useEffect(() => {
    carregar()
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setEnviando(true)
    const { error } = await supabase.from('coordenadores').insert({ nome, setor: setor || null })
    setEnviando(false)
    if (error) {
      setErro(error.message)
      return
    }
    setNome('')
    setSetor('')
    setMostrarForm(false)
    carregar()
  }

  async function alternarAtivo(c: Coordenador) {
    await supabase.from('coordenadores').update({ ativo: !c.ativo }).eq('id', c.id)
    carregar()
  }

  return (
    <div className="cartao">
      <div className="cartao-titulo">
        <h2>Coordenadores</h2>
        <button onClick={() => setMostrarForm((v) => !v)}>
          {mostrarForm ? 'Cancelar' : '+ Novo coordenador'}
        </button>
      </div>

      {mostrarForm && (
        <form onSubmit={handleSubmit} className="form-grid form-inclusao">
          <label>
            Nome
            <input value={nome} onChange={(e) => setNome(e.target.value)} required />
          </label>
          <label>
            Unidade
            <input value={setor} onChange={(e) => setSetor(e.target.value)} />
          </label>
          <button type="submit" disabled={enviando}>
            {enviando ? 'Salvando…' : 'Salvar'}
          </button>
        </form>
      )}

      {erro && <p className="erro">{erro}</p>}

      {carregando ? (
        <p>Carregando…</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Unidade</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lista.map((c) => (
              <tr key={c.id}>
                <td>{c.nome}</td>
                <td>{c.setor}</td>
                <td>{c.ativo ? 'Ativo' : 'Inativo'}</td>
                <td>
                  <button onClick={() => alternarAtivo(c)}>{c.ativo ? 'Inativar' : 'Reativar'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="nota">
        Assim como colaborador, o cadastro aqui não cria login — vincule depois pela coluna
        <code> user_id</code>.
      </p>
    </div>
  )
}

function AbaIndicador() {
  const [linhas, setLinhas] = useState<IndicadorExcesso[]>([])
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function consultar() {
    setCarregando(true)
    setErro(null)
    const { data, error } = await supabase.rpc('rh_indicador_excesso_jornada')
    if (error) setErro(error.message)
    else setLinhas((data as IndicadorExcesso[]) ?? [])
    setCarregando(false)
  }

  useEffect(() => {
    consultar()
  }, [])

  return (
    <div className="cartao">
      <div className="cartao-titulo">
        <h2>Indicador de excesso de jornada</h2>
        <button onClick={consultar}>Atualizar</button>
      </div>

      <p className="nota">
        Marca quando o lançamento do dia passa de 2h ou o acumulado do mês passa de 20h. Considera só
        lançamentos aprovados. Visível exclusivamente para o RH — colaborador e coordenador não têm
        acesso a este dado em nenhuma tela, exportação ou resposta de API.
      </p>

      {erro && <p className="erro">{erro}</p>}

      {carregando ? (
        <p>Carregando…</p>
      ) : linhas.length === 0 ? (
        <p>Nenhum excesso encontrado.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Colaborador</th>
              <th>Matrícula</th>
              <th>Data</th>
              <th>Horas no dia</th>
              <th>Horas no mês</th>
              <th>Excesso</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => (
              <tr key={i}>
                <td>{l.nome_completo}</td>
                <td>{l.matricula}</td>
                <td>{formatarDataBR(l.data_hora_extra)}</td>
                <td>{l.horas_no_dia}h</td>
                <td>{l.horas_no_mes}h</td>
                <td>
                  {l.excesso_diario && <span className="status status-recusado">Dia</span>}{' '}
                  {l.excesso_mensal && <span className="status status-recusado">Mês</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function AbaFeriados() {
  const [lista, setLista] = useState<{ id: string; data: string; descricao: string }[]>([])
  const [data, setData] = useState('')
  const [descricao, setDescricao] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)

  async function carregar() {
    setCarregando(true)
    const { data: rows, error } = await supabase.from('feriados').select('*').order('data')
    if (error) setErro(error.message)
    else setLista(rows as any[])
    setCarregando(false)
  }

  useEffect(() => {
    carregar()
  }, [])

  async function adicionar(e: FormEvent) {
    e.preventDefault()
    const { error } = await supabase.from('feriados').insert({ data, descricao })
    if (error) {
      setErro(error.message)
      return
    }
    setData('')
    setDescricao('')
    carregar()
  }

  async function remover(id: string) {
    await supabase.from('feriados').delete().eq('id', id)
    carregar()
  }

  return (
    <div className="cartao">
      <h2>Feriados</h2>

      <form onSubmit={adicionar} className="form-grid form-inclusao">
        <label>
          Data
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} required />
        </label>
        <label>
          Descrição
          <input value={descricao} onChange={(e) => setDescricao(e.target.value)} required />
        </label>
        <button type="submit">Adicionar</button>
      </form>

      {erro && <p className="erro">{erro}</p>}

      {carregando ? (
        <p>Carregando…</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Descrição</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lista.map((f) => (
              <tr key={f.id}>
                <td>{formatarDataBR(f.data)}</td>
                <td>{f.descricao}</td>
                <td>
                  <button onClick={() => remover(f.id)}>Remover</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
