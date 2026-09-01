import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { MOTIVOS, type Lancamento } from '../lib/types'
import { calcularPrazo, podeLancarData, formatarDuracao, type PrazoLancamento } from '../lib/prazo'

const TEXTO_ACEITE =
  'Declaro que as informações acima são verdadeiras e que a hora extra foi efetivamente realizada.'
const VERSAO_TEXTO_ACEITE = 'v2'

const LABEL_STATUS: Record<string, string> = {
  pendente: 'Pendente',
  aprovado: 'Aprovado',
  recusado: 'Recusado',
}

export default function ColaboradorPage() {
  const { session, perfil } = useAuth()
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [confirmacao, setConfirmacao] = useState<Lancamento | null>(null)

  const [feriados, setFeriados] = useState<string[]>([])
  const [prazo, setPrazo] = useState<PrazoLancamento | null>(null)

  const [data, setData] = useState('')
  const [horaEntrada, setHoraEntrada] = useState('')
  const [horaSaida, setHoraSaida] = useState('')
  const [motivo, setMotivo] = useState('')
  const [motivoOutro, setMotivoOutro] = useState('')
  const [destino, setDestino] = useState<'banco_horas' | 'folha'>('banco_horas')
  const [aceite, setAceite] = useState(false)

  async function carregarLancamentos() {
    setCarregando(true)
    const { data: rows, error } = await supabase
      .from('lancamentos')
      .select('*')
      .order('data_hora_extra', { ascending: false })
    if (error) setErro(error.message)
    else setLancamentos(rows as Lancamento[])
    setCarregando(false)
  }

  useEffect(() => {
    carregarLancamentos()
    supabase
      .from('feriados')
      .select('data')
      .then(({ data: rows }) => {
        const lista = (rows ?? []).map((r: { data: string }) => r.data)
        setFeriados(lista)
        setPrazo(calcularPrazo(lista))
      })
  }, [])

  function mensagemErroServidor(msg: string): string {
    if (msg.includes('data futura')) return 'A data não pode ser futura.'
    if (msg.includes('prazo')) return 'O prazo para lançar esta hora extra já encerrou — procure o RH.'
    if (msg.includes('duplicate key') || msg.includes('idx_lancamentos_sem_duplicidade')) {
      return 'Você já lançou uma hora extra com essa data e esse horário.'
    }
    return msg
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setErro(null)

    if (!perfil || !session) return
    if (!aceite) {
      setErro('É preciso aceitar a declaração antes de enviar.')
      return
    }
    if (motivo === 'outro' && motivoOutro.trim().length === 0) {
      setErro('Descreva o motivo quando escolher "Outro".')
      return
    }
    if (!podeLancarData(data, feriados)) {
      setErro('O prazo para lançar esta hora extra já encerrou — procure o RH.')
      return
    }

    setEnviando(true)

    const { data: novoLancamento, error: erroInsert } = await supabase
      .from('lancamentos')
      .insert({
        colaborador_id: perfil.id,
        data_hora_extra: data,
        hora_entrada: horaEntrada,
        hora_saida: horaSaida,
        motivo,
        motivo_outro_texto: motivo === 'outro' ? motivoOutro.trim() : null,
        destino,
        origem: 'colaborador',
      })
      .select()
      .single()

    if (erroInsert || !novoLancamento) {
      setErro(mensagemErroServidor(erroInsert?.message ?? 'Erro ao enviar lançamento.'))
      setEnviando(false)
      return
    }

    const { error: erroAceite } = await supabase.from('aceites').insert({
      lancamento_id: novoLancamento.id,
      texto_aceito: TEXTO_ACEITE,
      versao_texto: VERSAO_TEXTO_ACEITE,
      user_id: session.user.id,
    })

    if (erroAceite) {
      setErro('Lançamento enviado, mas houve um erro ao registrar o aceite: ' + erroAceite.message)
    } else {
      setConfirmacao(novoLancamento as Lancamento)
    }

    setData('')
    setHoraEntrada('')
    setHoraSaida('')
    setMotivo('')
    setMotivoOutro('')
    setDestino('banco_horas')
    setAceite(false)
    setEnviando(false)
    carregarLancamentos()
  }

  if (confirmacao) {
    return (
      <div className="pagina">
        <section className="cartao cartao-confirmacao">
          <h2>Lançamento enviado ✓</h2>
          <p className="subtitulo">Fica pendente até a aprovação do coordenador ou do RH.</p>
          <dl className="resumo">
            <dt>Data</dt>
            <dd>{confirmacao.data_hora_extra}</dd>
            <dt>Horário</dt>
            <dd>
              {confirmacao.hora_entrada}–{confirmacao.hora_saida}
            </dd>
            <dt>Duração</dt>
            <dd>{formatarDuracao(confirmacao.duracao_calculada)}</dd>
            <dt>Motivo</dt>
            <dd>{MOTIVOS.find((m) => m.value === confirmacao.motivo)?.label ?? confirmacao.motivo}</dd>
            <dt>Destino</dt>
            <dd>{confirmacao.destino === 'banco_horas' ? 'Banco de horas' : 'Folha de pagamento'}</dd>
          </dl>
          <button onClick={() => setConfirmacao(null)}>Lançar outra hora extra</button>
        </section>
      </div>
    )
  }

  return (
    <div className="pagina">
      <section className="cartao">
        <h2>Lançar hora extra</h2>
        {prazo && <p className="nota-prazo">{prazo.textoPrazo}</p>}
        <form onSubmit={handleSubmit} className="form-grid">
          <label>
            Data
            <input
              type="date"
              value={data}
              min={prazo?.min}
              max={prazo?.max}
              onChange={(e) => setData(e.target.value)}
              required
            />
          </label>
          <label>
            Hora de entrada
            <input
              type="time"
              value={horaEntrada}
              onChange={(e) => setHoraEntrada(e.target.value)}
              required
            />
          </label>
          <label>
            Hora de saída
            <input
              type="time"
              value={horaSaida}
              onChange={(e) => setHoraSaida(e.target.value)}
              required
            />
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
            <label className="span-2">
              Descreva o motivo
              <input
                type="text"
                value={motivoOutro}
                onChange={(e) => setMotivoOutro(e.target.value)}
                required
              />
            </label>
          )}
          <label>
            Destino
            <select value={destino} onChange={(e) => setDestino(e.target.value as any)}>
              <option value="banco_horas">Banco de horas</option>
              <option value="folha">Folha de pagamento</option>
            </select>
          </label>

          <label className="checkbox span-2">
            <input type="checkbox" checked={aceite} onChange={(e) => setAceite(e.target.checked)} />
            {TEXTO_ACEITE}
          </label>

          {erro && <p className="erro span-2">{erro}</p>}

          <button type="submit" className="span-2" disabled={enviando}>
            {enviando ? 'Enviando…' : 'Enviar lançamento'}
          </button>
        </form>
      </section>

      <section className="cartao">
        <h2>Meus lançamentos</h2>
        {carregando ? (
          <p>Carregando…</p>
        ) : lancamentos.length === 0 ? (
          <p>Nenhum lançamento ainda.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Horário</th>
                <th>Duração</th>
                <th>Motivo</th>
                <th>Destino</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {lancamentos.map((l) => (
                <tr key={l.id}>
                  <td>{l.data_hora_extra}</td>
                  <td>
                    {l.hora_entrada}–{l.hora_saida}
                  </td>
                  <td>{formatarDuracao(l.duracao_calculada)}</td>
                  <td>{MOTIVOS.find((m) => m.value === l.motivo)?.label ?? l.motivo}</td>
                  <td>{l.destino === 'banco_horas' ? 'Banco de horas' : 'Folha'}</td>
                  <td>
                    <span className={`status status-${l.status}`}>{LABEL_STATUS[l.status]}</span>
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
