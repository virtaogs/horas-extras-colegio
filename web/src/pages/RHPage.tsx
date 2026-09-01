import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabaseClient'
import { baixarCsv, formatarDataBR } from '../lib/csv'
import {
  MOTIVOS,
  type Coordenador,
  type Colaborador,
  type Lancamento,
  type IndicadorExcesso,
} from '../lib/types'

const ABAS = ['lancamentos', 'colaboradores', 'coordenadores', 'indicador', 'feriados'] as const
type Aba = (typeof ABAS)[number]

const LABEL_ABA: Record<Aba, string> = {
  lancamentos: 'Lançamentos',
  colaboradores: 'Colaboradores',
  coordenadores: 'Coordenadores',
  indicador: 'Indicador de excesso',
  feriados: 'Feriados',
}

export default function RHPage() {
  const [aba, setAba] = useState<Aba>('lancamentos')

  return (
    <div className="pagina">
      <nav className="abas">
        {ABAS.map((a) => (
          <button key={a} className={a === aba ? 'aba-ativa' : ''} onClick={() => setAba(a)}>
            {LABEL_ABA[a]}
          </button>
        ))}
      </nav>

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
  const [filtro, setFiltro] = useState<'todos' | 'pendente' | 'aprovado' | 'recusado'>('todos')
  const [mostrarForm, setMostrarForm] = useState(false)

  async function carregar() {
    setCarregando(true)
    let query = supabase
      .from('lancamentos')
      .select('*, colaboradores(nome_completo, matricula)')
      .order('data_hora_extra', { ascending: false })
    if (filtro !== 'todos') query = query.eq('status', filtro)
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
      .then(({ data }) => setColaboradores((data as Colaborador[]) ?? []))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtro])

  async function decidir(id: string, novoStatus: 'aprovado' | 'recusado' | 'pendente') {
    const { error } = await supabase.from('lancamentos').update({ status: novoStatus }).eq('id', id)
    if (error) setErro(error.message)
    carregar()
  }

  function exportar() {
    baixarCsv(
      'lancamentos.csv',
      lancamentos.map((l) => ({
        colaborador: l.colaboradores?.nome_completo ?? '',
        matricula: l.colaboradores?.matricula ?? '',
        data: l.data_hora_extra,
        entrada: l.hora_entrada,
        saida: l.hora_saida,
        motivo: l.motivo,
        destino: l.destino,
        status: l.status,
        origem: l.origem,
      })),
    )
  }

  return (
    <div className="cartao">
      <div className="cartao-titulo">
        <h2>Todos os lançamentos</h2>
        <div className="acoes">
          <select value={filtro} onChange={(e) => setFiltro(e.target.value as any)}>
            <option value="todos">Todos</option>
            <option value="pendente">Pendentes</option>
            <option value="aprovado">Aprovados</option>
            <option value="recusado">Recusados</option>
          </select>
          <button onClick={exportar}>Exportar CSV</button>
          <button onClick={() => setMostrarForm((v) => !v)}>
            {mostrarForm ? 'Cancelar' : '+ Inclusão manual'}
          </button>
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

      {carregando ? (
        <p>Carregando…</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Colaborador</th>
              <th>Data</th>
              <th>Horário</th>
              <th>Motivo</th>
              <th>Destino</th>
              <th>Origem</th>
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
                <td>{MOTIVOS.find((m) => m.value === l.motivo)?.label ?? l.motivo}</td>
                <td>{l.destino === 'banco_horas' ? 'Banco de horas' : 'Folha'}</td>
                <td>{l.origem === 'colaborador' ? 'Colaborador' : 'RH (manual)'}</td>
                <td>
                  <span className={`status status-${l.status}`}>{LABEL_STATUS[l.status]}</span>
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
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setErro(null)
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
              <th>Setor</th>
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
        Setor
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
            Setor
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
              <th>Setor</th>
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
  const [limite, setLimite] = useState(50)
  const [linhas, setLinhas] = useState<IndicadorExcesso[]>([])
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function consultar() {
    setCarregando(true)
    setErro(null)
    const { data, error } = await supabase.rpc('rh_indicador_excesso_jornada', {
      p_limite_horas_mes: limite,
    })
    if (error) setErro(error.message)
    else setLinhas((data as IndicadorExcesso[]) ?? [])
    setCarregando(false)
  }

  useEffect(() => {
    consultar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="cartao">
      <div className="cartao-titulo">
        <h2>Indicador de excesso de jornada</h2>
        <div className="acoes">
          <label className="inline">
            Limite (h/mês)
            <input
              type="number"
              value={limite}
              min={1}
              onChange={(e) => setLimite(Number(e.target.value))}
              style={{ width: 70 }}
            />
          </label>
          <button onClick={consultar}>Atualizar</button>
        </div>
      </div>

      <p className="nota">Considera apenas lançamentos aprovados. Visível somente para o RH.</p>

      {erro && <p className="erro">{erro}</p>}

      {carregando ? (
        <p>Carregando…</p>
      ) : linhas.length === 0 ? (
        <p>Nenhum dado para o período.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Colaborador</th>
              <th>Matrícula</th>
              <th>Mês</th>
              <th>Total (h)</th>
              <th>Excesso</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => (
              <tr key={i}>
                <td>{l.nome_completo}</td>
                <td>{l.matricula}</td>
                <td>{l.mes_referencia}</td>
                <td>{l.total_horas_mes}</td>
                <td>{l.excesso ? <span className="status status-recusado">Sim</span> : 'Não'}</td>
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
